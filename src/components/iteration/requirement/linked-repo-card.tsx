import { useEffect, useState } from 'react';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronRightIcon,
  GitBranchIcon,
  GitForkIcon,
  GitPullRequestIcon,
  HistoryIcon,
  InfoIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  Settings2Icon,
  UnlinkIcon,
  WorkflowIcon,
  XCircleIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { findRemoteBranch } from '@/lib/iteration-branches';
import { errorLog, humanizeError } from '@/lib/error-format';
import { ciStatusInfo, ciStatusText } from '@/lib/ci';
import { formatDateTime, formatDuration, formatRelativeTime } from '@/lib/format';
import { useApp } from '@/store/app';
import type { BranchRuleTemplate, MrSummary, RepoSummary } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CopyButton } from '@/components/ui/copy-button';
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select';
import { BuildWorkbenchTrigger, openBuildWorkbenchFromTrigger } from '@/components/build-workbench';
import type { BuildWorkbenchTarget } from '@/store/ui';
import { WriteOpButton } from '@/components/WriteOpButton';
import { BranchDivergenceCheck, useBranchDivergence } from '../BranchDivergenceCheck';
import { CreateMrDialog } from './create-mr-dialog';
import { RepoCiModal } from './repo-ci-modal';
import { MrInlineItem } from './mr-inline-item';
import { IterationDevDivergence } from './iteration-dev-divergence';
import { cn } from '@/lib/utils';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import {
  getMrStatusInfo,
  type IterationBaselineCheck,
  type ResolvedRepoBranchRule,
} from './types';
import {
  boundJenkinsRunBranch,
  deriveLinkedRepoDelivery,
  ensureIterationBaseline,
  latestCiRun,
  type RepoTraceState,
} from './linked-repo-delivery';

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
  'from-indigo-500/20 to-purple-500/30 text-indigo-500 dark:text-indigo-400 border-indigo-500/20',
  'from-sky-500/20 to-blue-500/30 text-sky-500 dark:text-sky-400 border-sky-500/20',
  'from-amber-500/20 to-orange-500/30 text-amber-500 dark:text-amber-400 border-amber-500/20',
  'from-emerald-500/20 to-teal-500/30 text-emerald-500 dark:text-emerald-400 border-emerald-500/20',
  'from-rose-500/20 to-pink-500/30 text-rose-500 dark:text-rose-400 border-rose-500/20',
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

  const [developerBranchState, setDeveloperBranchState] = useState<IterationBaselineCheck['state']>('loading');
  const [defaultBaseState, setDefaultBaseState] = useState<IterationBaselineCheck['state']>('loading');
  const [createMrOpen, setCreateMrOpen] = useState(false);
  const [expandedMrId, setExpandedMrId] = useState<number | null>(null);
  const [cardRefreshing, setCardRefreshing] = useState(false);
  const [baselineCreating, setBaselineCreating] = useState(false);
  const [branchCreating, setBranchCreating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [ciModalOpen, setCiModalOpen] = useState(false);
  const [autoOpenWorkbenchOnBind, setAutoOpenWorkbenchOnBind] = useState(false);
  const [traceRefreshState, setTraceRefreshState] = useState<RepoTraceState | null>(null);
  const [pendingFocus, setPendingFocus] = useState<'template' | null>(null);
  const [pendingMrScrollId, setPendingMrScrollId] = useState<number | null>(null);

  const divergence = useBranchDivergence(
    repo.id,
    developerBranch,
    operationBaseBranch,
    baselineState,
  );

  const templateSelectId = 'repo-branch-template-' + repo.id;

  useEffect(() => {
    let active = true;
    if (!developerBranch) {
      setDeveloperBranchState('missing');
      return () => { active = false; };
    }
    setDeveloperBranchState('loading');
    void findRemoteBranch(repo.id, developerBranch)
      .then((branch) => {
        if (active) setDeveloperBranchState(branch ? 'exists' : 'missing');
      })
      .catch(() => {
        if (active) setDeveloperBranchState('error');
      });
    return () => { active = false; };
  }, [repo.id, developerBranch, refreshSignal]);

  useEffect(() => {
    let active = true;
    if (iterationId) {
      setDefaultBaseState('missing');
      return () => { active = false; };
    }
    setDefaultBaseState('loading');
    void findRemoteBranch(repo.id, 'master')
      .then((branch) => {
        if (active) setDefaultBaseState(branch ? 'exists' : 'missing');
      })
      .catch(() => {
        if (active) setDefaultBaseState('error');
      });
    return () => { active = false; };
  }, [repo.id, iterationId, refreshSignal]);

  useEffect(() => {
    if (refreshSignal && refreshSignal > 0) {
      divergence.refetch();
      setTraceRefreshState(null);
    }
  }, [refreshSignal]);

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

  const refreshAfterBranchWrite = async (successText: string) => {
    onRetryBaseline();
    divergence.refetch();
    try {
      const result = await loadTrace();
      if (result.status === 'success') {
        setTraceRefreshState('ready');
        setToast({ text: successText, kind: 'ok' });
      } else {
        setTraceRefreshState('error');
        const suffix = result.errors.length ? '：' + result.errors.join('；') : '';
        setToast({ text: successText + '，但追溯数据刷新不完整' + suffix, kind: 'info' });
      }
    } catch (error) {
      setTraceRefreshState('error');
      setToast({ text: successText + '，但追溯数据刷新失败：' + humanizeError(error), kind: 'info' });
    }
  };

  const createIterationBaseline = async () => {
    if (baselineCreating) return;
    setBaselineCreating(true);
    try {
      if (!iterationId) throw new Error('当前工作项未关联有效迭代');
      if (placeholderIteration) throw new Error('占位迭代不支持创建云效分支');
      if (!hasValidRule) throw new Error('请先配置有效的分支规则');

      const result = await ensureIterationBaseline({
        repoId: repo.id,
        targetBranch: operationBaseBranch,
        sourceBranch: templateSourceBranch,
        findBranch: findRemoteBranch,
        createBranch: api.createBranch,
      });
      await refreshAfterBranchWrite(
        result.created
          ? '迭代基准分支已创建：' + result.branchName
          : '迭代基准分支已存在：' + result.branchName,
      );
    } catch (error) {
      errorLog('iteration-baseline-create', error);
      setToast({ text: humanizeError(error), kind: 'fail' });
    } finally {
      setBaselineCreating(false);
    }
  };

  const createDeveloperBranch = async () => {
    if (branchCreating) return;
    setBranchCreating(true);
    try {
      if (!identifier || !developerBranch || !operationBaseBranch) {
        throw new Error('需求分支参数不完整');
      }
      if (placeholderIteration) throw new Error('占位迭代不支持创建云效分支');
      if (iterationId && !hasValidRule) throw new Error('请先配置有效的分支规则');
      if (developerBranch === operationBaseBranch) throw new Error('需求分支不能与迭代基准分支同名');

      if (iterationId) {
        const baseline = await ensureIterationBaseline({
          repoId: repo.id,
          targetBranch: operationBaseBranch,
          sourceBranch: templateSourceBranch,
          findBranch: findRemoteBranch,
          createBranch: api.createBranch,
        });
        if (baseline.created) onRetryBaseline();
      } else if (!(await findRemoteBranch(repo.id, operationBaseBranch))) {
        throw new Error('来源分支「' + operationBaseBranch + '」在线上不存在');
      }

      const existing = await findRemoteBranch(repo.id, developerBranch);
      if (existing) {
        setDeveloperBranchState('exists');
        await refreshAfterBranchWrite('需求分支已存在，不会重复创建：' + developerBranch);
        return;
      }

      if (!(await findRemoteBranch(repo.id, operationBaseBranch))) {
        throw new Error('来源分支「' + operationBaseBranch + '」在线上不存在');
      }
      await api.createBranch(repo.id, developerBranch, operationBaseBranch);
      const created = await findRemoteBranch(repo.id, developerBranch);
      if (!created) throw new Error('需求分支创建后未能查询到：' + developerBranch);

      setDeveloperBranchState('exists');
      await refreshAfterBranchWrite('需求分支已创建：' + developerBranch);
    } catch (error) {
      errorLog('workitem-branch-create', error);
      setToast({ text: humanizeError(error), kind: 'fail' });
    } finally {
      setBranchCreating(false);
    }
  };

  const handleRefreshSingleRepo = async () => {
    if (cardRefreshing) return;
    setCardRefreshing(true);
    setTraceRefreshState('loading');
    const errors: string[] = [];

    try {
      if (developerBranch) {
        setDeveloperBranchState('loading');
        try {
          const branch = await findRemoteBranch(repo.id, developerBranch);
          setDeveloperBranchState(branch ? 'exists' : 'missing');
        } catch (error) {
          setDeveloperBranchState('error');
          errors.push('需求分支查询失败：' + humanizeError(error));
        }
      }
      if (!iterationId) {
        setDefaultBaseState('loading');
        try {
          const base = await findRemoteBranch(repo.id, 'master');
          setDefaultBaseState(base ? 'exists' : 'missing');
        } catch (error) {
          setDefaultBaseState('error');
          errors.push('master 查询失败：' + humanizeError(error));
        }
      }

      onRetryBaseline();
      divergence.refetch();
      const traceResult = await loadTrace();
      if (traceResult.status !== 'success') {
        errors.push(
          '追溯数据未完整刷新'
            + (traceResult.errors.length ? '：' + traceResult.errors.join('；') : ''),
        );
      }
      await loadRepoCi(repo.id);
    } catch (error) {
      errors.push(humanizeError(error));
    } finally {
      setCardRefreshing(false);
    }

    if (errors.length) {
      setTraceRefreshState('error');
      errorLog('repo-card-refresh', errors.join('；'));
      setToast({ text: '刷新「' + repo.name + '」失败：' + errors.join('；'), kind: 'fail' });
      return;
    }

    setTraceRefreshState('ready');
    setToast({ text: '已刷新「' + repo.name + '」的分支、MR 与 CI 数据', kind: 'ok' });
  };

  const renderBuildAction = () => {
    if (ciBinding) {
      return (
        <BuildWorkbenchTrigger
          target={buildTarget}
          label="发起构建"
          title={ciBinding.provider === 'flow' ? '触发流水线 ' + ciBinding.pipelineName : '为 ' + repo.name + ' 发起构建'}
          variant="outline"
        />
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setAutoOpenWorkbenchOnBind(false);
          setCiModalOpen(true);
        }}
        className="h-7 text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
      >
        <PlusIcon className="size-3.5" />
        <span>关联 CI</span>
      </Button>
    );
  };

  const renderPrimaryAction = () => {
    switch (delivery.action) {
      case 'configure-rule':
        return (
          <Button type="button" size="sm" variant="outline" onClick={handleConfigureRule}>
            <GitBranchIcon data-icon="inline-start" />
            配置分支规则
          </Button>
        );
      case 'create-baseline':
        return (
          <WriteOpButton
            label={baselineCreating ? '正在创建迭代分支…' : '创建迭代分支'}
            title={'创建迭代基准 ' + operationBaseBranch}
            disabled={baselineCreating}
            disabledReason={baselineCreating ? '迭代基准创建中' : undefined}
            onAction={createIterationBaseline}
          />
        );
      case 'create-workitem-branch':
        return (
          <WriteOpButton
            label={branchCreating ? '正在创建需求分支…' : '创建需求分支'}
            title={'创建需求分支 ' + developerBranch}
            disabled={branchCreating || Boolean(branchDisabledReason)}
            disabledReason={branchDisabledReason}
            onAction={createDeveloperBranch}
          />
        );
      case 'view-mr':
        return (
          <Button type="button" size="sm" variant="outline" onClick={() => handleViewMr(targetActiveMr)}>
            <GitPullRequestIcon data-icon="inline-start" />
            查看 MR !{targetActiveMr?.localId}
          </Button>
        );
      case 'create-mr':
        return (
          <Button type="button" size="sm" variant="default" onClick={() => setCreateMrOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            创建 MR
          </Button>
        );
      case 'build':
        if (!ciBinding) {
          return (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => {
                setAutoOpenWorkbenchOnBind(true);
                setCiModalOpen(true);
              }}
              title="代码已合入，请关联 CI 流水线并准备发起构建"
            >
              <WorkflowIcon data-icon="inline-start" />
              关联 CI 并构建
            </Button>
          );
        }
        return (
          <BuildWorkbenchTrigger
            target={buildTarget}
            label="发起构建"
            title={ciBinding.provider === 'flow' ? '触发流水线 ' + ciBinding.pipelineName : '为 ' + repo.name + ' 发起构建'}
            variant="default"
          />
        );
      case 'retry':
        return (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={cardRefreshing}
            onClick={() => void handleRefreshSingleRepo()}
          >
            <RefreshCwIcon data-icon="inline-start" className={cardRefreshing ? 'animate-spin' : ''} />
            重试查询
          </Button>
        );
      case 'querying':
        return (
          <Button type="button" size="sm" variant="outline" disabled>
            <RefreshCwIcon data-icon="inline-start" className="animate-spin" />
            查询中
          </Button>
        );
      case 'blocked':
        return <Button type="button" size="sm" variant="outline" disabled>暂不可创建</Button>;
      case 'details':
        return (
          <Button type="button" size="sm" variant="outline" onClick={() => setDetailsOpen(true)}>
            查看详情
          </Button>
        );
    }
  };

  const renderBranchStatusColumn = () => {
    if (developerBranchState === 'loading' || traceState === 'loading') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin shrink-0 text-primary" />
          <span className="truncate">查询分支…</span>
        </div>
      );
    }
    if (developerBranchState === 'missing') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-muted-foreground/60 shrink-0" />
          <span className="truncate">未创建需求分支</span>
        </div>
      );
    }
    if (developerBranchState === 'error') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <span className="size-2 rounded-full bg-destructive shrink-0" />
          <span className="truncate">分支查询失败</span>
        </div>
      );
    }
    if (divergence.check.status === 'ready') {
      const devOnly = divergence.check.developmentOnly ?? 0;
      const baseOnly = divergence.check.baselineOnly ?? 0;
      if (devOnly > 0) {
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="truncate">超前 {devOnly} 提交</span>
            {baseOnly > 0 && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-normal truncate" title={`落后基准 ${baseOnly} 提交`}>
                / 需合入 {baseOnly}
              </span>
            )}
          </div>
        );
      }
      if (baseOnly > 0) {
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <span className="size-2 rounded-full bg-amber-500 shrink-0" />
            <span className="truncate">落后基准 {baseOnly} 提交</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="truncate">与基准已对齐</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="truncate">需求分支已就绪</span>
      </div>
    );
  };

  const renderMrStatusColumn = () => {
    // 1. 存在进行中的合并请求 (Active MR)
    if (targetActiveMr) {
      const statusInfo = getMrStatusInfo(
        targetActiveMr.state,
        (targetActiveMr as { hasConflict?: boolean }).hasConflict,
      );
      return (
        <button
          type="button"
          onClick={() => handleViewMr(targetActiveMr)}
          className="group inline-flex items-center gap-1.5 text-xs text-left cursor-pointer transition-colors max-w-full"
          title={`查看合并请求 !${targetActiveMr.localId} · 状态：${statusInfo.label}`}
        >
          <span className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 group-hover:bg-primary/20 shrink-0">
            !{targetActiveMr.localId}
          </span>
          <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium border shrink-0', statusInfo.badgeClass)}>
            {statusInfo.label}
          </span>
        </button>
      );
    }

    const devOnly = divergence.check.status === 'ready' ? (divergence.check.developmentOnly ?? 0) : 0;

    // 2. 无活跃 MR，但存在未合入的提交（分支超前基准）
    if (developerBranchState === 'exists' && devOnly > 0) {
      return (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shrink-0">
            待合入 ({devOnly} 提交)
          </span>
          <button
            type="button"
            onClick={() => setCreateMrOpen(true)}
            className="text-[11px] text-primary hover:underline cursor-pointer shrink-0"
            title="代码已就绪，点击发起 MR 合入基准分支"
          >
            发起 MR
          </button>
        </div>
      );
    }

    // 3. 历史 MR 已合入，且无未合入的新提交
    const matchingMergedMr = historyMrs.find((mr) =>
      mr.state?.toLowerCase() === 'merged'
        && developerBranch
        && mr.sourceBranch === developerBranch
        && mr.targetBranch === operationBaseBranch,
    );
    if (matchingMergedMr) {
      return (
        <button
          type="button"
          onClick={() => handleViewMr(matchingMergedMr)}
          className="group inline-flex items-center gap-1.5 text-xs text-left cursor-pointer transition-colors max-w-full"
          title={`历史合并请求 !${matchingMergedMr.localId} 已成功合入，点击查看详情`}
        >
          <span className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500/20 shrink-0">
            !{matchingMergedMr.localId}
          </span>
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
            已合入
          </span>
        </button>
      );
    }
    if (hasMatchingMergedMr) {
      return (
        <div className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/20 shrink-0">
            已合入
          </span>
        </div>
      );
    }

    // 4. 分支已存在且与基准完全一致（暂无变动）
    if (developerBranchState === 'exists') {
      return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground border border-border/40 shrink-0">
            已对齐
          </span>
          <span className="text-[11px] text-muted-foreground truncate">暂无待合变动</span>
        </div>
      );
    }

    // 5. 需求分支尚未创建
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>— 暂无 MR</span>
      </div>
    );
  };

  const renderCiStatusColumn = () => {
    if (entry?.loading) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin shrink-0 text-primary" />
          <span className="truncate">查询 CI…</span>
        </div>
      );
    }
    if (!ciBinding) {
      return (
        <button
          type="button"
          onClick={() => {
            setAutoOpenWorkbenchOnBind(false);
            setCiModalOpen(true);
          }}
          className="group inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          title="点击关联流水线"
        >
          <span>— 未关联 CI</span>
          <PlusIcon className="size-3 opacity-60 group-hover:opacity-100" />
        </button>
      );
    }
    if (latestRun) {
      const ciInfo = ciStatusInfo(latestRun.status);
      const isSuccess = ciInfo.tone === 'ok';
      const isFailed = ciInfo.tone === 'fail';
      const isRunning = ciInfo.tone === 'run';

      const providerLabel = snapshot?.provider === 'jenkins' ? 'Jenkins' : 'Flow';

      const timeText = latestRun.startTime
        ? formatRelativeTime(latestRun.startTime)
        : '';
      const durationText = latestRun.durationMs != null && latestRun.durationMs > 0
        ? `耗时 ${formatDuration(latestRun.durationMs)}`
        : '';

      return (
        <button
          type="button"
          onClick={() => openBuildWorkbenchFromTrigger(buildTarget, 'runs')}
          className="group inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs cursor-pointer text-left max-w-full"
          title={`${ciSummary}，点击查看构建记录`}
        >
          <div className="flex items-center gap-1 min-w-0 shrink-0">
            {isSuccess && <CheckCircle2Icon className="size-3.5 text-emerald-500 shrink-0" />}
            {isFailed && <XCircleIcon className="size-3.5 text-destructive shrink-0" />}
            {isRunning && <Loader2Icon className="size-3.5 text-amber-500 animate-spin shrink-0" />}
            {!isSuccess && !isFailed && !isRunning && <span className="size-2 rounded-full bg-muted-foreground shrink-0" />}

            <span className="font-mono text-[11px] font-medium text-foreground/90 group-hover:text-primary shrink-0">
              {providerLabel} #{latestRun.runId}
            </span>
            <span className={cn(
              'text-[11px] font-medium shrink-0',
              isSuccess && 'text-emerald-600 dark:text-emerald-400',
              isFailed && 'text-destructive',
              isRunning && 'text-amber-600 dark:text-amber-400',
              !isSuccess && !isFailed && !isRunning && 'text-muted-foreground',
            )}>
              {ciInfo.label}
            </span>
          </div>

          {(timeText || durationText) && (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground font-mono truncate">
              {timeText && <span>· {timeText}</span>}
              {durationText && <span>({durationText})</span>}
            </span>
          )}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setCiModalOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer truncate"
        title="该仓库暂无运行记录，点击查看配置"
      >
        暂无运行记录
      </button>
    );
  };

  const palette = getRepoPalette(repo.name);

  return (
    <article
      data-testid={`linked-repo-card-${repo.id}`}
      className={cn(
        'group relative flex flex-col rounded-lg border border-border/80 bg-card shadow-2xs transition-all duration-150',
        'hover:border-border hover:shadow-xs overflow-hidden',
        detailsOpen && 'border-border ring-1 ring-border/50',
      )}
    >
      {/* Tier 1: 仓库主行（图标、名称、命名空间、分支交付拓扑与操作） */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5">
        {/* 左侧：展开折叠图标 + 仓库图标 + 仓库名称与分支拓扑 */}
        <div className="flex min-w-[240px] flex-1 items-center gap-2.5">
          {/* 左侧详情展开/收起图标按钮 */}
          <button
            type="button"
            onClick={() => setDetailsOpen((prev) => !prev)}
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-all hover:bg-muted hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              detailsOpen && 'bg-muted/70 text-foreground',
            )}
            title={detailsOpen ? '收起分支与交付详情' : '展开分支与交付详情'}
            aria-label={detailsOpen ? '收起分支与交付详情' : '展开分支与交付详情'}
            aria-expanded={detailsOpen}
          >
            <ChevronRightIcon
              className={cn(
                'size-3.5 transition-transform duration-200',
                detailsOpen && 'rotate-90 text-primary',
              )}
            />
          </button>

          <div
            className={cn(
              'flex size-9.5 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br shadow-xs',
              palette,
            )}
            aria-hidden="true"
          >
            <GitBranchIcon className="size-4" />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <OverflowTooltip
                text={repo.name}
                className="text-sm font-semibold tracking-tight text-foreground"
              />
              {repo.pathWithNamespace && (
                <span
                  className="truncate font-mono text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/40 max-w-72"
                  title={repo.pathWithNamespace}
                >
                  {repo.pathWithNamespace}
                </span>
              )}
            </div>

            {/* 分支拓扑示意 */}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] text-muted-foreground shrink-0">交付分支:</span>
              <div className="inline-flex min-w-0 items-center gap-1 rounded bg-muted/60 px-2 py-0.5 border border-border/40 font-mono text-[11px]">
                <OverflowTooltip
                  text={developerBranch || '未配置需求分支'}
                  className={cn(
                    'max-w-44 sm:max-w-64 truncate font-medium',
                    developerBranchState === 'missing'
                      ? 'text-amber-700 dark:text-amber-400 font-medium'
                      : 'text-foreground/90 font-medium',
                  )}
                />
                <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <OverflowTooltip
                  text={operationBaseBranch || '未配置目标基准'}
                  className="max-w-44 sm:max-w-64 truncate font-medium text-primary"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 右侧动作列（主操作 + 更多下拉） */}
        <div className="flex shrink-0 items-center gap-2">
          {renderPrimaryAction()}

          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="更多仓库操作"
              >
                <span>更多</span>
              </Button>
            } />
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => void handleRefreshSingleRepo()} disabled={cardRefreshing}>
                <RefreshCwIcon className={cn('size-3.5', cardRefreshing && 'animate-spin')} />
                <span>刷新数据</span>
              </DropdownMenuItem>
              {ciBinding && (
                <DropdownMenuItem
                  onClick={() => openBuildWorkbenchFromTrigger(buildTarget, 'parameters')}
                >
                  <WorkflowIcon className="size-3.5" />
                  <span>发起构建…</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => openBuildWorkbenchFromTrigger(buildTarget, 'runs')}
                disabled={!snapshot?.runs.length}
              >
                <HistoryIcon className="size-3.5" />
                <span>构建记录</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setAutoOpenWorkbenchOnBind(false);
                  setCiModalOpen(true);
                }}
              >
                <Settings2Icon className="size-3.5" />
                <span>{ciBinding ? '修改流水线…' : '关联流水线…'}</span>
              </DropdownMenuItem>
              {developerBranch && (
                <DropdownMenuItem onClick={() => setCreateMrOpen(true)}>
                  <GitPullRequestIcon className="size-3.5" />
                  <span>创建 MR…</span>
                </DropdownMenuItem>
              )}
              {onUnlinkRepo && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onUnlinkRepo(repo.id)}
                  >
                    <UnlinkIcon className="size-3.5" />
                    <span>取消关联</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tier 2: 交付状态与指标条 (Status Strip) */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border/50 bg-muted/20 px-4 py-2.5 text-xs">
        {/* 分支状态 */}
        <div className="flex min-w-[130px] flex-1 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">分支状态:</span>
          <div className="min-w-0 flex-1">{renderBranchStatusColumn()}</div>
        </div>

        {/* 合并请求 (MR) */}
        <div className="flex min-w-[140px] flex-1 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">合并请求:</span>
          <div className="min-w-0 flex-1">{renderMrStatusColumn()}</div>
        </div>

        {/* 最近构建 (CI) */}
        <div className="flex min-w-[180px] flex-1 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">最近构建:</span>
          <div className="min-w-0 flex-1">{renderCiStatusColumn()}</div>
        </div>
      </div>

      {/* 下沉展开折叠面板 */}
      <Collapsible
        open={detailsOpen}
        onOpenChange={(open) => setDetailsOpen(open)}
        className="min-w-0"
      >
        <CollapsibleContent className="border-t border-border/50 bg-muted/20 px-4 py-3.5 transition-all">
          <div className="flex flex-col gap-3">
            {/* 展开面板顶栏 */}
            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
              <span className="text-xs font-semibold text-foreground">
                分支与交付详情 · {repo.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setDetailsOpen(false)}
              >
                收起详情
              </Button>
            </div>
            {/* 分支元数据与规则网格 (2x2 Grid) */}
            <section className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 text-xs" aria-label="分支与交付信息">
              {/* 需求分支 */}
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-muted-foreground">需求分支</span>
                {developerBranch ? (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <OverflowTooltip
                      text={developerBranch}
                      className="max-w-36 sm:max-w-48 truncate rounded-sm bg-muted/70 px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground"
                    />
                    <CopyButton text={developerBranch} label="复制需求分支名" />
                    {developerBranchState === 'exists' && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <CheckIcon className="size-3" aria-hidden="true" />已存在
                      </span>
                    )}
                    {developerBranchState === 'loading' && <Skeleton className="h-4 w-10 rounded-sm" />}
                    {developerBranchState === 'error' && (
                      <span className="shrink-0 text-[11px] text-destructive">查询失败</span>
                    )}
                  </div>
                ) : (
                  <span className="font-mono text-muted-foreground">未配置</span>
                )}
              </div>

              {/* 目标基准 */}
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-muted-foreground">目标基准</span>
                {operationBaseBranch ? (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger render={<code className="max-w-36 sm:max-w-48 truncate rounded-sm bg-background px-1.5 py-0.5 font-mono text-xs text-primary/90" />}>
                        {operationBaseBranch}
                      </TooltipTrigger>
                      <TooltipContent className="max-w-96 break-all font-mono text-xs">{operationBaseBranch}</TooltipContent>
                    </Tooltip>
                    <CopyButton text={operationBaseBranch} label="复制目标基准分支名" />
                    {iterationId && baselineState === 'missing' && (
                      <span className="shrink-0 text-[11px] text-amber-700 dark:text-amber-400">未创建</span>
                    )}
                    {iterationId && baselineState === 'error' && (
                      <Button type="button" variant="ghost" size="xs" className="h-5 px-1 text-[10px] text-destructive" onClick={onRetryBaseline}>
                        重试
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="font-mono text-muted-foreground">未配置</span>
                )}
              </div>

              {/* 分支规则 */}
              {(iterationId || templateEnabled) ? (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-muted-foreground">分支规则</span>
                  <div className="min-w-0 flex-1 max-w-56">
                    <SearchableSelect
                      id={templateSelectId}
                      ariaLabel={'为 ' + repo.name + ' 选择分支模板'}
                      className="h-7 w-full text-xs py-0.5"
                      value={templateId || '__none'}
                      onValueChange={(value) => onTemplateChange(value && value !== '__none' ? value : null)}
                      items={[
                        { label: '未选择模板', value: '__none' },
                        ...templates.map((template): SearchableSelectOption<string> => {
                          const scopeTag = 'scope' in template && template.scope === 'iteration'
                            ? ' (迭代专属)'
                            : 'scope' in template && template.scope === 'global'
                              ? ' (全局)'
                              : '';
                          return { label: template.name + scopeTag, value: template.id };
                        }),
                        ...(templateId && !templates.some((template) => template.id === templateId)
                          ? [{ label: '模板不可用', value: templateId, disabled: true }]
                          : []),
                      ]}
                    />
                  </div>
                  {!hasValidRule && (
                    <span className="shrink-0 text-[11px] text-amber-700 dark:text-amber-400" title="需要选择有效模板">需选模板</span>
                  )}
                </div>
              ) : (
                <div />
              )}

              {/* 主干同步 / 模板源分支 */}
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                {templateSourceBranch && (
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-muted-foreground">模板源</span>
                    <OverflowTooltip
                      text={templateSourceBranch}
                      className="max-w-32 font-mono text-xs text-foreground/80"
                    />
                  </div>
                )}
                {iterationId && templateSourceBranch && baselineState === 'exists' && (
                  <div className="min-w-0 flex-1">
                    <IterationDevDivergence
                      repoId={repo.id}
                      baselineBranch={baselineBranch ?? configuredBaselineBranch}
                      sourceBranch={templateSourceBranch}
                      baselineState={baselineState}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* 分支同步差异 */}
            <section className="min-w-0 border-t border-border/40 pt-2.5" aria-label="分支差异">
              <BranchDivergenceCheck
                repoId={repo.id}
                developmentBranch={developerBranch}
                baselineBranch={operationBaseBranch}
                baselineState={iterationId ? baselineState : defaultBaseState}
                onRetryBaseline={onRetryBaseline}
              />
            </section>

            {/* 合并请求 */}
            <section className="flex min-w-0 flex-col gap-1.5 border-t border-border/40 pt-2.5" aria-label="合并请求">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <GitPullRequestIcon className="size-3.5 text-primary" aria-hidden="true" />
                  <span>合并请求</span>
                  <span className="font-mono text-[11px] text-muted-foreground">({sortedMergeRequests.length})</span>
                  {sortedMergeRequests.length === 0 && (
                    <span className="text-xs font-normal text-muted-foreground">· 暂无合并请求</span>
                  )}
                </div>
                {developerBranch && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                    onClick={() => setCreateMrOpen(true)}
                  >
                    <PlusIcon className="size-3" />
                    创建 MR
                  </Button>
                )}
              </div>
              {sortedMergeRequests.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {sortedMergeRequests.map((mr) => (
                    <MrInlineItem
                      key={mr.localId}
                      mr={mr}
                      repoId={repo.id}
                      repoPathWithNamespace={repo.pathWithNamespace}
                      isExpanded={expandedMrId === mr.localId}
                      onToggle={() => setExpandedMrId((previous) => previous === mr.localId ? null : mr.localId)}
                      onRefresh={() => {
                        divergence.refetch();
                        void loadTrace();
                      }}
                      onCreateMr={() => setCreateMrOpen(true)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 其他匹配分支 */}
            {extraMatchedBranches.length > 0 && (
              <section className="flex min-w-0 flex-col gap-2 border-t border-border/40 pt-2.5" aria-label="其他关联分支">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <GitForkIcon className="size-3.5" aria-hidden="true" />
                  <span>其他匹配分支</span>
                  <span className="font-mono text-[11px] text-muted-foreground">({extraMatchedBranches.length})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {extraMatchedBranches.map((branch) => (
                    <div key={branch} className="flex items-center gap-1">
                      <OverflowTooltip
                        text={branch}
                        className="max-w-64 rounded-sm bg-muted/70 px-1.5 py-0.5 font-mono text-xs"
                      />
                      <CopyButton text={branch} label="复制分支名" />
                      {templateEnabled && operationBaseBranch && (
                        <BranchDivergenceCheck
                          repoId={repo.id}
                          developmentBranch={branch}
                          baselineBranch={operationBaseBranch}
                          baselineState={baselineState}
                          onRetryBaseline={onRetryBaseline}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 构建操作 */}
            <section className="flex min-w-0 items-center justify-between gap-2 border-t border-border/40 pt-2.5 text-xs" aria-label="构建操作">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="font-medium text-foreground">构建</span>
                <Tooltip>
                  <TooltipTrigger render={<InfoIcon className="size-3.5 text-muted-foreground/70 hover:text-foreground cursor-help" aria-label="构建说明" />} />
                  <TooltipContent className="max-w-72 text-xs">
                    Jenkins 构建使用所绑定参数中该次运行记录的实际分支；Flow 未提供分支时按仓库最近构建显示。
                  </TooltipContent>
                </Tooltip>
                {ciBinding ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAutoOpenWorkbenchOnBind(false);
                      setCiModalOpen(true);
                    }}
                    className="group inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground cursor-pointer truncate max-w-48"
                    title="点击修改关联的 CI 流水线"
                  >
                    <span className="truncate">· {ciBinding.provider === 'flow' ? ciBinding.pipelineName : 'Jenkins'}</span>
                    <Settings2Icon className="size-3 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAutoOpenWorkbenchOnBind(false);
                      setCiModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer transition-colors"
                    title="该仓库尚未关联 CI，点击就地配置云效 Flow 或 Jenkins"
                  >
                    <PlusIcon className="size-3" />
                    <span>未关联 CI · 点击配置</span>
                  </button>
                )}
                {latestRun?.startTime && (
                  <span className="hidden sm:inline text-[11px] text-muted-foreground font-mono truncate max-w-64" title={`构建时间：${formatDateTime(latestRun.startTime)}`}>
                    · 上次构建 {formatRelativeTime(latestRun.startTime)}
                    {latestRun.durationMs != null && latestRun.durationMs > 0 ? ` (${formatDuration(latestRun.durationMs)})` : ''}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center">
                {renderBuildAction()}
              </div>
            </section>
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
    </article>
  );
}

