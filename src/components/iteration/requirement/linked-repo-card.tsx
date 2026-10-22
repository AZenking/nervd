import { useEffect, useState } from 'react';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  FileCodeIcon,
  GitBranchIcon,
  GitForkIcon,
  GitPullRequestIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
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
import { CiSummaryButton } from '@/components/ci-summary-button';
import { BranchDivergenceCheck, useBranchDivergence } from '../BranchDivergenceCheck';
import { JenkinsBuildDialog } from '../JenkinsBuildDialog';
import { CreateMrDialog } from './create-mr-dialog';
import { MrInlineItem } from './mr-inline-item';
import { IterationDevDivergence } from './iteration-dev-divergence';
import { CodeDiffDrawer } from './code-diff-drawer';
import { cn } from '@/lib/utils';
import {
  type IterationBaselineCheck,
  type ResolvedRepoBranchRule,
} from './types';

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

/** 仓库卡片：展示当前工作项关联的仓库，分支工作流（模板/需求分支/MR）与 CI 状态及就地操作 */
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
  const { repoCiByRepo, settings, loadTrace, setToast } = useApp();
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const ciBinding = settings?.repoCiBindings?.[String(repo.id)];
  const isFlowBound = ciBinding?.provider === 'flow';
  const isJenkinsBound = ciBinding?.provider === 'jenkins';

  const developerBranch = branchRule?.workitemBranch.trim() || (identifier ? `feature/${identifier}` : '');
  const operationBaseBranch = iterationId ? baselineBranch?.trim() ?? '' : 'master';
  const templateSourceBranch = branchRule?.sourceBranch.trim() ?? '';
  const hasValidRule = Boolean(
    branchRule?.sourceBranch.trim() && branchRule.baselineBranch.trim() && branchRule.workitemBranch.trim(),
  );

  const [developerBranchState, setDeveloperBranchState] = useState<IterationBaselineCheck['state']>('loading');
  const [defaultBaseState, setDefaultBaseState] = useState<IterationBaselineCheck['state']>('loading');
  const [createMrOpen, setCreateMrOpen] = useState(false);
  const [expandedMrId, setExpandedMrId] = useState<number | null>(null);
  const [showAllMrs, setShowAllMrs] = useState(false);
  const [diffDrawerOpen, setDiffDrawerOpen] = useState(false);
  const [cardRefreshing, setCardRefreshing] = useState(false);

  const divergence = useBranchDivergence(
    repo.id,
    developerBranch,
    operationBaseBranch,
    baselineState,
  );

  // 编号匹配到的其他分支超出 2 个截断，避免卡片过长
  const extraMatchedBranches = matchedBranches.filter((branch) => branch !== developerBranch);
  const shownMatchedBranches = extraMatchedBranches.slice(0, 2);
  const hiddenMatchedBranchCount = extraMatchedBranches.length - shownMatchedBranches.length;

  useEffect(() => {
    let active = true;
    if (!developerBranch) {
      setDeveloperBranchState('missing');
      return () => { active = false; };
    }
    setDeveloperBranchState('loading');
    void findRemoteBranch(repo.id, developerBranch)
      .then((branch) => { if (active) setDeveloperBranchState(branch ? 'exists' : 'missing'); })
      .catch(() => { if (active) setDeveloperBranchState('error'); });
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
      .then((branch) => { if (active) setDefaultBaseState(branch ? 'exists' : 'missing'); })
      .catch(() => { if (active) setDefaultBaseState('error'); });
    return () => { active = false; };
  }, [repo.id, iterationId, refreshSignal]);

  useEffect(() => {
    if (refreshSignal && refreshSignal > 0) {
      divergence.refetch();
    }
  }, [refreshSignal]);

  // 统一排序 MR 列表：优先匹配本需求开发分支的，其次按 localId 倒序
  const sortedMergeRequests = [...mergeRequests].sort((a, b) => {
    const aMatch = developerBranch && a.sourceBranch === developerBranch ? 1 : 0;
    const bMatch = developerBranch && b.sourceBranch === developerBranch ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    return b.localId - a.localId;
  });

  // 区分活跃 MR 与历史已合入/关闭的 MR
  const activeMrs = sortedMergeRequests.filter((m) => {
    const st = m.state?.toLowerCase();
    return st !== 'merged' && st !== 'closed';
  });
  const historyMrs = sortedMergeRequests.filter((m) => {
    const st = m.state?.toLowerCase();
    return st === 'merged' || st === 'closed';
  });

  // 匹配本需求分支与目标基准分支的活跃中 MR（优先级：当前需求分支到迭代基准 > 当前需求分支的 MR > 按编号倒序第一个）
  const matchedActiveMr = activeMrs.find((request) =>
    (developerBranch && request.sourceBranch === developerBranch && operationBaseBranch && request.targetBranch === operationBaseBranch)
    || (developerBranch && request.sourceBranch === developerBranch),
  );
  const targetActiveMr = matchedActiveMr || activeMrs[0];
  const hasActiveMr = Boolean(targetActiveMr);

  const devOnly = divergence.check.status === 'ready' ? divergence.check.developmentOnly : 0;
  const baselineOnly = divergence.check.status === 'ready' ? divergence.check.baselineOnly : 0;
  const isCheckReady = divergence.check.status === 'ready';
  const isBranchAligned = isCheckReady && devOnly === 0 && baselineOnly === 0;

  // 是否已有待合入代码 (开发分支存在、开发独有提交 > 0 且无活跃 MR)
  const hasPendingCommits = isCheckReady && devOnly > 0 && !hasActiveMr && developerBranchState === 'exists';

  // 是否已经全部合入（开发独有 0，且有历史 MR 或分支已对齐）
  const isAllMerged =
    developerBranchState === 'exists' &&
    !hasActiveMr &&
    ((isCheckReady && devOnly === 0 && (historyMrs.length > 0 || isBranchAligned)) ||
      (!hasActiveMr && historyMrs.length > 0 && devOnly === 0));

  // 智能推荐构建分支：当已全部合入时，预填目标基准分支；需求分支存在未合入时，预填需求分支；否则预填推荐分支或 master
  const recommendedBuildBranch = isAllMerged
    ? (operationBaseBranch || developerBranch || 'master')
    : (developerBranchState === 'exists' && developerBranch
        ? developerBranch
        : (operationBaseBranch || developerBranch || 'master'));

  const branchDisabledReason = placeholderIteration
    ? '占位迭代不支持创建云效分支'
    : !identifier
      ? '工作项编号不可用'
      : iterationId && !hasValidRule
        ? '请先为此仓库选择有效的分支模板'
        : iterationId && baselineState === 'loading'
          ? '正在查询迭代基准分支'
          : iterationId && baselineState === 'error'
            ? '迭代基准查询失败，请重试后再创建'
            : !iterationId && defaultBaseState === 'loading'
              ? '正在查询 master 分支'
              : !iterationId && defaultBaseState !== 'exists'
                ? 'master 分支不可用，无法创建需求分支'
                : !operationBaseBranch
                  ? '模板未生成有效的迭代基准分支'
                  : developerBranchState === 'loading'
                    ? '正在查询需求分支'
                    : developerBranchState === 'exists'
                      ? '需求分支已存在'
                      : undefined;

  const createDeveloperBranch = async () => {
    try {
      if (!identifier || !developerBranch || !operationBaseBranch) throw new Error('需求分支参数不完整');
      if (placeholderIteration) throw new Error('占位迭代不支持创建云效分支');
      if (iterationId && !hasValidRule) throw new Error('请先为此仓库选择有效的分支模板');
      if (developerBranch === operationBaseBranch) throw new Error('需求分支不能与迭代基准分支同名');

      const existing = await findRemoteBranch(repo.id, developerBranch);
      if (existing) {
        setDeveloperBranchState('exists');
        setToast({ text: `需求分支已存在，不会重复创建：${developerBranch}`, kind: 'info' });
        void loadTrace();
        return;
      }

      if (iterationId) {
        let baseline = await findRemoteBranch(repo.id, operationBaseBranch);
        if (!baseline) {
          if (!templateSourceBranch || templateSourceBranch === operationBaseBranch) {
            throw new Error('分支模板的源分支或迭代基准无效');
          }
          const source = await findRemoteBranch(repo.id, templateSourceBranch);
          if (!source) throw new Error(`模板源分支「${templateSourceBranch}」在线上不存在`);
          await api.createBranch(repo.id, operationBaseBranch, templateSourceBranch);
          baseline = await findRemoteBranch(repo.id, operationBaseBranch);
          if (!baseline) throw new Error(`迭代基准「${operationBaseBranch}」创建后未能查询到`);
          onRetryBaseline();
        }
      }

      const source = await findRemoteBranch(repo.id, operationBaseBranch);
      if (!source) throw new Error(`来源分支「${operationBaseBranch}」在线上不存在`);
      await api.createBranch(repo.id, developerBranch, operationBaseBranch);
      setDeveloperBranchState('exists');
      setToast({ text: `需求分支已创建：${developerBranch}`, kind: 'ok' });
      onRetryBaseline();
      divergence.refetch();
      void loadTrace();
    } catch (error) {
      errorLog('workitem-action', error);
      setToast({ text: humanizeError(error), kind: 'fail' });
    }
  };

  /** 定位并展开指定 MR 条目，平滑滚动至视口 */
  const handleViewMr = (mrToView?: MrSummary | { localId: number }) => {
    const target = mrToView || targetActiveMr;
    if (!target) return;
    setExpandedMrId(target.localId);
    setTimeout(() => {
      const el = document.getElementById(`mr-item-${target.localId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 60);
  };

  /** 单仓就地刷新：重新检测分支、落差与 MR 列表 */
  const handleRefreshSingleRepo = async () => {
    if (cardRefreshing) return;
    setCardRefreshing(true);
    try {
      if (developerBranch) {
        setDeveloperBranchState('loading');
        const branch = await findRemoteBranch(repo.id, developerBranch).catch(() => null);
        setDeveloperBranchState(branch ? 'exists' : 'missing');
      }
      onRetryBaseline();
      divergence.refetch();
      await loadTrace();
      setToast({ text: `已刷新「${repo.name}」分支与 MR 数据`, kind: 'ok' });
    } catch (error) {
      errorLog('repo-card-refresh', error);
      setToast({ text: `刷新失败：${humanizeError(error)}`, kind: 'fail' });
    } finally {
      setCardRefreshing(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4 transition-all hover:border-border hover:shadow-xs flex flex-col gap-3.5">
      {/* 头部：仓库标识与全路径 + 模板选择 + MR 入口 (二选一) + 常驻构建入口 + CI 状态与详情 + 更多 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground">
            <GitBranchIcon className="size-4 text-primary" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 font-semibold text-foreground tracking-tight">{repo.name}</span>
              {repo.pathWithNamespace && repo.pathWithNamespace !== repo.name && (
                <span className="truncate font-mono text-xs text-muted-foreground" title={repo.pathWithNamespace}>
                  {repo.pathWithNamespace}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：模板配置 + MR 入口 (查看/创建) + 常驻构建操作 + CI 状态胶囊 + 更多 */}
        <div className="flex shrink-0 items-center gap-2">
          {/* MR 入口（二选一）：有进行中的 MR 展现「查看 MR」，否则展现「创建 MR」 */}
          {loadingBranches && !traceAvailable ? (
            <Skeleton className="h-7 w-20 rounded" />
          ) : hasActiveMr ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => handleViewMr(targetActiveMr)}
              title={`定位并展开进行中的合并请求 !${targetActiveMr?.localId}`}
            >
              <GitPullRequestIcon className="size-3.5" />
              <span>查看 MR{targetActiveMr ? ` (!${targetActiveMr.localId})` : ''}</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setCreateMrOpen(true)}
              title="创建合并请求 (MR)"
            >
              <PlusIcon className="size-3.5" />
              <span>创建 MR</span>
            </Button>
          )}

          {/* 常驻发起构建入口：脱钩“已全部合入”判定，始终常驻可用 */}
            {isFlowBound && ciBinding ? (
              <BuildWorkbenchTrigger
                target={{ kind: 'repo', repoId: repo.id, title: repo.name }}
              label="发起构建"
              title={`触发流水线 ${ciBinding.pipelineName}`}
              variant="default"
            />
          ) : isJenkinsBound && ciBinding ? (
            <JenkinsBuildDialog
              repoId={repo.id}
              repoName={repo.name}
              defaultBranch={recommendedBuildBranch}
              buttonLabel="发起构建"
              buttonVariant="default"
            />
          ) : (
            <JenkinsBuildDialog
              repoId={repo.id}
              repoName={repo.name}
              defaultBranch={recommendedBuildBranch}
              buttonLabel="选择 Job 构建"
              buttonVariant="outline"
            />
          )}

          {/* CI 运行状态与近期构建抽屉入口 */}
          <CiSummaryButton
            status={ciStatusText(snapshot?.status, entry)}
            runCount={snapshot?.runs.length ?? 0}
            error={entry?.error}
            tooltip="点击查看 CI Job、构建分支和环境详情"
            onOpen={() => openBuildWorkbenchFromTrigger({ kind: 'repo', repoId: repo.id, title: repo.name }, 'runs')}
          />

          {/* 单仓独立刷新按钮 */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="刷新此仓库的分支、MR 与落差"
                  disabled={cardRefreshing}
                  onClick={() => void handleRefreshSingleRepo()}
                />
              }
            >
              <RefreshCwIcon className={cn('size-3.5', cardRefreshing && 'animate-spin text-primary')} />
            </TooltipTrigger>
            <TooltipContent>刷新此仓库分支、落差与合并请求</TooltipContent>
          </Tooltip>

          {/* 更多操作下拉菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="更多操作" />}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {developerBranch && developerBranchState === 'missing' && (
                <WriteOpButton
                  asMenuItem
                  label="创建需求分支"
                  title={`创建需求分支 ${developerBranch}`}
                  disabled={Boolean(branchDisabledReason)}
                  disabledReason={branchDisabledReason}
                  onAction={createDeveloperBranch}
                />
              )}
              <DropdownMenuItem onClick={() => setCreateMrOpen(true)}>
                <GitPullRequestIcon className="size-3.5 mr-2" />
                自定义创建 MR…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleRefreshSingleRepo()} disabled={cardRefreshing}>
                <RefreshCwIcon className={cn('size-3.5 mr-2', cardRefreshing && 'animate-spin')} />
                刷新分支与 MR 数据
              </DropdownMenuItem>
              {sortedMergeRequests.length > 0 && !showAllMrs && (
                <DropdownMenuItem onClick={() => setShowAllMrs(true)}>
                  展开全部历史 MR ({sortedMergeRequests.length})
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

      {/* 模块 1：可视化分支拓扑链（水平贯通，完整分支名，无截断） */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-border/40 bg-muted/15 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 font-medium text-muted-foreground shrink-0 text-[11px]">
            <GitBranchIcon className="size-3.5 text-primary" />
            <span>分支拓扑:</span>
          </div>

          {/* 需求分支 */}
          <div className="flex items-center gap-1">
            {developerBranch ? (
              <>
                <code className="rounded bg-muted/80 px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                  {developerBranch}
                </code>
                <CopyButton text={developerBranch} label="复制需求分支名" />
              </>
            ) : (
              <span className="text-muted-foreground font-mono">未配置需求分支</span>
            )}
            {developerBranchState === 'loading' && <Skeleton className="h-4 w-12 rounded" />}
            {developerBranchState === 'exists' && (
              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckIcon className="size-2.5" />已存在
              </span>
            )}
            {developerBranchState === 'missing' && !branchDisabledReason && (
              <WriteOpButton
                label="创建分支"
                title={`创建需求分支 ${developerBranch}`}
                variant="outline"
                onAction={createDeveloperBranch}
              />
            )}
          </div>

          <ArrowRightIcon className="size-3 text-muted-foreground/60 shrink-0" />

          {/* 迭代基准分支（全名展示，无截断） */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">基准:</span>
            {operationBaseBranch ? (
              <>
                <Tooltip>
                  <TooltipTrigger render={<code className="rounded bg-background/80 px-2 py-0.5 font-mono text-xs font-semibold text-primary/90" />}>
                    {operationBaseBranch}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-96 break-all font-mono text-xs">{operationBaseBranch}</TooltipContent>
                </Tooltip>
                <CopyButton text={operationBaseBranch} label="复制基准分支名" />
              </>
            ) : (
              <span className="text-muted-foreground font-mono">—</span>
            )}
            {baselineState === 'loading' && <Skeleton className="h-4 w-12 rounded" />}
            {baselineState === 'error' && (
              <Button type="button" variant="ghost" size="xs" className="h-5 px-1 text-[10px] text-destructive" onClick={onRetryBaseline}>
                基准查询失败 重试
              </Button>
            )}
          </div>

          {/* 来源分支 */}
          {templateSourceBranch && (
            <>
              <ArrowRightIcon className="size-3 text-muted-foreground/60 shrink-0" />
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground">来源:</span>
                <code className="font-mono text-foreground/80 text-xs" title={templateSourceBranch}>
                  {templateSourceBranch}
                </code>
              </div>
            </>
          )}
        </div>

        {/* 迭代基准与主干的实时差异监控 (IterationDevDivergence) */}
        {templateEnabled && baselineState === 'exists' && (
          <div className="shrink-0">
            <IterationDevDivergence
              repoId={repo.id}
              baselineBranch={baselineBranch}
              sourceBranch={templateSourceBranch}
              baselineState={baselineState}
            />
          </div>
        )}
      </div>

      {/* 非主路径配置默认收拢：保留分支关系与交付结论的首屏信息密度 */}
      {templateEnabled && (
        <Collapsible className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
          <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-1.5">
              <GitBranchIcon className="size-3.5" />
              分支模板配置
              {hasValidRule && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">· 已就绪</span>}
            </span>
            <ChevronDownIcon className="size-3.5 transition-transform group-data-panel-open/collapsible:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2.5 border-t border-border/40 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">应用模板:</span>
              <SearchableSelect
                className="h-7 w-56 text-xs"
                value={templateId || '__none'}
                onValueChange={(value) => onTemplateChange(value && value !== '__none' ? value : null)}
                items={[
                  { label: '未选择模板', value: '__none' },
                  ...templates.map((template): SearchableSelectOption<string> => {
                    const scopeTag =
                      'scope' in template && template.scope === 'iteration'
                        ? ' (迭代专属)'
                        : 'scope' in template && template.scope === 'global'
                          ? ' (全局)'
                          : '';
                    return { label: `${template.name}${scopeTag}`, value: template.id };
                  }),
                  ...(templateId && !templates.some((template) => template.id === templateId)
                    ? [{ label: '模板不可用', value: templateId, disabled: true }]
                    : []),
                ]}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* 模块 2：交付进度与状态指引条（仅展示状态结论与指引，移除重复的操作按钮） */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-3 transition-colors',
          hasActiveMr
            ? 'border-primary/40 bg-primary/5'
            : hasPendingCommits
              ? 'border-amber-500/40 bg-amber-500/5'
              : isAllMerged
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-border/50 bg-muted/20',
        )}
      >
        {/* 左侧：结论前置与落差状态说明 */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {hasActiveMr ? (
            <GitPullRequestIcon className="size-4 text-primary shrink-0 animate-pulse" />
          ) : hasPendingCommits ? (
            <GitPullRequestIcon className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : isAllMerged ? (
            <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <GitBranchIcon className="size-4 text-muted-foreground shrink-0" />
          )}

          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground text-xs">
                {iterationId && !hasValidRule
                  ? '尚未配置分支模板'
                  : developerBranchState === 'missing'
                    ? '需求分支尚未在线上创建'
                    : matchedActiveMr
                      ? `MR !${matchedActiveMr.localId} 开放审核中`
                      : hasPendingCommits
                        ? `开发分支有 ${devOnly} 个待合入提交`
                        : isAllMerged
                          ? '代码已全部合入迭代基准'
                          : '两分支代码已同步'}
              </span>

              {/* 落差补充说明标签 */}
              {isCheckReady && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  (开发独有 {devOnly} · 迭代独有 {baselineOnly})
                </span>
              )}
            </div>

            <span className="text-[11px] text-muted-foreground truncate">
              {iterationId && !hasValidRule
                ? '可在上方「分支模板」中选择规则模板，以自动推导迭代基准与需求分支'
                : developerBranchState === 'missing'
                  ? `需先创建分支 ${developerBranch} 后方可进行代码开发与合并`
                  : matchedActiveMr
                    ? `${matchedActiveMr.title} (${matchedActiveMr.sourceBranch} → ${matchedActiveMr.targetBranch})；合入操作可在下方 MR 项中展开执行`
                    : hasPendingCommits
                      ? `代码已推送到 ${developerBranch}，可通过上方「创建 MR」发起合并请求`
                      : isAllMerged
                        ? baselineOnly > 0
                          ? `迭代分支领先 ${baselineOnly} 个提交，若后续继续开发建议反向同步`
                          : '当前需求分支与迭代基准分支完全对齐，可运行构建验证'
                        : '无待提交代码，分支状态健康'}
            </span>
          </div>
        </div>

        {/* 右侧：差异检视辅助动作（合入与创建操作已收归头部及详情） */}
        <div className="flex items-center gap-2 shrink-0">
          {divergence.diffs.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setDiffDrawerOpen(true)}
              title="在本地抽屉中查看代码变动"
            >
              <FileCodeIcon className="size-3 text-primary" />
              <span>差异 ({divergence.diffs.length})</span>
            </Button>
          )}

          {developerBranchState === 'missing' && !branchDisabledReason && (
            <WriteOpButton
              label="创建需求分支"
              title={`创建需求分支 ${developerBranch}`}
              variant="default"
              onAction={createDeveloperBranch}
            />
          )}
        </div>
      </div>

      {/* 模块 3：活跃 MR 详情展示（若有进行中的 MR，就地检视与合入，单仓库单条展开） */}
      {activeMrs.length > 0 && (
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between text-xs font-medium text-foreground px-0.5">
            <span className="flex items-center gap-1.5">
              <GitPullRequestIcon className="size-3.5 text-primary" />
              <span>进行中的合并请求 ({activeMrs.length})</span>
            </span>
          </div>
          {activeMrs.map((mr) => (
            <MrInlineItem
              key={mr.localId}
              mr={mr}
              repoId={repo.id}
              repoPathWithNamespace={repo.pathWithNamespace}
              isExpanded={expandedMrId === mr.localId}
              onToggle={() =>
                setExpandedMrId((prev) => (prev === mr.localId ? null : mr.localId))
              }
              onRefresh={() => {
                divergence.refetch();
                void loadTrace();
              }}
              onCreateMr={() => setCreateMrOpen(true)}
            />
          ))}
        </div>
      )}

      {/* 模块 4：历史 MR 归档条（已合并/已关闭 MR 默认收拢成单行，支持展开单条检视） */}
      {historyMrs.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border/30 bg-muted/10 px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>已合入历史记录 ({historyMrs.length}):</span>
              <span className="font-mono text-[11px] text-foreground/80">
                {historyMrs.map((m) => `!${m.localId}`).join(' · ')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAllMrs((prev) => !prev)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
            >
              <span>{showAllMrs ? '收起历史详情' : '展开详情'}</span>
              <ChevronDownIcon
                className={cn(
                  'size-3.5 transition-transform duration-200',
                  showAllMrs && 'rotate-180',
                )}
              />
            </button>
          </div>

          {/* 展开时才呈现具体的历史 MR 条目（单仓库单条展开） */}
          {showAllMrs && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-border/20">
              {historyMrs.map((mr) => (
                <MrInlineItem
                  key={mr.localId}
                  mr={mr}
                  repoId={repo.id}
                  repoPathWithNamespace={repo.pathWithNamespace}
                  isExpanded={expandedMrId === mr.localId}
                  onToggle={() =>
                    setExpandedMrId((prev) => (prev === mr.localId ? null : mr.localId))
                  }
                  onRefresh={() => {
                    divergence.refetch();
                    void loadTrace();
                  }}
                  onCreateMr={() => setCreateMrOpen(true)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 模块 5：其他关联分支追溯（若有） */}
      {(loadingBranches || shownMatchedBranches.length > 0) && (
        <Collapsible className="rounded-lg border border-border/30 bg-muted/10 px-2.5 py-2 text-xs">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 font-medium text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-1.5">
              <GitForkIcon className="size-3.5" />
              <span>其他关联分支（按需展开）</span>
              {shownMatchedBranches.length > 0 && <span className="font-mono text-[11px]">· {shownMatchedBranches.length + hiddenMatchedBranchCount}</span>}
            </span>
            <ChevronDownIcon className="size-3.5 transition-transform group-data-panel-open/collapsible:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 flex flex-col gap-1.5 border-t border-border/40 pt-2">
            {loadingBranches ? (
              <Skeleton className="h-5 w-28 rounded" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {shownMatchedBranches.map((branch) => (
                  <div key={`${branch}:${baselineBranch ?? ''}`} className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{branch}</code>
                    <CopyButton text={branch} label="复制分支名" />
                    {templateEnabled && (
                      <BranchDivergenceCheck
                        repoId={repo.id}
                        developmentBranch={branch}
                        baselineBranch={baselineBranch}
                        baselineState={baselineState}
                        onRetryBaseline={onRetryBaseline}
                      />
                    )}
                  </div>
                ))}
                {hiddenMatchedBranchCount > 0 && (
                  <span className="text-xs text-muted-foreground">…还有 {hiddenMatchedBranchCount} 个匹配分支</span>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* 仓库 CI 运行详情抽屉 */}

      {/* 创建 MR 自定义表单对话框 */}
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
          if (info?.localId) {
            handleViewMr({ localId: info.localId });
          }
        }}
        onNavigateToMr={(localId) => {
          handleViewMr({ localId });
        }}
      />

      {/* 本地代码分支差异抽屉 */}
      <CodeDiffDrawer
        open={diffDrawerOpen}
        onOpenChange={setDiffDrawerOpen}
        title="分支落差对比"
        sourceBranch={developerBranch}
        targetBranch={operationBaseBranch}
        diffs={divergence.diffs}
      />
    </div>
  );
}
