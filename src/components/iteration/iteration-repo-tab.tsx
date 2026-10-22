import { useMemo, useState } from 'react';
import {
  FolderGit2Icon,
  GitBranchIcon,
  TerminalIcon,
  ClockIcon,
  UserIcon,
  RefreshCwIcon,
  ServerIcon,
  Loader2Icon,
  Link2Icon,
  ChevronRightIcon,
} from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import type { RepoSummary } from '@/types';
import { buildRunParameter, ciProviderLabel, ciStatusText } from '@/lib/ci';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { EmptyHint } from '@/components/empty-hint';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusIcon } from '@/components/status-icon';
import { JenkinsBuildDialog } from './JenkinsBuildDialog';
import { BuildWorkbenchTrigger, openBuildWorkbenchFromTrigger, openRepoBuildLogs } from '@/components/build-workbench';
import { KeyboardPagination } from './keyboard-pagination';

type WorkitemItem = ReturnType<typeof useApp.getState>['items'][number];

const REPO_PAGE_SIZE = 8;

export interface IterationScopedRepo {
  repo: RepoSummary;
  /** 本迭代涉及的工作项列表 */
  workitems: WorkitemItem[];
  /** 推荐的迭代预填分支（来自匹配的分支模板或开发分支） */
  suggestedBranch?: string;
}

/**
 * 单个涉及仓库卡片：
 * 1. 仓库基本信息与 CI 状态徽标
 * 2. 正在构建看板（Active Running Job Area）：实时感知构建 Job、运行号、分支、环境、耗时与实时日志
 * 3. 最近构建结果（非运行态下）：分支、环境、耗时与日志入口
 * 4. 操作区：手动选择分支和环境触发验证 + 查看 CI 详情
 * 5. 关联工作项流：展示本迭代内修改该仓库的需求列表，点击联动查看详情
 */
export function IterationRepoCard({
  repoItem,
  onOpenDetail,
}: {
  repoItem: IterationScopedRepo;
  onOpenDetail?: (item: WorkitemItem) => void;
}) {
  const { repo, workitems, suggestedBranch } = repoItem;
  const { repoCiByRepo, settings } = useApp();

  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const binding = settings?.repoCiBindings?.[String(repo.id)];
  const isFlow = binding?.provider === 'flow';
  const isJenkins = binding?.provider === 'jenkins';
  const isBound = Boolean(binding);
  const providerLabel = ciProviderLabel(binding);

  const runs = isBound ? snapshot?.runs ?? [] : [];

  // 判断是否有正在运行中的 Job（RUNNING / WAITING / QUEUED）
  const runningRun = runs.find((r) => {
    const s = (r.status || '').toUpperCase();
    return s === 'RUNNING' || s === 'WAITING' || s === 'QUEUED';
  }) || (snapshot?.status?.toUpperCase() === 'RUNNING' ? runs[0] : undefined);

  const isRunning = Boolean(runningRun);
  const latestRun = runs[0];

  const jenkinsBinding = isJenkins ? binding : undefined;

  // 提取正在运行 Job 的分支与环境
  const runningBranch = runningRun
    ? buildRunParameter(runningRun, jenkinsBinding?.branchParameter, 'branch')
    : undefined;
  const runningEnvironment = runningRun
    ? buildRunParameter(runningRun, jenkinsBinding?.environmentParameter, 'environment')
    : undefined;

  // 提取最近一次构建的分支与环境
  const latestBranch = latestRun
    ? buildRunParameter(latestRun, jenkinsBinding?.branchParameter, 'branch')
    : undefined;
  const latestEnvironment = latestRun
    ? buildRunParameter(latestRun, jenkinsBinding?.environmentParameter, 'environment')
    : undefined;

  // 验证构建推荐预填分支：优先推荐建议分支，其次取上次构建分支，再回退 master
  const defaultVerifyBranch = suggestedBranch
    || (latestBranch && latestBranch !== '未记录' ? latestBranch : undefined);

  const runningJobName = snapshot?.name || (isFlow ? binding?.pipelineName : isJenkins ? binding?.jobFullName : '构建任务');

  return (
    <>
      <div className={cn(
        'group flex flex-col rounded-lg border bg-background p-4 transition-all duration-200',
        isRunning ? 'border-amber-500/50 shadow-xs' : 'border-border/70 hover:border-border',
      )}>
        {/* 卡片头部：仓库基本信息 + CI 状态 + 触发验证 / 详情按钮 */}
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-border/40">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn(
              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors',
              isRunning
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                : 'border-border/60 bg-muted/30 group-hover:text-foreground',
            )}>
              <FolderGit2Icon className="size-4" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {repo.pathWithNamespace || repo.name}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground/70">
                  #{repo.id}
                </span>
                <Badge variant="outline" className="text-[11px] font-normal py-0 px-1.5 h-4.5">
                  {providerLabel}
                </Badge>
                {suggestedBranch && (
                  <Tooltip>
                    <TooltipTrigger render={
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded cursor-default max-w-44 truncate">
                        <GitBranchIcon className="size-3 shrink-0" />
                        <span className="truncate">{suggestedBranch}</span>
                      </span>
                    } />
                    <TooltipContent>当前迭代推导分支：{suggestedBranch}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                涉及本迭代 <span className="font-medium text-foreground font-mono">{workitems.length}</span> 项工作项
              </p>
            </div>
          </div>

          {/* 右侧动作与状态 */}
          <div className="flex shrink-0 items-center gap-2">
            {/* 状态徽标 */}
            {isBound ? (
              <StatusBadge
                status={isRunning ? 'RUNNING' : ciStatusText(snapshot?.status, entry)}
                size="sm"
              />
            ) : (
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                未绑定 CI
              </span>
            )}

            {/* 手动选择分支与环境触发验证 */}
            {isJenkins && (
              <JenkinsBuildDialog
                repoId={repo.id}
                repoName={repo.name}
                defaultBranch={defaultVerifyBranch}
                buttonLabel="触发验证"
                buttonVariant={isRunning ? 'secondary' : 'default'}
              />
            )}
            {isFlow && (
              <BuildWorkbenchTrigger
                target={{ kind: 'repo', repoId: repo.id, title: repo.name }}
                label="触发流水线验证"
                title={`触发流水线 ${binding.pipelineName}`}
                variant={isRunning ? 'secondary' : 'default'}
              />
            )}
            {!isBound && (
              <JenkinsBuildDialog
                repoId={repo.id}
                repoName={repo.name}
                defaultBranch={defaultVerifyBranch}
                buttonLabel="选择 Job 验证"
                buttonVariant="outline"
              />
            )}

            {/* CI 详情 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBuildWorkbenchFromTrigger({ kind: 'repo', repoId: repo.id, title: repo.name }, 'runs')}
              className="text-xs"
            >
              CI 详情
            </Button>
          </div>
        </div>

        {/* 正在构建看板（Active Running Job Area）：用户能够清晰知道当前关联的正在构建的 job */}
        {isRunning && runningRun && (
          <div className="mt-3.5 flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Loader2Icon className="size-4 shrink-0 animate-spin text-amber-500" />
                <span className="font-medium text-amber-500">正在构建 Job</span>
                <span className="font-mono font-semibold text-foreground truncate max-w-64" title={runningJobName}>
                  {runningJobName}
                </span>
                <span className="font-mono text-muted-foreground">#{runningRun.runId}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 gap-1"
                  onClick={() => openRepoBuildLogs(repo.id, runningRun.runId, `${repo.name} · #${runningRun.runId}`)}
                >
                  <TerminalIcon className="size-3" />
                  <span>实时日志</span>
                </Button>
              </div>
            </div>

            {/* 正在构建 Job 的分支、环境、耗时与触发人 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground">
              {runningBranch && runningBranch !== '未记录' && (
                <div className="flex items-center gap-1 font-mono text-foreground/90">
                  <GitBranchIcon className="size-3 text-muted-foreground" />
                  <span className="rounded bg-background/80 px-1.5 py-0.2 border border-border/50 text-[11px]">
                    {runningBranch}
                  </span>
                </div>
              )}
              {runningEnvironment && runningEnvironment !== '未记录' && (
                <div className="flex items-center gap-1 font-mono text-foreground/90">
                  <ServerIcon className="size-3 text-muted-foreground" />
                  <span className="rounded bg-background/80 px-1.5 py-0.2 border border-border/50 text-[11px]">
                    {runningEnvironment}
                  </span>
                </div>
              )}
              {runningRun.durationMs != null && (
                <div className="flex items-center gap-1 text-[11px]">
                  <ClockIcon className="size-3" />
                  <span>已运行 {formatDuration(runningRun.durationMs)}</span>
                </div>
              )}
              {runningRun.trigger && (
                <div className="flex items-center gap-1 text-[11px]">
                  <UserIcon className="size-3" />
                  <span>触发人: {runningRun.trigger}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 最近构建记录（非构建状态下展示） */}
        {!isRunning && latestRun && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <span className="text-[11px] text-muted-foreground/80 shrink-0">最近验证：</span>
              <span className="font-mono text-foreground/90">#{latestRun.runId}</span>
              {latestBranch && latestBranch !== '未记录' && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground/80">
                  <GitBranchIcon className="size-3 text-muted-foreground" />
                  <span>{latestBranch}</span>
                </span>
              )}
              {latestEnvironment && latestEnvironment !== '未记录' && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground/80">
                  <ServerIcon className="size-3 text-muted-foreground" />
                  <span>{latestEnvironment}</span>
                </span>
              )}
              {latestRun.durationMs != null && (
                <span className="text-[11px] tabular-nums">耗时 {formatDuration(latestRun.durationMs)}</span>
              )}
              {latestRun.trigger && (
                <span className="text-[11px]">由 {latestRun.trigger} 触发</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="h-6 text-xs text-muted-foreground hover:text-foreground shrink-0 gap-1"
              onClick={() => openRepoBuildLogs(repo.id, latestRun.runId, `${repo.name} · #${latestRun.runId}`)}
            >
              <TerminalIcon className="size-3" />
              <span>构建日志</span>
            </Button>
          </div>
        )}

        {/* 本迭代涉及工作项胶囊列表 */}
        {workitems.length > 0 && (
          <div className="mt-3.5 flex flex-col gap-2 pt-2 border-t border-border/30">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="text-[11px] font-medium text-muted-foreground/80">
                本迭代涉及工作项（{workitems.length}）
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {workitems.map((item) => (
                <button
                  key={item.workitemId}
                  type="button"
                  onClick={() => onOpenDetail?.(item)}
                  className="group/item inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs text-foreground/90 transition-colors hover:border-primary/50 hover:bg-muted/80 cursor-pointer"
                >
                  <StatusIcon status={item.status} className="size-3 shrink-0" />
                  <span className="font-mono text-[11px] font-medium text-muted-foreground group-hover/item:text-foreground">
                    {item.identifier}
                  </span>
                  <OverflowTooltip
                    text={item.subject}
                    tooltip={`${item.identifier} · ${item.subject} (${item.status})`}
                    className="max-w-36 truncate text-[11px] text-foreground/80"
                  />
                  <ChevronRightIcon className="size-3 text-muted-foreground/40 transition-transform group-hover/item:translate-x-0.5 group-hover/item:text-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

    </>
  );
}

/**
 * 涉及仓库与 CI 独立视图（根据当前迭代动态收敛聚合）：
 * 1. 统计当前迭代下工作项实际关联的代码仓库
 * 2. 实时感知当前迭代各仓库正在构建的 Job，展示醒目看板块与日志入口
 * 3. 支持就地手动选择分支与环境触发验证
 * 4. 彻底解决“每个迭代关联仓库千篇一律、意义不明”的认知割裂
 */
export function IterationRepoTab({
  iterationKey,
  scopedItems,
  onOpenDetail,
}: {
  iterationKey?: string;
  scopedItems?: WorkitemItem[];
  onOpenDetail?: (item: WorkitemItem) => void;
}) {
  const { repositories, settings, loadRepoCi, repoCiByRepo } = useApp();
  const openSettings = useUi((s) => s.openSettings);
  const [repoPageIndex, setRepoPageIndex] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  // 若未传入 scopedItems，降级从 store 计算
  const items = useApp((s) => s.items);
  const effectiveItems = scopedItems ?? items;

  // 动态聚合：计算当前迭代工作项实际关联的仓库列表
  const scopedRepos: IterationScopedRepo[] = useMemo(() => {
    const repoItemMap = new Map<number, WorkitemItem[]>();

    for (const it of effectiveItems) {
      const hasOverride = it.workitemId != null && Object.prototype.hasOwnProperty.call(settings?.workitemRepos ?? {}, it.workitemId);
      const rIds = hasOverride
        ? (settings?.workitemRepos[it.workitemId] ?? [])
        : (settings?.watchedRepos ?? []);

      for (const rId of rIds) {
        const list = repoItemMap.get(rId);
        if (list) list.push(it);
        else repoItemMap.set(rId, [it]);
      }
    }

    // 从全局仓库中过滤并映射出本迭代涉及的仓库
    return repositories
      .filter((r) => repoItemMap.has(r.id))
      .map((repo) => {
        const workitems = repoItemMap.get(repo.id) ?? [];

        // 尝试推导本迭代的基准分支规则
        let suggestedBranch: string | undefined;
        if (iterationKey && settings?.branchRuleTemplates?.length) {
          const defaultTpl = settings.branchRuleTemplates[0];
          const pattern = defaultTpl.baselineBranchPattern || 'iteration/{iteration}/{template}';
          suggestedBranch = pattern
            .replace('{iteration}', iterationKey.replace(/\s+/g, '-'))
            .replace('{template}', defaultTpl.name.replace(/\s+/g, '-'));
        }

        return {
          repo,
          workitems,
          suggestedBranch,
        };
      });
  }, [effectiveItems, repositories, settings, iterationKey]);

  // 检查当前是否有任何仓库处于构建中状态
  const anyRunningCount = useMemo(() => {
    let count = 0;
    for (const item of scopedRepos) {
      const snapshot = repoCiByRepo[item.repo.id]?.snapshot;
      const runs = snapshot?.runs ?? [];
      const hasRunning = runs.some((r) => {
        const s = (r.status || '').toUpperCase();
        return s === 'RUNNING' || s === 'WAITING' || s === 'QUEUED';
      }) || snapshot?.status?.toUpperCase() === 'RUNNING';
      if (hasRunning) count += 1;
    }
    return count;
  }, [scopedRepos, repoCiByRepo]);

  // 手动批量刷新涉及仓库的 CI 状态
  const refreshAllScopedCi = async () => {
    setRefreshing(true);
    try {
      await Promise.all(scopedRepos.map((item) => loadRepoCi(item.repo.id)));
    } finally {
      setRefreshing(false);
    }
  };

  const totalRepoPages = Math.max(1, Math.ceil(scopedRepos.length / REPO_PAGE_SIZE));
  const currentRepoPage = Math.min(repoPageIndex, totalRepoPages);

  const paginatedRepos = useMemo(() => {
    const start = (currentRepoPage - 1) * REPO_PAGE_SIZE;
    return scopedRepos.slice(start, start + REPO_PAGE_SIZE);
  }, [scopedRepos, currentRepoPage]);

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部聚合说明与状态提示条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>当前迭代</span>
          {iterationKey && (
            <span className="font-medium text-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded">
              {iterationKey}
            </span>
          )}
          <span>共涉及 <strong className="font-semibold text-foreground font-mono">{scopedRepos.length}</strong> 个代码仓库</span>
          <span>·</span>
          <span>覆盖 <strong className="font-semibold text-foreground font-mono">{effectiveItems.length}</strong> 项工作项</span>

          {anyRunningCount > 0 && (
            <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-medium text-amber-500 text-[11px]">
              <Loader2Icon className="size-3 animate-spin" />
              <span>{anyRunningCount} 个 Job 正在构建中</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            disabled={refreshing || !scopedRepos.length}
            onClick={() => void refreshAllScopedCi()}
            className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <RefreshCwIcon className={cn('size-3', refreshing && 'animate-spin')} />
            <span>刷新 CI 状态</span>
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => openSettings('ci')}
            className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <Link2Icon className="size-3" />
            <span>配置 CI 绑定</span>
          </Button>
        </div>
      </div>

      {/* 涉及仓库卡片列表 */}
      <div className="flex flex-col gap-3">
        {paginatedRepos.map((item) => (
          <IterationRepoCard
            key={item.repo.id}
            repoItem={item}
            onOpenDetail={onOpenDetail}
          />
        ))}

        {!scopedRepos.length && (
          <EmptyHint
            icon={FolderGit2Icon}
            title="当前迭代暂无涉及仓库"
            description={
              effectiveItems.length > 0
                ? '当前迭代的工作项尚未关联任何云效仓库。可在需求详情中为各需求关联代码仓库，或在设置中指定默认云效仓库。'
                : '当前迭代暂无已加载的工作项，因此未生成涉及仓库。'
            }
            action={(
              <Button
                variant="outline"
                size="sm"
                onClick={() => openSettings('trace')}
              >
                前往设置默认仓库
              </Button>
            )}
            className="py-12 border border-dashed rounded-lg"
          />
        )}
      </div>

      {/* 分页控制 */}
      {totalRepoPages > 1 && (
        <div className="flex items-center justify-between px-2 pt-2 text-xs text-muted-foreground">
          <span className="text-[11px] text-muted-foreground">
            共 {scopedRepos.length} 个涉及仓库（第 {(currentRepoPage - 1) * REPO_PAGE_SIZE + 1} - {Math.min(currentRepoPage * REPO_PAGE_SIZE, scopedRepos.length)}）
          </span>
          <KeyboardPagination
            pageIndex={currentRepoPage}
            totalPages={totalRepoPages}
            onPageChange={setRepoPageIndex}
          />
        </div>
      )}
    </div>
  );
}
