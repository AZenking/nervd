import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchRuleTemplate, MrSummary, RepoSummary } from '@/types';
import { LinkedRepoHeader } from './linked-repo-header';
import { LinkedRepoBranchSection, LinkedRepoBranchStatus } from './linked-repo-branch-section';
import { LinkedRepoMrStatus } from './linked-repo-mr-list';
import { LinkedRepoCiStatus } from './linked-repo-ci-status';

describe('Linked Repo Subcomponents', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mockRepo: RepoSummary = {
    id: 123,
    name: 'test-backend-repo',
    pathWithNamespace: 'group/test-backend-repo',
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
  });

  describe('LinkedRepoHeader', () => {
    it('renders repository name, namespace, and delivery branches', async () => {
      await act(() => {
        root.render(
          <LinkedRepoHeader
            repo={mockRepo}
            detailsOpen={false}
            onToggleDetails={vi.fn()}
            palette="from-(--brand-indigo)/20 to-(--sticker-purple)/30 text-(--sticker-purple-deep)"
            developerBranch="feature/REQ-101"
            developerBranchState="exists"
            operationBaseBranch="master"
            primaryAction={<button type="button">Action</button>}
            cardRefreshing={false}
            onRefresh={vi.fn()}
            hasRuns={false}
            buildTarget={{ kind: 'repo', repoId: 123, title: 'test', defaultBranch: 'master' }}
            onOpenCiModal={vi.fn()}
            onCreateMr={vi.fn()}
          />,
        );
      });

      expect(host.textContent).toContain('test-backend-repo');
      expect(host.textContent).toContain('group/test-backend-repo');
      expect(host.textContent).toContain('feature/REQ-101');
      expect(host.textContent).toContain('master');
      expect(host.textContent).toContain('Action');
    });
  });

  describe('LinkedRepoBranchStatus', () => {
    it('renders loading state when branch is being checked', async () => {
      await act(() => {
        root.render(
          <LinkedRepoBranchStatus
            developerBranchState="loading"
            traceState="ready"
            divergence={{
              check: { status: 'idle' },
              loading: false,
              refetch: vi.fn(),
            } as any}
          />,
        );
      });

      expect(host.textContent).toContain('查询分支…');
    });

    it('renders missing branch notice when branch does not exist', async () => {
      await act(() => {
        root.render(
          <LinkedRepoBranchStatus
            developerBranchState="missing"
            traceState="ready"
            divergence={{
              check: { status: 'idle' },
              loading: false,
              refetch: vi.fn(),
            } as any}
          />,
        );
      });

      expect(host.textContent).toContain('未创建需求分支');
    });

    it('renders aligned status when divergence check is ready with 0 difference', async () => {
      await act(() => {
        root.render(
          <LinkedRepoBranchStatus
            developerBranchState="exists"
            traceState="ready"
            divergence={{
              check: { status: 'ready', developmentOnly: 0, baselineOnly: 0 },
              loading: false,
              refetch: vi.fn(),
            } as any}
          />,
        );
      });

      expect(host.textContent).toContain('与基准已对齐');
    });
  });

  describe('LinkedRepoBranchSection track chips', () => {
    const trackTemplate: BranchRuleTemplate = {
      id: 'tpl-track',
      name: '轨道A',
      sourceBranch: 'master',
      baselineBranchPattern: 'release/{iteration}/{track}',
      workitemBranchPattern: 'feature/{identifier}',
    };

    const renderSection = async (overrides: Record<string, unknown> = {}) => {
      await act(() => {
        root.render(
          <LinkedRepoBranchSection
            repoId={123}
            repoName="test-backend-repo"
            developerBranch="feature/REQ-101"
            developerBranchState="missing"
            operationBaseBranch="release/sprint-a/track-a"
            configuredBaselineBranch="release/sprint-a/track-a"
            defaultBaseState="loading"
            onRetryBaseline={vi.fn()}
            templates={[trackTemplate]}
            templateEnabled
            onTemplateChange={vi.fn()}
            templateSourceBranch="master"
            templateSelectId="repo-branch-template-123"
            extraMatchedBranches={[]}
            {...overrides}
          />,
        );
      });
    };

    it('renders explicit override track chip instead of warning', async () => {
      await renderSection({ templateId: 'tpl-track', trackOrigin: 'workitem', trackTemplateName: '轨道A' });

      expect(host.textContent).toContain('轨道：');
      expect(host.textContent).toContain('轨道A');
      expect(host.textContent).toContain('[需求覆盖]');
      expect(host.textContent).not.toContain('继承：');
      expect(host.textContent).not.toContain('需选模板');
    });

    it('renders inherited track chip from iteration scope', async () => {
      await renderSection({ trackOrigin: 'iteration', trackTemplateName: '迭代专属轨道' });

      expect(host.textContent).toContain('继承：迭代专属轨道');
      expect(host.textContent).toContain('[迭代专属]');
      expect(host.textContent).not.toContain('需选模板');
    });

    it('renders inherited track chip from global scope', async () => {
      await renderSection({ trackOrigin: 'global', trackTemplateName: '全局默认轨道' });

      expect(host.textContent).toContain('继承：全局默认轨道');
      expect(host.textContent).toContain('[全局默认]');
      expect(host.textContent).not.toContain('需选模板');
    });

    it('shows no warning chip and keeps inherit-default option when zero templates', async () => {
      await renderSection({ templates: [] });

      expect(host.textContent).not.toContain('需选模板');
      expect(host.textContent).not.toContain('轨道：');
      expect(host.textContent).not.toContain('继承：');
      // '__none' 选项保留，语义从"未选择模板"改为"清除覆盖 → 继承默认轨道"
      expect(host.textContent).toContain('继承默认轨道');
    });
  });

  describe('LinkedRepoMrStatus', () => {
    it('renders active MR chip and status label', async () => {
      const activeMr: MrSummary = {
        localId: 88,
        title: 'feat: new feature',
        state: 'opened',
        sourceBranch: 'feature/REQ-101',
        targetBranch: 'master',
        author: { name: 'Alice' },
      };

      await act(() => {
        root.render(
          <LinkedRepoMrStatus
            targetActiveMr={activeMr}
            developerBranch="feature/REQ-101"
            developerBranchState="exists"
            operationBaseBranch="master"
            historyMrs={[]}
            hasMatchingMergedMr={false}
            divergence={{
              check: { status: 'ready', developmentOnly: 0, baselineOnly: 0 },
              loading: false,
              refetch: vi.fn(),
            } as any}
            onViewMr={vi.fn()}
            onCreateMr={vi.fn()}
          />,
        );
      });

      expect(host.textContent).toContain('!88');
      expect(host.textContent).toContain('待合入');
    });

    it('renders no MR indicator when there are no merge requests and branch is missing', async () => {
      await act(() => {
        root.render(
          <LinkedRepoMrStatus
            developerBranch=""
            developerBranchState="missing"
            operationBaseBranch="master"
            historyMrs={[]}
            hasMatchingMergedMr={false}
            divergence={{
              check: { status: 'idle' },
              loading: false,
              refetch: vi.fn(),
            } as any}
            onViewMr={vi.fn()}
            onCreateMr={vi.fn()}
          />,
        );
      });

      expect(host.textContent).toContain('— 暂无 MR');
    });
  });

  describe('LinkedRepoCiStatus', () => {
    it('renders unbound state when ciBinding is null', async () => {
      await act(() => {
        root.render(
          <LinkedRepoCiStatus
            loading={false}
            ciSummary="CI 未绑定"
            buildTarget={{ kind: 'repo', repoId: 123, title: 'test', defaultBranch: 'master' }}
            onOpenCiModal={vi.fn()}
          />,
        );
      });

      expect(host.textContent).toContain('— 未关联 CI');
    });

    it('renders latest run details when run is present', async () => {
      await act(() => {
        root.render(
          <LinkedRepoCiStatus
            loading={false}
            ciBinding={{ provider: 'flow', pipelineId: 1, pipelineName: 'flow-pipe' }}
            latestRun={{
              runId: '105',
              status: 'SUCCESS',
              startTime: Date.now() - 60000,
            }}
            snapshot={{ provider: 'flow', name: 'flow-pipe', runs: [] }}
            ciSummary="CI #105 · 成功"
            buildTarget={{ kind: 'repo', repoId: 123, title: 'test', defaultBranch: 'master' }}
            onOpenCiModal={vi.fn()}
          />,
        );
      });

      expect(host.textContent).toContain('Flow #105');
      expect(host.textContent).toContain('成功');
    });
  });
});
