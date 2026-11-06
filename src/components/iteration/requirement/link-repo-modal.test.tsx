import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoSummary } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import { LinkRepoModal, resolveTopologyPreviewContext } from './link-repo-modal';

const mockStore = {
  settings: { repoCiBindings: {}, jenkinsConnections: [] },
  pipelines: [],
  loadingPipelines: false,
  loadPipelines: vi.fn(),
  items: [
    { workitemId: 'wi-1', identifier: 'REQ-2026', sprintId: 'iter-1', sprintName: 'Sprint-2026' },
  ],
  children: [{ workitemId: 'wi-child', identifier: 'BUG-303' }],
  detail: null,
  selectedId: 'wi-1',
  iterations: [{ id: 'iter-1', name: 'Sprint-2026' }],
};

vi.mock('@/store/app', () => ({
  useApp: () => mockStore,
}));

const repositories: RepoSummary[] = [
  { id: 11, name: 'trade-service', pathWithNamespace: 'group/trade-service' },
];

const fusedTemplates: ScopedBranchRuleTemplate[] = [
  {
    id: 'tpl-site',
    name: '局点专版',
    sourceBranch: 'master',
    baselineBranchPattern: 'iteration/{iteration}/{track}',
    workitemBranchPattern: 'feature/{identifier}',
    scope: 'global',
  },
  {
    id: 'tpl-direct',
    name: '标准主线直连',
    sourceBranch: 'master',
    baselineBranchPattern: 'master',
    workitemBranchPattern: 'feature/{identifier}',
    scope: 'global',
  },
];

describe('resolveTopologyPreviewContext', () => {
  it('identifier 优先取选中工作项（workitemId 命中），迭代名按 iterationId 匹配', () => {
    const context = resolveTopologyPreviewContext({
      items: [{ workitemId: 'wi-1', identifier: 'REQ-2026' }],
      children: [],
      detail: null,
      selectedId: 'wi-1',
      iterations: [{ id: 'iter-1', name: 'Sprint-2026' }],
      iterationId: 'iter-1',
    });
    expect(context.identifier).toBe('REQ-2026');
    expect(context.iterationName).toBe('Sprint-2026');
  });

  it('列表未命中时回退子项与详情字段', () => {
    const fromChild = resolveTopologyPreviewContext({
      items: [],
      children: [{ workitemId: 'wi-child', identifier: 'BUG-303' }],
      detail: null,
      selectedId: 'wi-child',
      iterations: [],
    });
    expect(fromChild.identifier).toBe('BUG-303');

    const fromDetail = resolveTopologyPreviewContext({
      items: [],
      children: [],
      detail: { identifier: 'TASK-404' },
      selectedId: 'wi-x',
      iterations: [],
    });
    expect(fromDetail.identifier).toBe('TASK-404');
  });

  it('弹窗上下文缺失时回达示例值 REQ-101 / Sprint-1', () => {
    const context = resolveTopologyPreviewContext({
      items: [],
      children: [],
      detail: null,
      selectedId: null,
      iterations: [],
      iterationId: 'unknown',
    });
    expect(context.identifier).toBe('REQ-101');
    expect(context.iterationName).toBe('Sprint-1');
  });
});

describe('LinkRepoModal 分支链路预览', () => {
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

  const renderModal = async () => {
    await act(() => {
      root.render(
        <LinkRepoModal
          open
          onOpenChange={vi.fn()}
          repositories={repositories}
          effectiveRepoIds={[]}
          fusedTemplates={fusedTemplates}
          iterationId="iter-1"
          isRequirement
          savingRepos={false}
          recommendingRepos={false}
          recommendedRepos={[]}
          onRecommendRepos={vi.fn().mockResolvedValue(undefined)}
          onClearRecommendations={vi.fn()}
          onQuickLinkRepo={vi.fn().mockResolvedValue(undefined)}
          onLinkRepo={vi.fn().mockResolvedValue(true)}
        />,
      );
    });
  };

  /** 模板下拉选择：react-aria 按指针事件开合（jsdom 需显式派发 pointerdown/up + click） */
  const press = (el: Element) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
  };

  const selectTemplate = async (label: string) => {
    await act(async () => {
      const triggers = Array.from(document.body.querySelectorAll('button[aria-haspopup="listbox"]'));
      press(triggers[triggers.length - 1]);
    });
    await act(async () => {
      const option = Array.from(document.body.querySelectorAll('[role="option"]'))
        .find((node) => node.textContent?.includes(label));
      expect(option).toBeTruthy();
      option && press(option);
    });
  };

  it('未选择模板时不渲染链路预览', async () => {
    await renderModal();

    expect(document.body.querySelector('[data-testid="track-topology"]')).toBeNull();
  });

  it('选择三节点模板后渲染链路预览（identifier/迭代名取弹窗上下文）', async () => {
    await renderModal();
    await selectTemplate('局点专版');

    const diagram = document.body.querySelector('[data-testid="track-topology"]');
    expect(diagram).not.toBeNull();
    expect(diagram?.getAttribute('data-form')).toBe('three-node');
    expect(diagram?.querySelector('[data-node="baseline"]')?.textContent).toContain('iteration/Sprint-2026/局点专版');
    expect(diagram?.querySelector('[data-node="development"]')?.textContent).toContain('feature/REQ-2026');
    // 弹窗内为纯预览态：节点无状态光晕
    expect(diagram?.querySelector('[data-node="source"]')?.hasAttribute('data-state')).toBe(false);
  });

  it('选择直连模板后自动切两节点形态', async () => {
    await renderModal();
    await selectTemplate('标准主线直连');

    const diagram = document.body.querySelector('[data-testid="track-topology"]');
    expect(diagram?.getAttribute('data-form')).toBe('direct');
    expect(diagram?.querySelector('[data-node="baseline"]')).toBeNull();
    expect(diagram?.textContent).toContain('直连主干');
  });
});
