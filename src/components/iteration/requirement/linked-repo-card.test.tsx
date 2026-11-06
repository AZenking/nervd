import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MrSummary, RepoSummary } from '@/types';
import { LinkedRepoCard } from './linked-repo-card';

// 缺陷上下文整卡联动：合并目标覆盖（需求单号分支）需贯通 MR 弹窗预填
vi.mock('@/store/app', () => ({
  useApp: () => ({
    repoCiByRepo: {},
    settings: { repoCiBindings: {} },
    loadTrace: vi.fn().mockResolvedValue({ status: 'success', errors: [] }),
    loadRepoCi: vi.fn(),
    setToast: vi.fn(),
  }),
}));

vi.mock('../BranchDivergenceCheck', () => ({
  useBranchDivergence: () => ({
    check: { status: 'ready', developmentOnly: 3, baselineOnly: 0 },
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

describe('LinkedRepoCard 缺陷上下文（缺陷单号分支 → 需求单号分支）', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mockRepo: RepoSummary = {
    id: 123,
    name: 'test-backend-repo',
    pathWithNamespace: 'group/test-backend-repo',
  };

  const bugBranchRule = {
    sourceBranch: 'master',
    baselineBranch: 'iteration/sprint-1/site-b',
    workitemBranch: 'feature/BUG-202',
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
          identifier="BUG-202"
          subject="退款金额输入框偶发丢失焦点"
          iterationId="sprint-1"
          placeholderIteration={false}
          branchRule={bugBranchRule}
          mergeRequests={[] as MrSummary[]}
          matchedBranches={['feature/BUG-202']}
          loadingBranches={false}
          traceAvailable
          templates={[]}
          templateEnabled={false}
          baselineBranch="iteration/sprint-1/site-b"
          baselineState="exists"
          onRetryBaseline={vi.fn()}
          onTemplateChange={vi.fn()}
          operationBaseBranchOverride="feature/REQ-101"
          bugMrContext={{
            bugWorkitemId: 'bug-1',
            requirementIdentifier: 'REQ-101',
            requirementSubject: '订单退款需求',
          }}
          {...overrides}
        />,
      );
    });
  };

  const openMrDialog = async () => {
    // 主操作为 create-mr（缺陷分支领先 3 个提交），点击「发起 MR」
    const mrBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('发起 MR'),
    );
    expect(mrBtn).not.toBeUndefined();
    await act(async () => {
      mrBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  };

  it('覆盖合并目标：MR 弹窗源=缺陷分支、目标=需求单号分支，描述补充所属需求', async () => {
    await renderCard();
    await openMrDialog();

    const dialogText = document.body.textContent ?? '';
    // 源分支 = 缺陷单号分支
    expect(dialogText).toContain('feature/BUG-202');
    // 目标分支 = 需求单号分支（operationBaseBranchOverride，而非迭代基准）
    expect(dialogText).toContain('feature/REQ-101');
    expect(dialogText).not.toContain('iteration/sprint-1/site-b');
    // 缺陷单号与所属需求自动补充进 MR 信息（AI 未配置走默认预填）
    expect(dialogText).toContain('BUG-202');
    expect(dialogText).toContain('所属需求');
    expect(dialogText).toContain('REQ-101');
  });

  it('无覆盖时保持原合并目标（迭代基准），行为不变', async () => {
    await renderCard({ operationBaseBranchOverride: undefined, bugMrContext: undefined });
    await openMrDialog();

    const dialogText = document.body.textContent ?? '';
    expect(dialogText).toContain('feature/BUG-202');
    expect(dialogText).toContain('iteration/sprint-1/site-b');
  });
});
