// 交付进展摘要（关联仓库卡片）行为测试：
// - 摘要默认展开可见：仓库名 + 追溯状态 + 开发分支 → 目标分支 + MR/CI 摘要 + 查看详情/差异/日志入口；
// - 写操作（创建 MR / 发起构建 / 取消关联）只在展开后的交付详情中出现，不得常驻摘要行；
// - 无法确认构建属于需求分支时标「仓库最新构建」，不据此判定需求构建通过。
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MrSummary, RepoSummary } from '@/types';
import { LinkedRepoCard } from './linked-repo-card';

const appState = {
  repoCiByRepo: {
    123: {
      loading: false,
      snapshot: {
        provider: 'flow' as const,
        name: 'flow-pipe',
        runs: [{ runId: '105', status: 'SUCCESS', startTime: Date.now() - 60_000 }],
      },
    },
  },
  settings: {
    repoCiBindings: { '123': { provider: 'flow' as const, pipelineId: 1, pipelineName: 'flow-pipe' } },
    allowWriteOps: true,
  },
  loadTrace: vi.fn().mockResolvedValue({ status: 'success', errors: [] }),
  loadRepoCi: vi.fn(),
  setToast: vi.fn(),
};

vi.mock('@/store/app', () => {
  const useApp = Object.assign(() => appState, { getState: () => appState });
  return { useApp };
});

vi.mock('../BranchDivergenceCheck', () => ({
  useBranchDivergence: () => ({
    check: { status: 'ready', developmentOnly: 3, baselineOnly: 0 },
    diffs: [{
      oldPath: 'src/a.ts',
      newPath: 'src/a.ts',
      newFile: false,
      deletedFile: false,
      renamedFile: false,
      diff: '',
      additions: 2,
      deletions: 1,
      lines: [],
    }],
    loading: false,
    refetch: vi.fn(),
  }),
  comparisonCommits: () => [],
  BranchDivergenceCheck: () => <div data-testid="branch-divergence-stub" />,
}));

vi.mock('./linked-repo-branch-ops', () => ({
  useLinkedRepoBranchOps: () => ({
    developerBranchState: 'exists',
    defaultBaseState: 'exists',
    traceRefreshState: null,
    baselineCreating: false,
    branchCreating: false,
    cardRefreshing: false,
    createIterationBaseline: vi.fn(),
    createDeveloperBranch: vi.fn(),
    handleRefreshSingleRepo: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/lib/api', () => ({
  listBranches: vi.fn().mockResolvedValue([]),
  listMergeRequests: vi.fn().mockResolvedValue([]),
  compareBranches: vi.fn().mockResolvedValue({}),
  createMergeRequest: vi.fn(),
  createWorkitemComment: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/ai-api', () => ({
  getAiSettings: vi.fn().mockResolvedValue({ hasApiKey: false }),
  aiGenerateMergeRequest: vi.fn(),
  aiGenerateBugMergeContext: vi.fn(),
}));

describe('LinkedRepoCard 交付进展摘要', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mockRepo: RepoSummary = {
    id: 123,
    name: 'test-backend-repo',
    pathWithNamespace: 'group/test-backend-repo',
  };

  const branchRule = {
    sourceBranch: 'master',
    baselineBranch: 'iteration/sprint-1/site-b',
    workitemBranch: 'feature/REQ-101',
    templateName: '局点专版',
    templateId: 'site-track',
    origin: 'iteration' as const,
  };

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    if (typeof globalThis.ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as any;
    }
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
  });

  const renderCard = async (overrides: Record<string, unknown> = {}) => {
    await act(async () => {
      root.render(
        <LinkedRepoCard
          repo={mockRepo}
          identifier="REQ-101"
          subject="订单退款需求"
          iterationId="sprint-1"
          placeholderIteration={false}
          branchRule={branchRule}
          mergeRequests={[] as MrSummary[]}
          matchedBranches={['feature/REQ-101']}
          loadingBranches={false}
          traceAvailable
          templates={[]}
          templateEnabled={false}
          baselineBranch="iteration/sprint-1/site-b"
          baselineState="exists"
          onRetryBaseline={vi.fn()}
          onTemplateChange={vi.fn()}
          onUnlinkRepo={vi.fn()}
          {...overrides}
        />,
      );
    });
  };

  const expandDetails = async () => {
    // 摘要行的展开开关是动作组里的「查看详情」分段（2026-11-17 设计评审：从卡片底部上移到表头 ButtonGroup）
    const expandBtn = host.querySelector('[data-testid="linked-repo-details-toggle"]') ?? undefined;
    expect(expandBtn).not.toBeUndefined();
    await act(async () => {
      expandBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  };

  it('摘要默认可见：追溯状态、开发分支→目标分支、CI「仓库最新构建」与表头只读动作组', async () => {
    await renderCard();
    const text = host.textContent ?? '';

    expect(text).toContain('test-backend-repo');
    // 开发分支 → 目标分支
    expect(text).toContain('feature/REQ-101');
    expect(text).toContain('iteration/sprint-1/site-b');
    // 追溯查询状态（ready）
    expect(text).toContain('追溯就绪');
    // CI：构建号 + 时间 + 无法确认归属时标「仓库最新构建」
    expect(text).toContain('Flow #105');
    expect(text).toContain('仓库最新');
    // 表头常驻只读入口：展开/收起开关 + 「⋯」菜单（刷新数据 / 构建记录收在菜单里）
    expect(text).toContain('展开');
    expect(host.querySelector('[data-testid="linked-repo-details-toggle"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="更多只读仓库操作"]')).not.toBeNull();
    expect(text).not.toContain('查看日志');
  });

  it('摘要行不常驻写操作，展开交付详情后才出现创建 MR / 发起构建 / 取消关联', async () => {
    await renderCard();
    const summaryText = host.querySelector('[data-testid="delivery-summary"]')?.textContent ?? '';
    expect(summaryText).not.toContain('创建 MR');
    expect(summaryText).not.toContain('发起构建');
    // 摘要行不再挂「展开交付详情执行」等待处理文案：原地展开即可执行
    expect(summaryText).not.toContain('待处理：');

    await expandDetails();
    const detailText = host.textContent ?? '';
    expect(detailText).toContain('创建 MR');
    expect(detailText).toContain('发起构建');
    // 取消关联已收进仓库「⋯」菜单（需要打开菜单才渲染），不再常驻详情面板
    expect(detailText).not.toContain('取消关联');
  });

  it('未绑定 CI 时单独呈现「未关联 CI」，不渲染仓库最新构建标签', async () => {
    await act(async () => {
      root.render(
        <LinkedRepoCard
          repo={{ id: 456, name: 'no-ci-repo', pathWithNamespace: 'group/no-ci-repo' }}
          identifier="REQ-101"
          subject="订单退款需求"
          iterationId="sprint-1"
          placeholderIteration={false}
          branchRule={branchRule}
          mergeRequests={[] as MrSummary[]}
          matchedBranches={['feature/REQ-101']}
          loadingBranches={false}
          traceAvailable
          templates={[]}
          templateEnabled={false}
          baselineBranch="iteration/sprint-1/site-b"
          baselineState="exists"
          onRetryBaseline={vi.fn()}
          onTemplateChange={vi.fn()}
        />,
      );
    });
    const text = host.textContent ?? '';
    expect(text).toContain('未关联 CI');
    expect(text).not.toContain('仓库最新构建');
  });
});