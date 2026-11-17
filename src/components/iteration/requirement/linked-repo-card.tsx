import { useEffect, useRef, useState } from 'react';
import { ChevronRightIcon, FileCodeIcon, ScrollTextIcon } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { ciStatusText } from '@/lib/ci';
import { formatDateTime, formatDuration } from '@/lib/format';
import { useApp } from '@/store/app';
import { useShallow } from 'zustand/react/shallow';
import { useUi } from '@/store/ui';
import type { BranchRuleTemplate, MrSummary, RepoSummary } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { BuildWorkbenchTarget } from '@/store/ui';
import { useBranchDivergence } from '../BranchDivergenceCheck';
import { CreateMrDialog } from './create-mr-dialog';
import { RepoCiModal } from './repo-ci-modal';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/section-header';
import { openBuildWorkbenchFromTrigger, openRepoBuildLogs } from '@/components/build-workbench';
import { WriteOpButton } from '@/components/WriteOpButton';
import { cn } from '@/lib/utils';
import type {
  IterationBaselineCheck,
  ResolvedRepoBranchRule,
} from './types';
import {
  boundJenkinsRunBranch,
  deriveLinkedRepoDelivery,
  latestCiRun,
  type LinkedRepoDeliveryDecision,
  type RepoTraceState,
} from './linked-repo-delivery';
import { LinkedRepoBranchSection } from './linked-repo-branch-section';
import { LinkedRepoMrList } from './linked-repo-mr-list';
import {
  LinkedRepoBuildAction,
  LinkedRepoCiSection,
} from './linked-repo-ci-status';
import { LinkedRepoHeader } from './linked-repo-header';
import { LinkedRepoStatusStrip } from './linked-repo-status-strip';
import { LinkedRepoPrimaryAction } from './linked-repo-primary-action';
import { useLinkedRepoBranchOps } from './linked-repo-branch-ops';
import { CodeDiffDrawer } from './code-diff-drawer';

/** 交付主操作中的写操作：只能出现在展开后的交付详情中，摘要行不得常驻。 */
const WRITE_DELIVERY_ACTIONS = new Set<LinkedRepoDeliveryDecision['action']>([
  'create-baseline',
  'create-workitem-branch',
  'create-mr',
  'build',
  'blocked',
]);

export {
  LinkedRepoBranchSection,
  LinkedRepoBranchStatus,
} from './linked-repo-branch-section';
export type {
  LinkedRepoBranchSectionProps,
  LinkedRepoBranchStatusProps,
} from './linked-repo-branch-section';
export {
  LinkedRepoMrList,
  LinkedRepoMrStatus,
} from './linked-repo-mr-list';
export type {
  LinkedRepoMrListProps,
  LinkedRepoMrStatusProps,
} from './linked-repo-mr-list';
export {
  LinkedRepoBuildAction,
  LinkedRepoCiSection,
  LinkedRepoCiStatus,
} from './linked-repo-ci-status';
export type {
  LinkedRepoBuildActionProps,
  LinkedRepoCiSectionProps,
  LinkedRepoCiStatusProps,
} from './linked-repo-ci-status';
export { LinkedRepoHeader } from './linked-repo-header';
export type { LinkedRepoHeaderProps } from './linked-repo-header';
export { LinkedRepoStatusStrip } from './linked-repo-status-strip';
export type { LinkedRepoStatusStripProps } from './linked-repo-status-strip';
export { LinkedRepoPrimaryAction } from './linked-repo-primary-action';
export type { LinkedRepoPrimaryActionProps } from './linked-repo-primary-action';
export { useLinkedRepoBranchOps } from './linked-repo-branch-ops';
export type { UseLinkedRepoBranchOpsParams } from './linked-repo-branch-ops';

export interface LinkedRepoBugMrContext {
  /** 缺陷工作项 ID（测试影响范围评论发布目标） */
  bugWorkitemId: string;
  requirementIdentifier: string;
  requirementSubject: string;
}

export interface LinkedRepoCardProps {
  repo: RepoSummary;
  identifier: string;
  subject: string;
  /** 当前工作项 UUID：用于 MR 原生 workItemIds 关联。 */
  workitemId?: string;
  /** 父需求 UUID：缺陷 MR 时一并关联。 */
  parentWorkitemId?: string;
  iterationId?: string;
  placeholderIteration: boolean;
  branchRule?: ResolvedRepoBranchRule;
  mergeRequests: MrSummary[];
  matchedBranches: string[];
  loadingBranches: boolean;
  traceAvailable: boolean;
  templateId?: string;
  templates: (BranchRuleTemplate | ScopedBranchRuleTemplate)[];
  templateEnabled: boolean;
  baselineBranch?: string;
  baselineState?: IterationBaselineCheck['state'];
  refreshSignal?: number;
  /**
   * 缺陷上下文的合并目标覆盖：需求单号分支（「缺陷单号分支 → 需求单号分支」）。
   * 传入后落差比对 / 建分支源 / MR 目标统一替换为该分支；迭代基准探测仍按 branchRule 展示。
   */
  operationBaseBranchOverride?: string;
  /** 缺陷页发起 MR 的上下文（AI 修改说明与测试影响范围评论） */
  bugMrContext?: LinkedRepoBugMrContext;
  onRetryBaseline: () => void;
  onTemplateChange: (templateId: string | null) => void;
  onUnlinkRepo?: (repoId: number) => void;
}

/** 需求关联仓库的紧凑摘要；分支与交付细节默认收拢。 */
const REPO_PALETTES = [
  'from-(--brand-indigo)/20 to-(--sticker-purple)/30 text-(--sticker-purple-deep) border-(--sticker-purple-deep)/20',
  'from-(--sticker-sky)/20 to-(--sticker-sky)/35 text-(--sticker-sky) border-(--sticker-sky)/20',
  'from-(--sticker-orange)/20 to-(--sticker-orange-deep)/30 text-(--sticker-orange-deep) border-(--sticker-orange)/20',
  'from-(--sticker-green)/20 to-(--sticker-teal)/30 text-(--sticker-green) border-(--sticker-green)/20',
  'from-(--sticker-pink)/20 to-(--sticker-pink)/35 text-(--sticker-pink) border-(--sticker-pink)/20',
];

function getRepoPalette(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return REPO_PALETTES[Math.abs(hash) % REPO_PALETTES.length];
}

/** 直连主干模式（Trunk-Based）：占位符展开后迭代基准分支与模板源分支同名，不派生迭代基准。 */
export function isDirectConnectRule(rule: ResolvedRepoBranchRule): boolean {
  return rule.baselineBranch.trim() === rule.sourceBranch.trim();
}

export function LinkedRepoCard({
  repo,
  identifier,
  subject,
  workitemId,
  parentWorkitemId,
  iterationId,
  placeholderIteration,
  branchRule,
  mergeRequests,
  matchedBranches,
  loadingBranches,
  traceAvailable,
  templateId,
  templates,
  templateEnabled,
  baselineBranch,
  baselineState,
  refreshSignal,
  operationBaseBranchOverride,
  bugMrContext,
  onRetryBaseline,
  onTemplateChange,
  onUnlinkRepo,
}: LinkedRepoCardProps) {
  const {
    repoCiByRepo,
    settings,
    loadTrace,
    loadRepoCi,
    setToast,
  } = useApp(
    useShallow((s) => ({
      repoCiByRepo: s.repoCiByRepo,
      settings: s.settings,
      loadTrace: s.loadTrace,
      loadRepoCi: s.loadRepoCi,
      setToast: s.setToast,
    })),
  );
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const ciBinding = settings?.repoCiBindings?.[String(repo.id)];
  const templateSourceBranch = branchRule?.sourceBranch.trim() ?? '';
  const configuredBaselineBranch = branchRule?.baselineBranch.trim() ?? '';
  const hasValidRule = Boolean(
    templateSourceBranch
      && configuredBaselineBranch
      && branchRule?.workitemBranch.trim(),
  );
  const developerBranch = branchRule?.workitemBranch.trim()
    || (!iterationId && identifier ? 'feature/' + identifier : '');
  const operationBaseBranch = iterationId
    ? (baselineBranch?.trim() || configuredBaselineBranch)
    : 'master';
  // 缺陷上下文合并目标覆盖：缺陷单号分支 → 需求单号分支（落差比对 / 建分支源 / MR 目标统一替换）
  const effectiveOperationBaseBranch = operationBaseBranchOverride?.trim() || operationBaseBranch;
  // 直连主干（Trunk-Based）：迭代基准即模板源分支，无"创建迭代基准"环节
  const directConnect = branchRule ? isDirectConnectRule(branchRule) : false;

  const [createMrOpen, setCreateMrOpen] = useState(false);
  const [expandedMrId, setExpandedMrId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [ciModalOpen, setCiModalOpen] = useState(false);
  const [autoOpenWorkbenchOnBind, setAutoOpenWorkbenchOnBind] = useState(false);
  const [pendingMrScrollId, setPendingMrScrollId] = useState<number | null>(null);
  const [diffDrawerOpen, setDiffDrawerOpen] = useState(false);

  // 稳定 ref 间接层：让 ops 先于 divergence hook 调用（ops 需要 refetch，divergence 需要 ops 的 developerBranchState）
  const divergenceRefetchRef = useRef<() => void>(() => {});

  const {
    developerBranchState,
    defaultBaseState,
    traceRefreshState,
    baselineCreating,
    branchCreating,
    cardRefreshing,
    createIterationBaseline,
    createDeveloperBranch,
    handleRefreshSingleRepo,
  } = useLinkedRepoBranchOps({
    repoId: repo.id,
    repoName: repo.name,
    iterationId,
    placeholderIteration,
    identifier,
    developerBranch,
    operationBaseBranch: effectiveOperationBaseBranch,
    templateSourceBranch,
    hasValidRule,
    refreshSignal,
    onRetryBaseline,
    divergence: { refetch: () => divergenceRefetchRef.current() },
    loadTrace,
    loadRepoCi,
    setToast,
  });

  const divergence = useBranchDivergence(
    repo.id,
    developerBranch,
    effectiveOperationBaseBranch,
    baselineState,
    developerBranchState,
  );
  /** 分支差异（摘要「查看差异」与 diff 抽屉共用同一份数据，不额外发起状态计算）。 */
  const branchDiffs = divergence.diffs ?? [];
  useEffect(() => {
    divergenceRefetchRef.current = divergence.refetch;
  });

  const templateSelectId = 'repo-branch-template-' + repo.id;

  useEffect(() => {
    if (!detailsOpen || pendingMrScrollId == null) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('mr-item-' + pendingMrScrollId)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setPendingMrScrollId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detailsOpen, pendingMrScrollId, expandedMrId]);

  const sortedMergeRequests = [...mergeRequests].sort((a, b) => {
    const aSourceMatch = developerBranch && a.sourceBranch === developerBranch ? 1 : 0;
    const bSourceMatch = developerBranch && b.sourceBranch === developerBranch ? 1 : 0;
    if (aSourceMatch !== bSourceMatch) return bSourceMatch - aSourceMatch;
    const aTargetMatch = effectiveOperationBaseBranch && a.targetBranch === effectiveOperationBaseBranch ? 1 : 0;
    const bTargetMatch = effectiveOperationBaseBranch && b.targetBranch === effectiveOperationBaseBranch ? 1 : 0;
    if (aTargetMatch !== bTargetMatch) return bTargetMatch - aTargetMatch;
    return b.localId - a.localId;
  });

  const activeMrs = sortedMergeRequests.filter((mr) => {
    const state = mr.state?.toLowerCase();
    return state !== 'merged' && state !== 'closed';
  });
  const historyMrs = sortedMergeRequests.filter((mr) => {
    const state = mr.state?.toLowerCase();
    return state === 'merged' || state === 'closed';
  });

  // An unrelated repository MR must not stand in for this work item's delivery path.
  const sourceMatchingActiveMrs = activeMrs.filter((mr) => developerBranch && mr.sourceBranch === developerBranch);
  const targetActiveMr = sourceMatchingActiveMrs.find((mr) => mr.targetBranch === effectiveOperationBaseBranch)
    ?? sourceMatchingActiveMrs[0];
  const hasMatchingMergedMr = historyMrs.some((mr) =>
    mr.state?.toLowerCase() === 'merged'
      && developerBranch
      && mr.sourceBranch === developerBranch
      && mr.targetBranch === effectiveOperationBaseBranch,
  );

  const traceState: RepoTraceState = traceRefreshState
    ?? (loadingBranches ? 'loading' : traceAvailable ? 'ready' : 'error');
  const delivery = deriveLinkedRepoDelivery({
    iterationId,
    placeholderIteration,
    directConnect,
    hasValidRule,
    traceState,
    baselineState,
    defaultBaseState,
    developerBranchState,
    matchingActiveMrId: targetActiveMr?.localId,
    hasMatchingMergedMr,
    divergence: {
      status: divergence.check.status,
      developmentOnly: divergence.check.status === 'ready' ? divergence.check.developmentOnly : undefined,
      baselineOnly: divergence.check.status === 'ready' ? divergence.check.baselineOnly : undefined,
    },
  });

  const targetBranch = delivery.isAllMerged
    ? (effectiveOperationBaseBranch || 'master')
    : developerBranchState === 'exists'
      ? developerBranch
      : (effectiveOperationBaseBranch || 'master');

  // 写操作一律收进展开后的交付详情：摘要行只保留只读主操作与只读入口。
  const isWriteAction = WRITE_DELIVERY_ACTIONS.has(delivery.action);

  const buildTarget: BuildWorkbenchTarget = {
    kind: 'repo',
    repoId: repo.id,
    title: repo.name,
    defaultBranch: targetBranch,
  };

  const extraMatchedBranches = matchedBranches.filter((branch) => branch !== developerBranch);
  const latestRun = latestCiRun(snapshot?.runs ?? []);
  const actualJenkinsBranch = snapshot?.provider === 'jenkins' && ciBinding?.provider === 'jenkins'
    ? boundJenkinsRunBranch(latestRun, ciBinding.branchParameter)
    : undefined;
  // 只有 Jenkins 运行记录里能读到与本需求开发分支一致的实际分支时，才可把构建归属到需求分支。
  // Flow 未提供分支、Jenkins 参数缺失或分支不一致时，一律视为「仓库最新构建」，不得判定需求构建通过。
  const ciBranchConfirmed = snapshot?.provider === 'jenkins'
    ? Boolean(actualJenkinsBranch && developerBranch && actualJenkinsBranch === developerBranch)
    : false;
  const repoLatestBuild = Boolean(snapshot && latestRun && !ciBranchConfirmed);
  const ciScope = snapshot?.provider === 'flow'
    ? '分支未提供'
    : snapshot?.provider === 'jenkins'
      ? (actualJenkinsBranch ? '分支 ' + actualJenkinsBranch : '分支未记录')
      : undefined;
  const latestCiStatus = ciStatusText(latestRun?.status ?? snapshot?.status, null);
  const runTimeSuffix = latestRun?.startTime
    ? ` · ${formatDateTime(latestRun.startTime)}`
    : '';
  const runDurationSuffix = latestRun?.durationMs != null && latestRun.durationMs > 0
    ? ` · 耗时 ${formatDuration(latestRun.durationMs)}`
    : '';
  const ciAttributionSuffix = snapshot && latestRun && !ciBranchConfirmed
    ? ' · 仓库最新构建（无法确认属于该需求分支，不据此判定需求构建通过）'
    : '';
  const ciSummary = entry?.error
    ? 'CI 查询失败' + (latestRun
      ? ' · 上次 #' + latestRun.runId + ' · ' + (ciScope ?? '分支未记录') + ' · ' + latestCiStatus + runTimeSuffix + runDurationSuffix
      : '')
    : snapshot
      ? 'CI ' + (latestRun ? '#' + latestRun.runId : '暂无运行')
        + ' · ' + (ciScope ?? '分支未记录')
        + ' · ' + latestCiStatus
        + runTimeSuffix
        + runDurationSuffix
        + ciAttributionSuffix
      : entry?.loading
        ? 'CI 查询中'
        : ciBinding
          ? 'CI 暂无运行记录'
          : 'CI 未绑定';

  const branchDisabledReason = placeholderIteration
    ? '占位迭代不支持创建云效分支'
    : !identifier || !developerBranch
      ? '工作项编号或分支名不可用'
      : iterationId && !hasValidRule
        ? '尚未配置任何交付轨道'
        : iterationId && !directConnect && baselineState !== 'exists'
          ? '请先创建或确认迭代基准分支'
          : iterationId && directConnect && baselineState !== 'exists'
            ? '直连主干：模板源分支在线上不可用，请先确认源分支存在'
            : !iterationId && defaultBaseState !== 'exists'
              ? 'master 分支不可用，无法创建需求分支'
              : developerBranchState !== 'missing'
                ? '需求分支尚未确认缺失'
                : undefined;

  const handleViewMr = (mrToView?: MrSummary | { localId: number }) => {
    const target = mrToView || targetActiveMr;
    if (!target) return;
    setDetailsOpen(true);
    setExpandedMrId(target.localId);
    setPendingMrScrollId(target.localId);
  };

  const handleConfigureRule = () => {
    // 零模板引导：一次性配置全局默认交付轨道（设置 → 追溯规则 / 分支模板），
    // 所有关联仓库将按方案 A 自动继承，无需逐仓库必选。
    useUi.getState().openSettings('trace');
  };

  const renderBuildAction = () => (
    <LinkedRepoBuildAction
      repoName={repo.name}
      ciBinding={ciBinding}
      buildTarget={buildTarget}
      onOpenCiModal={() => {
        setAutoOpenWorkbenchOnBind(false);
        setCiModalOpen(true);
      }}
    />
  );

  const palette = getRepoPalette(repo.name);

  const primaryActionNode = (
    <LinkedRepoPrimaryAction
      action={delivery.action}
      baselineCreating={baselineCreating}
      operationBaseBranch={effectiveOperationBaseBranch}
      onCreateIterationBaseline={createIterationBaseline}
      branchCreating={branchCreating}
      developerBranch={developerBranch}
      branchDisabledReason={branchDisabledReason}
      onCreateDeveloperBranch={createDeveloperBranch}
      targetActiveMr={targetActiveMr}
      onViewMr={handleViewMr}
      onCreateMr={() => setCreateMrOpen(true)}
      ciBinding={ciBinding}
      repoName={repo.name}
      buildTarget={buildTarget}
      onOpenCiModal={() => {
        setAutoOpenWorkbenchOnBind(true);
        setCiModalOpen(true);
      }}
      cardRefreshing={cardRefreshing}
      onRefresh={() => void handleRefreshSingleRepo()}
      onConfigureRule={handleConfigureRule}
      onOpenDetails={() => setDetailsOpen(true)}
    />
  );

  /** 「查看差异」复用 BranchDivergenceCheck 的差异数据与 CodeDiffDrawer 抽屉能力。 */
  const handleViewDiff = () => {
    if (divergence.check.status === 'ready' && branchDiffs.length > 0) {
      setDiffDrawerOpen(true);
      return;
    }
    // 差异尚未就绪 / 已对齐：展开交付详情，就地查看分支同步结论。
    setDetailsOpen(true);
  };

  /** 「查看日志」复用构建工作台 / LogViewer：有运行记录直接进日志页，否则先看运行记录。 */
  const handleViewLogs = () => {
    if (latestRun) {
      void openRepoBuildLogs(repo.id, latestRun.runId, `${repo.name} #${latestRun.runId}`);
      return;
    }
    openBuildWorkbenchFromTrigger(buildTarget, 'runs');
  };

  return (
    <Card
      data-testid={`linked-repo-card-${repo.id}`}
      className={cn(
        'group relative overflow-hidden p-0 transition-colors duration-150',
        detailsOpen && 'ring-1 ring-border/50',
      )}
    >
      <div data-testid="delivery-summary">
        {/* Tier 1: 仓库主行（摘要） */}
        <LinkedRepoHeader
          repo={repo}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((prev) => !prev)}
          palette={palette}
          developerBranch={developerBranch}
          developerBranchState={developerBranchState}
          operationBaseBranch={effectiveOperationBaseBranch}
          traceState={traceState}
          primaryAction={isWriteAction ? undefined : primaryActionNode}
          cardRefreshing={cardRefreshing}
          onRefresh={() => void handleRefreshSingleRepo()}
          hasRuns={Boolean(snapshot?.runs.length)}
          buildTarget={buildTarget}
        />

        {/* Tier 2: 交付状态与指标条 (Status Strip) */}
        <LinkedRepoStatusStrip
          developerBranchState={developerBranchState}
          traceState={traceState}
          divergence={divergence}
          targetActiveMr={targetActiveMr}
          developerBranch={developerBranch}
          operationBaseBranch={effectiveOperationBaseBranch}
          historyMrs={historyMrs}
          hasMatchingMergedMr={hasMatchingMergedMr}
          onViewMr={handleViewMr}
          loadingCi={entry?.loading}
          ciError={Boolean(entry?.error)}
          repoLatestBuild={repoLatestBuild}
          ciBinding={ciBinding}
          latestRun={latestRun}
          snapshot={snapshot}
          ciSummary={ciSummary}
          buildTarget={buildTarget}
          onOpenCiModal={() => {
            setAutoOpenWorkbenchOnBind(false);
            setCiModalOpen(true);
          }}
        />

        {/* Tier 2.5: 摘要常驻入口（只读）——查看详情 / 查看差异 / 查看日志 */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border/40 px-4 py-2">
          <div className="flex flex-wrap items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="gap-1 text-muted-foreground hover:text-foreground"
              onPress={() => setDetailsOpen((prev) => !prev)}
              aria-expanded={detailsOpen}
            >
              <ChevronRightIcon
                className={cn('size-3 transition-transform', detailsOpen && 'rotate-90 text-primary')}
                aria-hidden="true"
              />
              {detailsOpen ? '收起详情' : '查看详情'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="gap-1 text-muted-foreground hover:text-foreground"
              onPress={handleViewDiff}
              title={
                divergence.check.status === 'ready' && branchDiffs.length > 0
                  ? `查看 ${developerBranch} 与 ${effectiveOperationBaseBranch} 的代码差异`
                  : '差异尚未就绪或分支已对齐：展开交付详情查看分支同步结论'
              }
            >
              <FileCodeIcon className="size-3" aria-hidden="true" />
              查看差异
              {divergence.check.status === 'ready' && branchDiffs.length > 0 && (
                <span className="font-mono tabular-nums">({branchDiffs.length})</span>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="gap-1 text-muted-foreground hover:text-foreground"
              onPress={handleViewLogs}
              title={latestRun ? `查看构建 #${latestRun.runId} 的日志` : '暂无构建运行记录，先打开运行记录'}
            >
              <ScrollTextIcon className="size-3" aria-hidden="true" />
              查看日志
            </Button>
          </div>
          {isWriteAction && (
            <span className="text-[11px] text-warning">
              待处理：{delivery.conclusion} · 展开交付详情执行
            </span>
          )}
        </div>
      </div>
      {/* 下沉展开折叠面板 */}
      <Collapsible
        open={detailsOpen}
        onOpenChange={(open) => setDetailsOpen(open)}
        className="min-w-0"
      >
        {/* 收合态下 DisclosurePanel 仅保留 height/clip；内边距与分隔线必须在内层，
            否则收起后仍残留 py + border 的空白条（卡片底部假下边距）。 */}
        <CollapsibleContent className="transition-all">
          <Surface variant="secondary" className="flex flex-col gap-3 border-t border-border/50 px-4 py-3.5">
            {/* 写操作只在展开后的交付详情中出现：建/迭代基准、需求分支、创建 MR、构建参数、取消关联 */}
            {isWriteAction && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-[11px] text-muted-foreground">
                    交付操作（写操作）· {delivery.conclusion}
                  </span>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {primaryActionNode}
                  </div>
                </div>
                <Separator className="bg-border/40" />
              </>
            )}
            {/* 展开面板顶栏（收合由表头展开按钮控制，HeroUI Separator 分隔） */}
            <SectionHeader
              level="h3"
              title={'分支与交付详情 · ' + repo.name}
            />
            <Separator className="bg-border/40" />

            {/* 分支与规则网格 + 差异 + 其他匹配分支 */}
            <LinkedRepoBranchSection
              repoId={repo.id}
              repoName={repo.name}
              developerBranch={developerBranch}
              developerBranchState={developerBranchState}
              operationBaseBranch={effectiveOperationBaseBranch}
              iterationId={iterationId}
              baselineBranch={baselineBranch}
              configuredBaselineBranch={configuredBaselineBranch}
              baselineState={baselineState}
              defaultBaseState={defaultBaseState}
              onRetryBaseline={onRetryBaseline}
              templateId={templateId}
              templates={templates}
              templateEnabled={templateEnabled}
              onTemplateChange={onTemplateChange}
              templateSourceBranch={templateSourceBranch}
              templateSelectId={templateSelectId}
              extraMatchedBranches={extraMatchedBranches}
              trackTemplateName={branchRule?.templateName}
              trackOrigin={branchRule?.origin}
              directConnect={directConnect}
            />

            {/* 合并请求列表 */}
            <LinkedRepoMrList
              repoId={repo.id}
              repoPathWithNamespace={repo.pathWithNamespace}
              developerBranch={developerBranch}
              sortedMergeRequests={sortedMergeRequests}
              expandedMrId={expandedMrId}
              onToggleMr={(localId) => setExpandedMrId((prev) => (prev === localId ? null : localId))}
              onRefresh={() => {
                divergence.refetch();
                void loadTrace({ force: true });
              }}
              onCreateMr={() => setCreateMrOpen(true)}
            />

            {/* 构建操作 */}
            <LinkedRepoCiSection
              repoName={repo.name}
              ciBinding={ciBinding}
              latestRun={latestRun}
              buildAction={renderBuildAction()}
              onOpenCiModal={() => {
                setAutoOpenWorkbenchOnBind(false);
                setCiModalOpen(true);
              }}
            />

            {/* 解除关联（破坏性写操作，同样只出现在展开后的交付详情中） */}
            {onUnlinkRepo && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2">
                <span className="text-[11px] text-muted-foreground">
                  解除「{repo.name}」与需求的关联（写操作）
                </span>
                <WriteOpButton
                  label="取消关联"
                  title={`取消关联仓库 ${repo.name}`}
                  confirmLabel="确认取消关联"
                  variant="outline"
                  onAction={async () => { onUnlinkRepo(repo.id); }}
                />
              </div>
            )}
          </Surface>
        </CollapsibleContent>
      </Collapsible>

      {/* 摘要「查看差异」入口复用的分支差异抽屉（数据来自 useBranchDivergence，不新增状态计算） */}
      {diffDrawerOpen && (
        <CodeDiffDrawer
          open
          onOpenChange={(open) => { if (!open) setDiffDrawerOpen(false); }}
          title={`${repo.name} · 需求分支差异`}
          sourceBranch={developerBranch}
          targetBranch={effectiveOperationBaseBranch}
          diffs={branchDiffs}
        />
      )}

      <RepoCiModal
        open={ciModalOpen}
        onOpenChange={setCiModalOpen}
        repo={repo}
        onSuccess={(saved) => {
          if (saved && autoOpenWorkbenchOnBind) {
            openBuildWorkbenchFromTrigger(buildTarget, 'parameters');
            setAutoOpenWorkbenchOnBind(false);
          }
        }}
      />

      <CreateMrDialog
        open={createMrOpen}
        onOpenChange={setCreateMrOpen}
        repoId={repo.id}
        repoName={repo.pathWithNamespace || repo.name}
        identifier={identifier}
        subject={subject}
        workitemId={workitemId}
        parentWorkitemId={parentWorkitemId}
        sourceBranch={developerBranch}
        targetBranch={effectiveOperationBaseBranch}
        availableBranches={matchedBranches}
        bugContext={bugMrContext ? {
          bugWorkitemId: bugMrContext.bugWorkitemId,
          bugIdentifier: identifier,
          bugSubject: subject,
          requirementIdentifier: bugMrContext.requirementIdentifier,
          requirementSubject: bugMrContext.requirementSubject,
        } : undefined}
        onSuccess={(info) => {
          divergence.refetch();
          void loadTrace({ force: true });
          if (info?.localId) handleViewMr({ localId: info.localId });
        }}
        onNavigateToMr={(localId) => handleViewMr({ localId })}
      />
    </Card>
  );
}
