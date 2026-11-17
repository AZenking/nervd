import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchRuleTemplate, MrSummary, RepoSummary } from '@/types';
import { LinkedRepoHeader } from './linked-repo-header';
import { LinkedRepoBranchSection, LinkedRepoBranchStatus } from './linked-repo-branch-section';
import { LinkedRepoMrStatus } from './linked-repo-mr-list';
import { LinkedRepoCiStatus } from './linked-repo-ci-status';

/**
 * 摘要行主操作在真实调用点是一个组件（LinkedRepoPrimaryAction）。
 * 这里同样用组件占位：ButtonGroup 会给直接子元素注入 `__button_group_child` 标记，
 * 直接传原生 <button> 会把该标记落到 DOM 上触发 React 告警。
 */
function PrimaryActionStub() {
  return <button type="button">Action</button>;
}

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
            palette="from-(--brand-indigo)/20 to-(--sticker-purple)/30 text-(--sticker-purple-deep)"
            primaryAction={<PrimaryActionStub />}
            detailsOpen={false}
            onToggleDetails={vi.fn()}
            cardRefreshing={false}
            onRefresh={vi.fn()}
            hasRuns={false}
            buildTarget={{ kind: 'repo', repoId: 123, title: 'test', defaultBranch: 'master' }}
          />,
        );
      });

      // 仓库名 → Card.Title；路径 → Card.Description（灰色等宽）；分支信息已迁到 Card.Content
      expect(host.textContent).toContain('test-backend-repo');
      expect(host.textContent).toContain('group/test-backend-repo');
      expect(host.querySelector('[data-slot="card-title"]')).not.toBeNull();
      expect(host.querySelector('[data-slot="card-description"]')).not.toBeNull();
      expect(host.textContent).not.toContain('feature/REQ-101');
      expect(host.textContent).toContain('Action');
    });

    it('renders trace query state next to the repository name', async () => {
      const renderHeader = async (traceState: 'loading' | 'ready' | 'error') => {
        await act(() => {
          root.render(
            <LinkedRepoHeader
              repo={mockRepo}
              palette="from-(--brand-indigo)/20"
              traceState={traceState}
              detailsOpen={false}
              onToggleDetails={vi.fn()}
              cardRefreshing={false}
              onRefresh={vi.fn()}
              hasRuns={false}
              buildTarget={{ kind: 'repo', repoId: 123, title: 'test', defaultBranch: 'master' }}
            />,
          );
        });
      };

      await renderHeader('loading');
      expect(host.textContent).toContain('追溯查询中');
      await renderHeader('error');
      expect(host.textContent).toContain('追溯查询失败');
      await renderHeader('ready');
      expect(host.textContent).toContain('追溯就绪');
    });

    it('keeps write operations out of the summary row (no build/config/unlink menu items)', async () => {
      await act(() => {
        root.render(
          <LinkedRepoHeader
            repo={mockRepo}
            palette="from-(--brand-indigo)/20"
            detailsOpen={false}
            onToggleDetails={vi.fn()}
            cardRefreshing={false}
            onRefresh={vi.fn()}
            hasRuns
            buildTarget={{ kind: 'repo', repoId: 123, title: 'test', defaultBranch: 'master' }}
          />,
        );
      });
      // 构建 / 关联流水线 / 创建 MR / 取消关联 均只允许出现在展开后的交付详情中
      expect(host.textContent).not.toContain('发起构建');
      expect(host.textContent).not.toContain('关联流水线');
      expect(host.textContent).not.toContain('创建 MR');
      expect(host.textContent).not.toContain('取消关联');
    });

    it('摘要行动作 = 展开/收起文字开关 + 「⋯」菜单（刷新数据 / 构建记录）', async () => {
      const renderHeader = async (detailsOpen: boolean) => {
        await act(() => {
          root.render(
            <LinkedRepoHeader
              repo={mockRepo}
              palette="from-(--brand-indigo)/20"
              detailsOpen={detailsOpen}
              onToggleDetails={vi.fn()}
              cardRefreshing={false}
              onRefresh={vi.fn()}
              hasRuns
              buildTarget={{ kind: 'repo', repoId: 123, title: 'test', defaultBranch: 'master' }}
            />,
          );
        });
      };

      // 收合态：开关文案为「展开」；展开态翻转为「收起」
      await renderHeader(false);
      const toggle = host.querySelector('[data-testid="linked-repo-details-toggle"]');
      expect(toggle?.textContent).toContain('展开');
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');

      await renderHeader(true);
      expect(host.querySelector('[data-testid="linked-repo-details-toggle"]')?.textContent).toContain('收起');

      // 低频只读动作收进 HeroUI DropdownMenu 触发器（不是常驻按钮）
      const menuTrigger = host.querySelector('[aria-label="更多只读仓库操作"]');
      expect(menuTrigger).not.toBeNull();
      expect(host.querySelector('[data-slot="button-group"]')).toBeNull();
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

      // 加载态用等宽骨架占位（不再渲染短文案，避免刷新时行宽抖动）
      expect(host.querySelector('[data-slot="skeleton"], .skeleton')).not.toBeNull();
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
            developerBranchState="exists"
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

      // 2026-11-17 布局评审：面板底行改为「模板源 | 规则来源：<作用域>」，命中的轨道名单独列出
      expect(host.textContent).toContain('规则来源：');
      expect(host.textContent).toContain('需求覆盖');
      expect(host.textContent).toContain('轨道A');
      expect(host.textContent).not.toContain('需选模板');
    });

    it('renders inherited track chip from iteration scope', async () => {
      await renderSection({ trackOrigin: 'iteration', trackTemplateName: '迭代专属轨道' });

      expect(host.textContent).toContain('迭代专属轨道');
      expect(host.textContent).toContain('规则来源：');
      expect(host.textContent).not.toContain('需选模板');
    });

    it('renders inherited track chip from global scope', async () => {
      await renderSection({ trackOrigin: 'global', trackTemplateName: '全局默认轨道' });

      expect(host.textContent).toContain('全局默认轨道');
      expect(host.textContent).toContain('规则来源：');
      expect(host.textContent).not.toContain('需选模板');
    });

    it('shows no warning chip and keeps inherit-default option when zero templates', async () => {
      await renderSection({ templates: [] });

      expect(host.textContent).not.toContain('需选模板');
      expect(host.textContent).not.toContain('轨道：');
      expect(host.textContent).not.toContain('继承：');
      // '__none' 选项保留，语义从"未选择模板"改为"清除覆盖 → 继承默认轨道"；
      // HeroUI ComboBox 的选中值渲染在输入框 value 上，不在 textContent 里
      expect(host.querySelector('input')?.value ?? '').toContain('继承默认轨道');
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
            developerBranch="feature/REQ-101"
            developerBranchState="exists"
            operationBaseBranch="master"
            targetActiveMr={activeMr}
            historyMrs={[]}
            hasMatchingMergedMr={false}
            divergence={{
              check: { status: 'ready', developmentOnly: 0, baselineOnly: 0 },
              loading: false,
              refetch: vi.fn(),
            } as any}
            onViewMr={vi.fn()}
          />,
        );
      });

      expect(host.textContent).toContain('!88');
      expect(host.textContent).toContain('待合入');
      // MR 状态与合入目标同屏呈现
      expect(host.textContent).toContain('→ master');
    });

    it('does not expose a create-MR write action in the summary status row', async () => {
      await act(() => {
        root.render(
          <LinkedRepoMrStatus
            developerBranch="feature/REQ-101"
            developerBranchState="exists"
            operationBaseBranch="master"
            historyMrs={[]}
            hasMatchingMergedMr={false}
            divergence={{
              check: { status: 'ready', developmentOnly: 3, baselineOnly: 0 },
              loading: false,
              refetch: vi.fn(),
            } as any}
            onViewMr={vi.fn()}
          />,
        );
      });
      expect(host.textContent).toContain('待合入');
      expect(host.textContent).toContain('3 个提交');
      expect(host.textContent).toContain('→ master');
      expect(host.textContent).not.toContain('发起 MR');
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
          />,
        );
      });

      expect(host.textContent).toContain('暂无 MR');
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

      expect(host.textContent).toContain('未关联 CI');
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

      // 状态语义交给 StatusIcon（decorative），文本只保留构建号与来源辅助说明
      expect(host.textContent).toContain('Flow #105');
      expect(host.textContent).toContain('需求分支构建');
    });

    it('marks an unconfirmable build as repository latest build (not a requirement build pass)', async () => {
      await act(() => {
        root.render(
          <LinkedRepoCiStatus
            loading={false}
            ciBinding={{ provider: 'flow', pipelineId: 1, pipelineName: 'flow-pipe' }}
            latestRun={{ runId: '105', status: 'SUCCESS', startTime: Date.now() - 60000 }}
            snapshot={{ provider: 'flow', name: 'flow-pipe', runs: [] }}
            repoLatestBuild
            ciSummary="CI #105 · 成功"
            buildTarget={{ kind: 'repo', repoId: 123, title: 'test', defaultBranch: 'master' }}
            onOpenCiModal={vi.fn()}
          />,
        );
      });
      // 来源改为辅助文字「仓库最新」（不再用橙色徽标，橙色只留给待处理状态）
      expect(host.textContent).toContain('仓库最新');
      // 状态图形仍表示该次运行的状态，但语义标注为「仓库最新构建」，不据此判定需求构建通过
      expect(host.textContent).not.toContain('仓库最新构建 · 需求构建通过');
    });

    it('renders a visible CI query failure state', async () => {
      await act(() => {
        root.render(
          <LinkedRepoCiStatus
            loading={false}
            error
            ciBinding={{ provider: 'flow', pipelineId: 1, pipelineName: 'flow-pipe' }}
            ciSummary="CI 查询失败"
            buildTarget={{ kind: 'repo', repoId: 123, title: 'test', defaultBranch: 'master' }}
            onOpenCiModal={vi.fn()}
          />,
        );
      });
      expect(host.textContent).toContain('CI 查询失败');
    });
  });
});
