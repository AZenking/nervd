import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchRuleTemplate } from '@/types';
import { BranchTemplatesManager } from './BranchTemplatesManager';

vi.mock('@/store/app', () => ({
  useApp: () => ({
    settings: { workitemRepoBranchTemplates: {} },
    setToast: vi.fn(),
  }),
}));

const threeNodeTemplate: BranchRuleTemplate = {
  id: 'tpl-iter',
  name: '局点专版',
  sourceBranch: 'master',
  baselineBranchPattern: 'iteration/{iteration}/{track}',
  workitemBranchPattern: 'feature/{identifier}',
};

const directTemplate: BranchRuleTemplate = {
  id: 'tpl-direct',
  name: '标准主线直连',
  sourceBranch: 'master',
  baselineBranchPattern: 'master',
  workitemBranchPattern: 'feature/{identifier}',
};

describe('BranchTemplatesManager 交付轨道拓扑预览', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });

  const renderManager = async (templates: BranchRuleTemplate[], iterationName?: string) => {
    await act(() => {
      root.render(
        <BranchTemplatesManager
          templates={templates}
          onSaveTemplates={vi.fn()}
          scope="global"
          iterationName={iterationName}
        />,
      );
    });
  };

  const openDrawerByEdit = async () => {
    await act(async () => {
      const buttons = Array.from(host.querySelectorAll('button'));
      const edit = buttons.find((button) => button.textContent?.includes('编辑'));
      expect(edit).toBeTruthy();
      edit?.click();
    });
  };

  it('编辑三节点模板：抽屉内渲染拓扑图并按当前迭代名展开真实分支', async () => {
    await renderManager([threeNodeTemplate], 'Sprint-2026');
    await openDrawerByEdit();

    const diagram = document.body.querySelector('[data-testid="track-topology"]');
    expect(diagram?.getAttribute('data-form')).toBe('three-node');
    expect(diagram?.querySelector('[data-node="source"]')?.textContent).toContain('master');
    expect(diagram?.querySelector('[data-node="baseline"]')?.textContent).toContain('iteration/Sprint-2026/局点专版');
    expect(diagram?.querySelector('[data-node="development"]')?.textContent).toContain('feature/REQ-101');
    // 连线标签（派生基准/发布 MR）契约由 track-topology-diagram.test 的
    // buildTrackTopologyGraph 断言；jsdom 零尺寸下 ReactFlow 不渲染边标签
  });

  it('编辑直连模板：抽屉内拓扑自动切两节点形态', async () => {
    await renderManager([directTemplate], 'Sprint-2026');
    await openDrawerByEdit();

    const diagram = document.body.querySelector('[data-testid="track-topology"]');
    expect(diagram?.getAttribute('data-form')).toBe('direct');
    expect(diagram?.querySelector('[data-node="baseline"]')).toBeNull();
    expect(diagram?.textContent).toContain('直连主干');
    // 直接切出 连线契约由 track-topology-diagram.test 的 buildTrackTopologyGraph 断言
  });

  it('新增模板：默认草稿即渲染拓扑（迭代示例 Sprint-1、track 回退默认）', async () => {
    await renderManager([]);
    await act(async () => {
      const addButton = Array.from(host.querySelectorAll('button')).find(
        (button) => button.textContent?.includes('新增模板'),
      );
      expect(addButton).toBeTruthy();
      addButton?.click();
    });

    const diagram = document.body.querySelector('[data-testid="track-topology"]');
    expect(diagram?.getAttribute('data-form')).toBe('three-node');
    expect(diagram?.querySelector('[data-node="baseline"]')?.textContent).toContain('iteration/Sprint-1/默认');
    expect(diagram?.querySelector('[data-node="development"]')?.textContent).toContain('feature/REQ-101');
  });
});
