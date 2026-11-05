import { useEffect, useState } from 'react';
import { ciStatusText } from '@/lib/ci';
import { formatDateTime, formatDuration } from '@/lib/format';
import { useApp } from '@/store/app';
import type { BranchRuleTemplate, MrSummary, RepoSummary } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import type { BuildWorkbenchTarget } from '@/store/ui';
import { useBranchDivergence } from '../BranchDivergenceCheck';
import { CreateMrDialog } from './create-mr-dialog';
import { RepoCiModal } from './repo-ci-modal';
import { Card } from '@/components/ui/card';
import { openBuildWorkbenchFromTrigger } from '@/components/build-workbench';
import { cn } from '@/lib/utils';
import type {
  IterationBaselineCheck,
  ResolvedRepoBranchRule,
} from './types';
import {
  boundJenkinsRunBranch,
  deriveLinkedRepoDelivery,
  latestCiRun,
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

export interface LinkedRepoCardProps {
  repo: RepoSummary;
  identifier: string;
  subject: string;
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
  onRetryBaseline: () => void;
  onTemplateChange: (templateId: string | null) => void;
  onUnlinkRepo?: (repoId: number) => void;
}

/** 需求关联仓库的紧凑摘要；分支与交付细节默认收拢。 */
const REPO_PALETTES = [
  'from-indigo-500/20 to-purple-500/30 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  'from-sky-500/20 to-blue-500/30 text-sky-600 dark:text-sky-400 border-sky-500/20',
  'from-amber-500/20 to-orange-500/30 text-amber-600 dark:text-amber-400 border-amber-500/20',
  'from-emerald-500/20 to-teal-500/30 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'from-rose-500/20 to-pink-500/30 text-rose-600 dark:text-rose-400 border-rose-500/20',
];

function getRepoPalette(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return REPO_PALETTES[Math.abs(hash) % REPO_PALETTES.length];
}

export function LinkedRepoCard({
  repo,
  identifier,
  subject,
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
  } = useApp();
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const ciBinding = settings?.repoCiBindings?.[String(repo.id)];
  const templateSourceBranch = branchRule?.sourceBranch.trim() ?? '';
  const configuredBaselineBranch = branchRule?.baselineBranch.trim() ?? '';
  const hasValidRule = Boolean(
    templateSourceBranch
      && configuredBaselineBranch
      && branchRule?.workitemBranch.trim()
      && templateSourceBranch !== configuredBaselineBranch,
  );
  const developerBranch = branchRule?.workitemBranch.trim()
    || (!iterationId && identifier ? 'feature/' + identifier : '');
  const operationBaseBranch = iterationId
    ? (baselineBranch?.trim() || configuredBaselineBranch)
    : 'master';

  const [createMrOpen, setCreateMrOpen] = useState(false);
  const [expandedMrId, setExpandedMrId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [ciModalOpen, setCiModalOpen] = useState(false);
  const [autoOpenWorkbenchOnBind, setAutoOpenWorkbenchOnBind] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<'template' | null>(null);
  const [pendingMrScrollId, setPendingMrScrollId] = useState<number | null>(null);

  const divergence = useBranchDivergence(
    repo.id,
    developerBranch,
    operationBaseBranch,
    baselineState,
  );

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
    operationBaseBranch,
    templateSourceBranch,
    hasValidRule,
    refreshSignal,
    onRetryBaseline,
    divergence,
    loadTrace,
    loadRepoCi,
    setToast,
  });

  const templateSelectId = 'repo-branch-template-' + repo.id;

  useEffect(() => {
    if (!detailsOpen || !pendingFocus) return;
    const frame = window.requestAnimationFrame(() => {
      if (pendingFocus === 'template') {
        document.getElementById(templateSelectId)?.focus();
      }
      setPendingFocus(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detailsOpen, pendingFocus, templateSelectId]);

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
    const aTargetMatch = operationBaseBranch && a.targetBranch === operationBaseBranch ? 1 : 0;
    const bTargetMatch = operationBaseBranch && b.targetBranch === operationBaseBranch ? 1 : 0;
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
  const targetActiveMr = sourceMatchingActiveMrs.find((mr) => mr.targetBranch === operationBaseBranch)
    ?? sourceMatchingActiveMrs[0];
  const hasMatchingMergedMr = historyMrs.some((mr) =>
    mr.state?.toLowerCase() === 'merged'
      && developerBranch
      && mr.sourceBranch === developerBranch
      && mr.targetBranch === operationBaseBranch,
  );

  const traceState: RepoTraceState = traceRefreshState
    ?? (loadingBranches ? 'loading' : traceAvailable ? 'ready' : 'error');
  const delivery = deriveLinkedRepoDelivery({
    iterationId,
    placeholderIteration,
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
    ? (operationBaseBranch || 'master')
    : developerBranchState === 'exists'
      ? developerBranch
      : (operationBaseBranch || 'master');

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
  const ciScope = snapshot?.provider === 'flow'
    ? '仓库最近构建 · 分支未提供'
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
        ? '请先配置有效的分支规则'
        : iterationId && baselineState !== 'exists'
          ? '请先创建或确认迭代基准分支'
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
    setPendingFocus('template');
    setDetailsOpen(true);
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

  return (
    <Card
      data-testid={`linked-repo-card-${repo.id}`}
      className={cn(
        'group relative p-0 overflow-hidden transition-all duration-150',
        detailsOpen && 'ring-1 ring-border/50',
      )}
    >
      {/* Tier 1: 仓库主行 */}
      <LinkedRepoHeader
        repo={repo}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((prev) => !prev)}
        palette={palette}
        developerBranch={developerBranch}
        developerBranchState={developerBranchState}
        operationBaseBranch={operationBaseBranch}
        primaryAction={
          <LinkedRepoPrimaryAction
            action={delivery.action}
            baselineCreating={baselineCreating}
            operationBaseBranch={operationBaseBranch}
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
        }
        cardRefreshing={cardRefreshing}
        onRefresh={() => void handleRefreshSingleRepo()}
        ciBinding={ciBinding}
        hasRuns={Boolean(snapshot?.runs.length)}
        buildTarget={buildTarget}
        onOpenCiModal={() => {
          setAutoOpenWorkbenchOnBind(false);
          setCiModalOpen(true);
        }}
        onCreateMr={() => setCreateMrOpen(true)}
        onUnlinkRepo={onUnlinkRepo}
      />

      {/* Tier 2: 交付状态与指标条 (Status Strip) */}
      <LinkedRepoStatusStrip
        developerBranchState={developerBranchState}
        traceState={traceState}
        divergence={divergence}
        targetActiveMr={targetActiveMr}
        developerBranch={developerBranch}
        operationBaseBranch={operationBaseBranch}
        historyMrs={historyMrs}
        hasMatchingMergedMr={hasMatchingMergedMr}
        onViewMr={handleViewMr}
        onCreateMr={() => setCreateMrOpen(true)}
        loadingCi={entry?.loading}
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

      {/* 下沉展开折叠面板 */}
      <Collapsible
        open={detailsOpen}
        onOpenChange={(open) => setDetailsOpen(open)}
        className="min-w-0"
      >
        <CollapsibleContent className="border-t border-border/50 px-4 py-3.5 transition-all">
          <div className="flex flex-col gap-3">
            {/* 展开面板顶栏（收合由表头展开按钮控制，HeroUI Separator 分隔） */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                分支与交付详情 · {repo.name}
              </span>
            </div>
            <Separator className="bg-border/40" />

            {/* 分支与规则网格 + 差异 + 其他匹配分支 */}
            <LinkedRepoBranchSection
              repoId={repo.id}
              repoName={repo.name}
              developerBranch={developerBranch}
              developerBranchState={developerBranchState}
              operationBaseBranch={operationBaseBranch}
              iterationId={iterationId}
              baselineBranch={baselineBranch}
              configuredBaselineBranch={configuredBaselineBranch}
              baselineState={baselineState}
              defaultBaseState={defaultBaseState}
              onRetryBaseline={onRetryBaseline}
              templateId={templateId}
              templates={templates}
              templateEnabled={templateEnabled}
              hasValidRule={hasValidRule}
              onTemplateChange={onTemplateChange}
              templateSourceBranch={templateSourceBranch}
              templateSelectId={templateSelectId}
              extraMatchedBranches={extraMatchedBranches}
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
                void loadTrace();
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
          </div>
        </CollapsibleContent>
      </Collapsible>

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
        sourceBranch={developerBranch}
        targetBranch={operationBaseBranch}
        availableBranches={matchedBranches}
        onSuccess={(info) => {
          divergence.refetch();
          void loadTrace();
          if (info?.localId) handleViewMr({ localId: info.localId });
        }}
        onNavigateToMr={(localId) => handleViewMr({ localId })}
      />
    </Card>
  );
}
