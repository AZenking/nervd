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
import { useShallow } from 'zustand/react/shallow';
import { useUi } from '@/store/ui';
import type { RepoSummary } from '@/types';
import { buildRunParameter, ciProviderLabel, ciStatusInfo, ciStatusText } from '@/lib/ci';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Alert, Button, Card, Chip, Toolbar } from '@heroui/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { EmptyHint } from '@/components/empty-hint';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusIcon } from '@/components/status-icon';
import { JenkinsBuildDialog } from './JenkinsBuildDialog';
import { BuildWorkbenchTrigger, openBuildWorkbenchFromTrigger, openRepoBuildLogs } from '@/components/build-workbench';
import { KeyboardPagination } from './keyboard-pagination';
import { expandBranchPattern } from '@/components/iteration/requirement/types';
import { useFusedBranchTemplates } from '@/lib/iteration-templates';

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
  const { repoCiByRepo, settings } = useApp(
    useShallow((s) => ({ repoCiByRepo: s.repoCiByRepo, settings: s.settings })),
  );

  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const binding = settings?.repoCiBindings?.[String(repo.id)];
  const isFlow = binding?.provider === 'flow';
  const isJenkins = binding?.provider === 'jenkins';
  const isBound = Boolean(binding);
  const providerLabel = ciProviderLabel(binding);

  const runs = isBound ? snapshot?.runs ?? [] : [];

  // 判断是否有正在运行中的 Job（RUNNING / WAITING / QUEUED / BUILDING 等）
  const runningRun = runs.find((r) => {
    return ciStatusInfo(r.status).tone === 'run';
  }) || (ciStatusInfo(snapshot?.status).tone === 'run' ? runs[0] : undefined);

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
      <Card className={cn(
        'group transition-all duration-200',
        isRunning && 'border-warning/40',
      )}>
        {/* 卡片头部：仓库基本信息 + CI 状态 + 触发验证 / 详情按钮 */}
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-border/40">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn(
              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors',
              isRunning
                ? 'border-warning/30 bg-warning/10 text-warning'
                : 'border-border/60 bg-muted/30 group-hover:text-foreground',
            )}>
              <FolderGit2Icon className="size-4" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <OverflowTooltip
                  text={repo.pathWithNamespace || repo.name}
                  className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground"
                />
                <span className="font-mono text-[11px] text-muted-foreground/70">
                  #{repo.id}
                </span>
                <Chip size="sm" variant="tertiary" className="text-[11px] h-5 px-1.5 font-normal">
                  {providerLabel}
                </Chip>
                {suggestedBranch && (
                  <Tooltip>
                    <TooltipTrigger render={
                      <Chip
                        size="sm"
                        variant="soft"
                        color="default"
                        className="font-mono text-[11px] max-w-56 cursor-default gap-1.5 inline-flex items-center border border-border/60 bg-muted/40 px-2 py-0.5"
                      >
                        <GitBranchIcon className="size-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{suggestedBranch}</span>
                      </Chip>
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

          {/* 右侧动作与状态工具栏（HeroUI Toolbar 原语） */}
          <Toolbar aria-label={`${repo.name} 仓库操作`} className="flex shrink-0 items-center gap-2">
            {/* 状态徽标 */}
            {isBound ? (
              <StatusBadge
                status={isRunning ? 'RUNNING' : ciStatusText(snapshot?.status, entry)}
                size="sm"
              />
            ) : (
              <Chip size="sm" variant="soft" className="text-xs text-muted-foreground">
                未绑定 CI
              </Chip>
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
              onPress={() => openBuildWorkbenchFromTrigger({ kind: 'repo', repoId: repo.id, title: repo.name }, 'runs')}
              className="text-xs h-7"
            >
              CI 详情
            </Button>
          </Toolbar>
        </div>

        {/* 正在构建看板（HeroUI Alert 原生组件） */}
        {isRunning && runningRun && (
          <Alert
            status="warning"
            className="mt-3.5 flex flex-col gap-2 rounded-lg border border-warning/30 p-3 text-xs"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Loader2Icon className="size-4 shrink-0 animate-spin text-warning" />
                <Alert.Title className="font-semibold text-warning text-xs">
                  正在构建 Job
                </Alert.Title>
                <OverflowTooltip
                  text={runningJobName}
                  className="max-w-64 truncate font-mono font-semibold text-foreground"
                />
                <span className="font-mono text-muted-foreground">#{runningRun.runId}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-warning hover:bg-warning/20 gap-1 shrink-0"
                onPress={() => openRepoBuildLogs(repo.id, runningRun.runId, `${repo.name} · #${runningRun.runId}`)}
              >
                <TerminalIcon className="size-3" />
                <span>实时日志</span>
              </Button>
            </div>

            {/* 正在构建 Job 的分支、环境、耗时与触发人 */}
            <Alert.Description className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground">
              {runningBranch && runningBranch !== '未记录' && (
                <div className="flex items-center gap-1 font-mono text-foreground/90">
                  <GitBranchIcon className="size-3 text-muted-foreground" />
                  <OverflowTooltip
                    text={runningBranch}
                    className="rounded bg-background/80 px-1.5 py-0.5 border border-border/50 text-[11px]"
                  />
                </div>
              )}
              {runningEnvironment && runningEnvironment !== '未记录' && (
                <div className="flex items-center gap-1 font-mono text-foreground/90">
                  <ServerIcon className="size-3 text-muted-foreground" />
                  <OverflowTooltip
                    text={runningEnvironment}
                    className="rounded bg-background/80 px-1.5 py-0.5 border border-border/50 text-[11px]"
                  />
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
            </Alert.Description>
          </Alert>
        )}

        {/* 最近构建记录（HeroUI Alert 原生组件） */}
        {!isRunning && latestRun && (
          <Alert
            status="default"
            className="mt-3 flex flex-row items-center justify-between gap-2 rounded-lg border border-border/40 py-2 px-3 text-xs text-muted-foreground"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 flex-1">
              <span className="text-[11px] text-muted-foreground/80 shrink-0 font-medium">最近验证：</span>
              <span className="font-mono font-medium text-foreground">#{latestRun.runId}</span>
              {latestBranch && latestBranch !== '未记录' && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground/90">
                  <GitBranchIcon className="size-3 text-muted-foreground" />
                  <OverflowTooltip text={latestBranch} className="min-w-0 truncate" />
                </span>
              )}
              {latestEnvironment && latestEnvironment !== '未记录' && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground/90">
                  <ServerIcon className="size-3 text-muted-foreground" />
                  <OverflowTooltip text={latestEnvironment} className="min-w-0 truncate" />
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
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0 gap-1"
              onPress={() => openRepoBuildLogs(repo.id, latestRun.runId, `${repo.name} · #${latestRun.runId}`)}
            >
              <TerminalIcon className="size-3" />
              <span>构建日志</span>
            </Button>
          </Alert>
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
                  className="inline-flex cursor-pointer rounded-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => onOpenDetail?.(item)}
                >
                  <Chip size="sm" variant="soft" className="gap-1.5 px-2 py-1 text-xs text-foreground/90">
                    <StatusIcon status={item.status} className="size-3 shrink-0" />
                    <span className="font-mono text-[11px] font-medium text-muted-foreground">
                      {item.identifier}
                    </span>
                    <OverflowTooltip
                      text={item.subject}
                      tooltip={`${item.identifier} · ${item.subject} (${item.status})`}
                      className="max-w-36 truncate text-[11px] text-foreground/80"
                    />
                    <ChevronRightIcon className="size-3 text-muted-foreground/40" />
                  </Chip>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

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
  const { repositories, settings, loadRepoCi, repoCiByRepo, iterations } = useApp(
    useShallow((s) => ({
      repositories: s.repositories,
      settings: s.settings,
      loadRepoCi: s.loadRepoCi,
      repoCiByRepo: s.repoCiByRepo,
      iterations: s.iterations,
    })),
  );
  const openSettings = useUi((s) => s.openSettings);
  const [repoPageIndex, setRepoPageIndex] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  // 若未传入 scopedItems，降级从 store 计算
  const items = useApp((s) => s.items);
  const effectiveItems = scopedItems ?? items;

  // 轨道融合模板：iterationKey 为迭代名称，而迭代专属模板按迭代 id 行存于 SQLite，
  // 先解析回 id 再交由同源 hook 异步加载融合（加载完成前仅含全局模板）
  const trackIterationId = iterationKey
    ? iterations.find((it) => it.name === iterationKey)?.id ?? iterationKey
    : undefined;
  const fusedTemplates = useFusedBranchTemplates(trackIterationId);

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

    // 建议基准分支来源：融合模板首项（迭代专属优先、全局兜底）；零模板时不建议任何分支。
    let suggestedBranch: string | undefined;
    if (iterationKey) {
      const defaultTpl = fusedTemplates[0];
      if (defaultTpl) {
        suggestedBranch = expandBranchPattern(
          defaultTpl.baselineBranchPattern || 'iteration/{iteration}/{template}',
          { iteration: iterationKey, template: defaultTpl.name, identifier: '' },
        );
      }
    }

    // 从全局仓库中过滤并映射出本迭代涉及的仓库（建议分支对同一迭代内所有仓库一致，提出循环外只算一次）
    return repositories
      .filter((r) => repoItemMap.has(r.id))
      .map((repo) => {
        const workitems = repoItemMap.get(repo.id) ?? [];

        return {
          repo,
          workitems,
          suggestedBranch,
        };
      });
  }, [effectiveItems, repositories, settings, iterationKey, fusedTemplates]);

  // 检查当前是否有任何仓库处于构建中状态
  const anyRunningCount = useMemo(() => {
    let count = 0;
    for (const item of scopedRepos) {
      const snapshot = repoCiByRepo[item.repo.id]?.snapshot;
      const runs = snapshot?.runs ?? [];
      const hasRunning = runs.some((r) => {
        return ciStatusInfo(r.status).tone === 'run';
      }) || ciStatusInfo(snapshot?.status).tone === 'run';
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
      {/* 顶部聚合说明与状态提示条（HeroUI Alert 标准槽位：Indicator + Title/Description + 尾部操作） */}
      <Alert status={anyRunningCount > 0 ? 'warning' : 'default'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="shrink-0">当前迭代</span>
              {iterationKey && (
                <Chip size="sm" variant="soft" className="max-w-56 truncate font-mono">
                  {iterationKey}
                </Chip>
              )}
              {anyRunningCount > 0 && (
                <Chip size="sm" color="warning" variant="soft">
                  <Loader2Icon className="size-3 animate-spin" />
                  {anyRunningCount} 个 Job 正在构建中
                </Chip>
              )}
            </div>
          </Alert.Title>
          <Alert.Description className="flex flex-wrap items-center gap-3">
            <span>
              共涉及 <strong className="font-mono font-semibold text-foreground">{scopedRepos.length}</strong> 个代码仓库
            </span>
            <span>·</span>
            <span>
              覆盖 <strong className="font-mono font-semibold text-foreground">{effectiveItems.length}</strong> 项工作项
            </span>
          </Alert.Description>
        </Alert.Content>

        <Toolbar aria-label="迭代代码仓库全局操作" className="flex shrink-0 items-center self-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            isDisabled={refreshing || !scopedRepos.length}
            onPress={() => void refreshAllScopedCi()}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCwIcon className={cn('size-3', refreshing && 'animate-spin')} />
            <span>刷新 CI 状态</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => openSettings('ci')}
            className="text-muted-foreground hover:text-foreground"
          >
            <Link2Icon className="size-3" />
            <span>配置 CI 绑定</span>
          </Button>
        </Toolbar>
      </Alert>

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
                onPress={() => openSettings('trace')}
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
