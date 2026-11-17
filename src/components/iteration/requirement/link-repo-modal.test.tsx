import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoSummary } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import {
  LinkRepoModal,
  REPO_OPTION_LIMIT,
  resolveTopologyPreviewContext,
  selectVisibleRepos,
} from './link-repo-modal';

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

  const renderModal = async (repos: RepoSummary[] = repositories) => {
    await act(() => {
      root.render(
        <LinkRepoModal
          open
          onOpenChange={vi.fn()}
          repositories={repos}
          effectiveRepoIds={[]}
          fusedTemplates={fusedTemplates}
          iterationId="iter-1"
          templatePickerEnabled
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

describe('selectVisibleRepos', () => {
  const makeRepos = (count: number): RepoSummary[] =>
    Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      name: `repo-${index}`,
      pathWithNamespace: `group/repo-${index}`,
    }));

  it('无输入时只取前 N 条并给出隐藏条数', () => {
    const { items, hiddenCount } = selectVisibleRepos(makeRepos(260), '', '', 100);
    expect(items).toHaveLength(100);
    expect(hiddenCount).toBe(160);
    expect(items[0].pathWithNamespace).toBe('group/repo-0');
  });

  it('有输入时交回全量集合（过滤由 ComboBox 负责）', () => {
    const { items, hiddenCount } = selectVisibleRepos(makeRepos(260), 'repo-25', '', 100);
    expect(items).toHaveLength(260);
    expect(hiddenCount).toBe(0);
  });

  it('已选仓库落在窗口外时补进列表，保证选中态回显', () => {
    const { items, hiddenCount } = selectVisibleRepos(makeRepos(260), '', 'group/repo-259', 100);
    expect(items.some((repo) => repo.pathWithNamespace === 'group/repo-259')).toBe(true);
    expect(hiddenCount).toBe(159);
  });

  it('候选数量未超上限时不提示隐藏', () => {
    const { items, hiddenCount } = selectVisibleRepos(makeRepos(12), '', '', 100);
    expect(items).toHaveLength(12);
    expect(hiddenCount).toBe(0);
  });
});

describe('LinkRepoModal 仓库下拉（大数据量）', () => {
  let host: HTMLDivElement;
  let root: Root;

  const manyRepos: RepoSummary[] = Array.from({ length: 260 }, (_, index) => ({
    id: index + 1,
    name: `repo-${index}`,
    pathWithNamespace: `group/repo-${index}`,
  }));

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
          repositories={manyRepos}
          effectiveRepoIds={[]}
          fusedTemplates={fusedTemplates}
          iterationId="iter-1"
          templatePickerEnabled
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

  /** react-aria 按指针事件开合（jsdom 需显式派发 pointerdown/up + click） */
  const press = (el: Element) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
  };

  it('展开下拉只渲染上限内的候选，并提示剩余数量', async () => {
    await renderModal();
    await act(async () => {
      const trigger = document.body.querySelector('button[aria-haspopup="listbox"]');
      expect(trigger).toBeTruthy();
      if (trigger) press(trigger);
    });

    const options = document.body.querySelectorAll('[role="option"]');
    expect(options.length).toBe(REPO_OPTION_LIMIT);
    expect(document.body.textContent).toContain('还有 160 个仓库未显示，输入关键词继续筛选');
  });

  it('输入关键词后只渲染命中项，并收起隐藏提示', async () => {
    await renderModal();
    await act(async () => {
      const trigger = document.body.querySelector('button[aria-haspopup="listbox"]');
      if (trigger) press(trigger);
    });

    const input = document.body.querySelector('[data-slot="combo-box"] input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'group/repo-259');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const options = Array.from(document.body.querySelectorAll('[role="option"]'));
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('group/repo-259');
    expect(document.body.textContent).not.toContain('个仓库未显示');
  });
});
