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

  it('模板列表项支持点击「拓扑图」按钮直接弹窗检视拓扑', async () => {
    await renderManager([threeNodeTemplate], 'Sprint-2026');

    const topoBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('拓扑图'),
    );
    expect(topoBtn).toBeTruthy();

    await act(async () => {
      topoBtn?.click();
    });

    expect(document.body.textContent).toContain('交付轨道分支拓扑');
    expect(document.body.textContent).toContain('局点专版');
    expect(document.body.textContent).toContain('master');
    expect(document.body.textContent).toContain('iteration/Sprint-2026/局点专版');
  });
});

describe('BranchTemplatesManager 面板布局与统一预览', () => {
  let host: HTMLDivElement;
  let root: Root;

  const setInput = async (index: number, value: string) => {
    await act(async () => {
      const inputs = [...document.body.querySelectorAll<HTMLInputElement>('[role="dialog"] input')];
      const input = inputs[index];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const previewText = () => {
    const surface = [...document.body.querySelectorAll<HTMLElement>('[data-slot="surface"]')]
      .find((element) => element.textContent?.includes('生成结果预览'));
    return surface?.textContent ?? '';
  };

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

  const openNewDrawer = async () => {
    await act(() => {
      root.render(
        <BranchTemplatesManager
          templates={[]}
          onSaveTemplates={vi.fn()}
          scope="global"
          iterationName="Sprint-2026"
        />,
      );
    });
    await act(async () => {
      const add = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('新增模板'));
      add?.click();
    });
  };

  it('新增抽屉：Fieldset 分组 + 唯一预览区 + 预设无 Emoji', async () => {
    await openNewDrawer();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toContain('基础信息');
    expect(bodyText).toContain('分支规则');
    expect(bodyText).toContain('生成结果预览');
    // 快速填充为纯文字（无 Emoji）
    expect(bodyText).toContain('单主干直连');
    expect(bodyText).toContain('迭代集成基线');
    expect(bodyText).toContain('现场局点');
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(bodyText)).toBe(false);
    // 预览区唯一
    const previews = [...document.body.querySelectorAll('[data-slot="surface"]')]
      .filter((element) => element.textContent?.includes('生成结果预览'));
    expect(previews).toHaveLength(1);
    // 字段级预览已移除
    expect(document.body.querySelector('[data-testid="branch-pattern-preview"]')).toBeNull();
  });

  it('模板名称 / 示例需求编号统一进入预览；源分支与基准同名时提示直连', async () => {
    await openNewDrawer();

    await setInput(0, 'A 局点');
    expect(previewText()).toContain('iteration/Sprint-2026/A-局点');

    await setInput(4, 'MANT-24');
    expect(previewText()).toContain('feature/MANT-24');

    // 源分支改成展开后的基准分支 → 单主干直连
    await setInput(1, 'iteration/Sprint-2026/A-局点');
    await act(async () => { await Promise.resolve(); });
    const text = previewText();
    expect(text).toContain('直接使用该分支，不创建迭代基准');
    // 基准节点不再重复出现
    expect(text).not.toContain('迭代基准iteration/Sprint-2026/A-局点');
  });

  it('迭代上下文缺失时在预览区明确提示，不伪装成真实分支', async () => {
    await act(() => {
      root.render(
        <BranchTemplatesManager
          templates={[]}
          onSaveTemplates={vi.fn()}
          scope="iteration"
          iterationId="it-1"
        />,
      );
    });
    await act(async () => {
      const add = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('新增模板'));
      add?.click();
    });
    expect(document.body.textContent).toContain('未获取到当前迭代上下文');
  });
});