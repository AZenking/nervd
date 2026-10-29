import { useEffect, useRef, useState } from 'react';
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  GitBranchIcon,
  GitForkIcon,
  GitPullRequestIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  Settings2Icon,
  WorkflowIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { findRemoteBranch } from '@/lib/iteration-branches';
import { errorLog, humanizeError } from '@/lib/error-format';
import { ciStatusText } from '@/lib/ci';
import { useApp } from '@/store/app';
import type { BranchRuleTemplate, MrSummary, RepoSummary } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CopyButton } from '@/components/ui/copy-button';
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select';
import { BuildWorkbenchTrigger, openBuildWorkbenchFromTrigger } from '@/components/build-workbench';
import { WriteOpButton } from '@/components/WriteOpButton';
import { BranchDivergenceCheck, useBranchDivergence } from '../BranchDivergenceCheck';
import { JenkinsBuildDialog } from '../JenkinsBuildDialog';
import { CreateMrDialog } from './create-mr-dialog';
import { RepoCiModal } from './repo-ci-modal';
import { MrInlineItem } from './mr-inline-item';
import { IterationDevDivergence } from './iteration-dev-divergence';
import { cn } from '@/lib/utils';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import {
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
  const [traceRefreshState, setTraceRefreshState] = useState<RepoTraceState | null>(null);
  const [pendingFocus, setPendingFocus] = useState<'template' | 'build' | null>(null);
  const [pendingMrScrollId, setPendingMrScrollId] = useState<number | null>(null);
  const buildActionRef = useRef<HTMLDivElement>(null);

  const divergence = useBranchDivergence(
    repo.id,
    developerBranch,
    operationBaseBranch,
    baselineState,
  );

  const templateSelectId = 'repo-branch-template-' + repo.id;
  const buildTarget = { kind: 'repo' as const, repoId: repo.id, title: repo.name };

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
      } else {
        buildActionRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
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
  const ciSummary = entry?.error
    ? 'CI 查询失败' + (latestRun
      ? ' · 上次 #' + latestRun.runId + ' · ' + (ciScope ?? '分支未记录') + ' · ' + latestCiStatus
      : '')
    : snapshot
      ? 'CI ' + (latestRun ? '#' + latestRun.runId : '暂无运行')
        + ' · ' + (ciScope ?? '分支未记录')
        + ' · ' + latestCiStatus
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

  const handleRevealBuild = () => {
    setPendingFocus('build');
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
    if (ciBinding?.provider === 'flow') {
      return (
        <BuildWorkbenchTrigger
          target={buildTarget}
          label="发起构建"
          title={'触发流水线 ' + ciBinding.pipelineName}
          variant="outline"
        />
      );
    }
    if (ciBinding?.provider === 'jenkins') {
      return (
        <JenkinsBuildDialog
          repoId={repo.id}
          repoName={repo.name}
          defaultBranch={delivery.isAllMerged
            ? (operationBaseBranch || 'master')
            : developerBranchState === 'exists'
              ? developerBranch
              : (operationBaseBranch || 'master')}
          buttonLabel="发起构建"
          buttonVariant="outline"
        />
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setCiModalOpen(true)}
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
        return (
          <Button type="button" size="sm" variant="default" onClick={handleRevealBuild}>
            <GitBranchIcon data-icon="inline-start" />
            发起构建
          </Button>
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

  return (
    <div className="flex flex-col gap-2.5 border-b border-border/60 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranchIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <OverflowTooltip
            text={repo.name}
            className="max-w-64 min-w-0 truncate text-sm font-semibold tracking-tight text-foreground"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {renderPrimaryAction()}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="更多仓库操作" />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setDetailsOpen(true)}>
                展开分支与交付详情
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleRefreshSingleRepo()} disabled={cardRefreshing}>
                <RefreshCwIcon className={cn('mr-2 size-3.5', cardRefreshing && 'animate-spin')} />
                刷新此仓库数据
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openBuildWorkbenchFromTrigger(buildTarget, 'runs')}
                disabled={!snapshot?.runs.length}
              >
                查看 CI 运行记录
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCiModalOpen(true)}>
                <WorkflowIcon className="mr-2 size-3.5" />
                {ciBinding ? '修改关联的 CI 流水线…' : '关联 CI 流水线…'}
              </DropdownMenuItem>
              {developerBranch && (
                <DropdownMenuItem onClick={() => setCreateMrOpen(true)}>
                  <GitPullRequestIcon className="mr-2 size-3.5" />
                  自定义创建 MR…
                </DropdownMenuItem>
              )}
              {onUnlinkRepo && (
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onClick={() => onUnlinkRepo(repo.id)}
                >
                  取消关联此仓库
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs">
        <div className="flex min-w-0 max-w-full items-center gap-1 font-mono text-foreground/85">
          <OverflowTooltip
            text={developerBranch || '需求分支未配置'}
            className="max-w-64 truncate"
          />
          <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <OverflowTooltip
            text={operationBaseBranch || '目标基准未配置'}
            className="max-w-64 truncate text-primary/90"
          />
        </div>
        <span
          className={cn(
            'min-w-0 truncate',
            delivery.tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
            delivery.tone === 'warning' && 'text-amber-700 dark:text-amber-400',
            delivery.tone === 'danger' && 'text-destructive',
            delivery.tone === 'active' && 'text-primary',
            delivery.tone === 'neutral' && 'text-muted-foreground',
          )}
          title={delivery.detail}
        >
          {delivery.conclusion}
        </span>
        <OverflowTooltip
          text={ciSummary}
          className="min-w-0 max-w-full truncate font-mono text-[11px] text-muted-foreground"
        />
      </div>

      <Collapsible
        open={detailsOpen}
        onOpenChange={(open) => setDetailsOpen(open)}
        className="min-w-0"
      >
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-sm py-1 pl-6 pr-1 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <span>分支与交付详情</span>
            <span className="truncate font-normal">
              {activeMrs.length ? '· ' + activeMrs.length + ' 个进行中的 MR' : ''}
              {historyMrs.length ? '· ' + historyMrs.length + ' 条历史 MR' : ''}
            </span>
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 transition-transform group-data-panel-open/collapsible:rotate-180" aria-hidden="true" />
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2 min-w-0 border-t border-border/50 pt-3">
          <div className="flex flex-col gap-3 pl-6">
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
                    onClick={() => setCiModalOpen(true)}
                    className="group inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground cursor-pointer truncate max-w-48"
                    title="点击修改关联的 CI 流水线"
                  >
                    <span className="truncate">· {ciBinding.provider === 'flow' ? ciBinding.pipelineName : 'Jenkins'}</span>
                    <Settings2Icon className="size-3 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCiModalOpen(true)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer transition-colors"
                    title="该仓库尚未关联 CI，点击就地配置云效 Flow 或 Jenkins"
                  >
                    <PlusIcon className="size-3" />
                    <span>未关联 CI · 点击配置</span>
                  </button>
                )}
              </div>
              <div ref={buildActionRef} className="flex shrink-0 items-center">
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
    </div>
  );
}

