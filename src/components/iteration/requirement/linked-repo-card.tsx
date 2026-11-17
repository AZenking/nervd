import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon } from 'lucide-react';
import { ciStatusText } from '@/lib/ci';
import { formatDateTime, formatDuration } from '@/lib/format';
import { useApp } from '@/store/app';
import { useShallow } from 'zustand/react/shallow';
import { useUi } from '@/store/ui';
import type { BranchRuleTemplate, MrSummary, RepoSummary } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import type { BuildWorkbenchTarget } from '@/store/ui';
import { useBranchDivergence } from '../BranchDivergenceCheck';
import { CreateMrDialog } from './create-mr-dialog';
import { RepoCiModal } from './repo-ci-modal';
import {
  Card,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/toast';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { CopyButton } from '@/components/ui/copy-button';
import { openBuildWorkbenchFromTrigger } from '@/components/build-workbench';
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

/** 交付主操作中的写操作：只能出现在展开后的交付详情中，摘要行不得常驻。 */
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

  const allowWriteOps = useApp((state) => state.settings?.allowWriteOps ?? false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  /** 更多菜单里的「取消关联」：只读态给 Toast 引导，可写态走 AlertDialog 二次确认。 */
  const requestUnlink = () => {
    if (!onUnlinkRepo) return;
    if (!allowWriteOps) {
      toast.add({
        title: '当前处于只读模式',
        description: '「取消关联」是写操作。可在「设置 → 安全与权限」中开启写权限后执行。',
        type: 'warning',
        actionProps: {
          children: '前往设置',
          onClick: () => useUi.getState().openSettings('security'),
        },
      });
      return;
    }
    setUnlinkOpen(true);
  };

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

  // 动作归位（2026-11-17 布局评审）：
  // - 分支/规则类动作（建迭代基准、建需求分支、阻塞说明、前往配置轨道）随「分支关系」标题行；
  // - create-mr / build 由「合并请求」「构建」Surface 自己的按钮承载，避免重复；
  // - 回退态（重试查询 / 查询中 / 查看详情）留在卡片 Header，收起时仍可操作。
  const BRANCH_SURFACE_ACTIONS = new Set<LinkedRepoDeliveryDecision['action']>([
    'create-baseline',
    'create-workitem-branch',
    'blocked',
    'configure-rule',
  ]);
  const HEADER_FALLBACK_ACTIONS = new Set<LinkedRepoDeliveryDecision['action']>([
    'retry',
    'querying',
    'details',
  ]);
  const deliveryActionNode = BRANCH_SURFACE_ACTIONS.has(delivery.action) ? primaryActionNode : undefined;
  const headerActionNode = HEADER_FALLBACK_ACTIONS.has(delivery.action) ? primaryActionNode : undefined;

  return (
    <Card
      data-testid={`linked-repo-card-${repo.id}`}
      // 结构交给 HeroUI Card 插槽；排列与间距由 Tailwind 控制。
      // @container：摘要三列依据「卡片实际可用宽度」切换，而不是窗口宽度。
      variant="transparent"
      className="@container gap-0 rounded-lg border border-border bg-surface p-0"
    >
      <LinkedRepoHeader
        repo={repo}
        palette={palette}
        traceState={traceState}
        primaryAction={headerActionNode}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((prev) => !prev)}
        onUnlink={onUnlinkRepo ? requestUnlink : undefined}
        cardRefreshing={cardRefreshing}
        onRefresh={() => void handleRefreshSingleRepo()}
        hasRuns={Boolean(snapshot?.runs.length)}
        buildTarget={buildTarget}
      />

      <Card.Content className="space-y-4 px-5 pb-5">
        <div data-testid="delivery-summary" className="space-y-4">
          {/* 交付分支路径：需求分支 → 目标基准（长名截断 + 悬停查看全文 + 复制） */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="shrink-0 text-[11px] text-muted-foreground">交付分支</span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <OverflowTooltip
                text={developerBranch || '未配置需求分支'}
                className="max-w-56 truncate font-mono text-[12px] text-foreground/90"
              />
              {developerBranch && <CopyButton text={developerBranch} label="复制需求分支名" />}
            </span>
            <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
            <span className="inline-flex min-w-0 items-center gap-1">
              <OverflowTooltip
                text={effectiveOperationBaseBranch || '未配置目标基准'}
                className="max-w-56 truncate font-mono text-[12px] text-foreground/90"
              />
              {effectiveOperationBaseBranch && (
                <CopyButton text={effectiveOperationBaseBranch} label="复制目标基准分支名" />
              )}
            </span>
          </div>

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
        </div>

        <Collapsible
          open={detailsOpen}
          onOpenChange={(open) => setDetailsOpen(open)}
          className="min-w-0"
        >
          <CollapsibleContent className="transition-all">
            <div className="flex flex-col gap-4">
              {/* 分支关系：占满 Card 宽度 */}
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
                deliveryAction={deliveryActionNode}
              />

              {/* 合并请求 / 构建：容器宽度不足 320px 一列时自动上下排列 */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
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

                <LinkedRepoCiSection
                  repoName={repo.name}
                  ciBinding={ciBinding}
                  latestRun={latestRun}
                  buildAction={renderBuildAction()}
                  onOpenCiModal={() => {
                    setAutoOpenWorkbenchOnBind(false);
                    setCiModalOpen(true);
                  }}
                  buildBranch={actualJenkinsBranch || effectiveOperationBaseBranch}
                  onViewRuns={() => openBuildWorkbenchFromTrigger(buildTarget, 'runs')}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card.Content>

      {/* 取消关联确认：沿用写操作的 AlertDialog 二次确认（入口在「更多」菜单） */}
      <AlertDialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认取消关联</AlertDialogTitle>
            <AlertDialogDescription>
              「取消关联」为写操作，将解除「{repo.name}」与本需求的关联。确定继续吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setUnlinkOpen(false)}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onPress={() => {
                setUnlinkOpen(false);
                onUnlinkRepo?.(repo.id);
              }}
            >
              确认取消关联
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
