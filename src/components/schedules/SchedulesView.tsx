import { useMemo, useState } from 'react';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  FileTextIcon,
  FolderGit2Icon,
  GitBranchIcon,
  GitCompareIcon,
  GitMergeIcon,
  PencilIcon,
  PlayCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
  Trash2Icon,
  WorkflowIcon,
  XCircleIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { EmptyHint } from '@/components/empty-hint';
import { ConfirmButton } from '@/components/ConfirmButton';
import { ScheduleEditorDialog } from './ScheduleEditorDialog';
import { ScheduleLogDrawer } from './ScheduleLogDrawer';
import { useScheduleStore } from '@/store/schedule';
import { useApp } from '@/store/app';
import { runTaskNow } from '@/hooks/use-schedule-runner';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { formatCompactDateTime } from '@/lib/format';
import type { ScheduledTask, ScheduleActionType } from '@/types/schedule';
import { cn } from '@/lib/utils';

export function SchedulesView() {
  const tasks = useScheduleStore((s) => s.tasks);
  const globalPaused = useScheduleStore((s) => s.globalPaused);
  const setGlobalPaused = useScheduleStore((s) => s.setGlobalPaused);
  const toggleTask = useScheduleStore((s) => s.toggleTask);
  const deleteTask = useScheduleStore((s) => s.deleteTask);
  const addTask = useScheduleStore((s) => s.addTask);

  // Search & Filter (activeTab 持久化记忆用户偏好)
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useLocalStorage<'all' | 'enabled' | 'running' | 'failed'>(
    'nervd_schedules_tab',
    'all',
  );

  // Dialog & Drawer state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [logTaskId, setLogTaskId] = useState<string | null>(null);

  // Running tasks state for optimistic spinner
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  const repositories = useApp((s) => s.repositories);
  const pipelines = useApp((s) => s.pipelines);

  // Quick stats
  const activeCount = useMemo(() => tasks.filter((t) => t.enabled).length, [tasks]);
  const runningCount = useMemo(() => tasks.filter((t) => t.lastStatus === 'running').length, [tasks]);
  const failedCount = useMemo(() => tasks.filter((t) => t.lastStatus === 'failed').length, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Tab filter
      if (activeTab === 'enabled' && !task.enabled) return false;
      if (activeTab === 'running' && task.lastStatus !== 'running') return false;
      if (activeTab === 'failed' && task.lastStatus !== 'failed') return false;

      // Search query
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesName = task.name.toLowerCase().includes(q);
        const matchesDesc = (task.description ?? '').toLowerCase().includes(q);
        const matchesCron = task.cron.toLowerCase().includes(q) || (task.cronLabel ?? '').toLowerCase().includes(q);

        // 动作类型与上下文专属信息匹配
        let matchesAction = false;
        const act = task.action;
        if (act.type === 'branch_merge') {
          const repoName = act.repoName || repositories.find((r) => r.id === act.repoId)?.name || '';
          matchesAction =
            '分支合并'.includes(q) ||
            act.sourceBranch.toLowerCase().includes(q) ||
            act.targetBranch.toLowerCase().includes(q) ||
            repoName.toLowerCase().includes(q) ||
            (act.strategy === 'aggressive' ? '激进零污染'.includes(q) : '谨慎冲突终止'.includes(q));
        } else if (act.type === 'pipeline') {
          const pName = act.pipelineName || pipelines.find((p) => p.pipelineId === act.pipelineId)?.pipelineName || '';
          matchesAction =
            '流水线'.includes(q) ||
            pName.toLowerCase().includes(q) ||
            String(act.pipelineId).includes(q);
        } else if (act.type === 'jenkins') {
          matchesAction =
            'jenkins'.includes(q) ||
            act.jobFullName.toLowerCase().includes(q);
        } else if (act.type === 'sync_workitems') {
          matchesAction = '需求同步'.includes(q) || '云效'.includes(q) || '工作项'.includes(q);
        } else if (act.type === 'scan_branches') {
          matchesAction = '分支巡检'.includes(q) || '落差'.includes(q);
        }

        return matchesName || matchesDesc || matchesCron || matchesAction;
      }
      return true;
    });
  }, [tasks, activeTab, search, repositories, pipelines]);

  const handleRunNow = async (task: ScheduledTask) => {
    setRunningIds((prev) => new Set(prev).add(task.id));
    try {
      await runTaskNow(task, 'manual');
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleOpenEdit = (task: ScheduledTask) => {
    setEditingTask(task);
    setEditorOpen(true);
  };

  const handleOpenCreate = () => {
    setEditingTask(null);
    setEditorOpen(true);
  };

  const handleOpenLogs = (taskId: string | null) => {
    setLogTaskId(taskId);
    setLogDrawerOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 统一吸顶页头：标题区 + 过滤工具行（筛选与搜索并入 toolbar 槽，页头吸顶固定） */}
      <PageHeader
        sticky
        navigation={<SidebarTrigger aria-label="折叠/展开侧栏" />}
        title="定时任务工作台"
        titleBadge={
          <Badge
            variant="outline"
            className={cn(
              'font-mono text-xs',
              globalPaused
                ? 'border-amber-500/30 text-amber-500 bg-amber-500/5'
                : 'border-primary/30 text-primary bg-primary/5',
            )}
          >
            {globalPaused ? '调度器已全局暂停' : `${activeCount} 个任务运行中`}
          </Badge>
        }
        description="自动化执行分支同步合并（谨慎/激进零污染）、流水线部署与云效工作项巡检"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenLogs(null)}
              className="text-xs"
            >
              <FileTextIcon className="mr-1.5 size-3.5 text-muted-foreground" />
              查看调度日志
            </Button>

            <Button
              variant={globalPaused ? 'default' : 'outline'}
              size="sm"
              onClick={() => setGlobalPaused(!globalPaused)}
              className={cn(
                'text-xs',
                globalPaused && 'bg-amber-600 hover:bg-amber-700 text-white',
              )}
            >
              <ClockIcon className="mr-1.5 size-3.5" />
              {globalPaused ? '恢复全局调度' : '暂停全局调度'}
            </Button>

            <Button size="sm" onClick={handleOpenCreate} className="text-xs">
              <PlusIcon className="mr-1.5 size-3.5" />
              新建定时任务
            </Button>
          </div>
        }
        toolbar={
          <div className="flex w-full flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1.5 text-xs">
              <Button
                variant={activeTab === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('all')}
                className="h-7 text-xs font-medium"
              >
                全部
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.2 font-mono text-[10px]">
                  {tasks.length}
                </span>
              </Button>

              <Button
                variant={activeTab === 'enabled' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('enabled')}
                className="h-7 text-xs font-medium"
              >
                已启用
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.2 font-mono text-[10px]">
                  {activeCount}
                </span>
              </Button>

              {runningCount > 0 && (
                <Button
                  variant={activeTab === 'running' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('running')}
                  className="h-7 text-xs font-medium text-amber-500"
                >
                  执行中
                  <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.2 font-mono text-[10px]">
                    {runningCount}
                  </span>
                </Button>
              )}

              {failedCount > 0 && (
                <Button
                  variant={activeTab === 'failed' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('failed')}
                  className="h-7 text-xs font-medium text-destructive"
                >
                  失败告警
                  <span className="ml-1.5 rounded-full bg-destructive/20 px-1.5 py-0.2 font-mono text-[10px]">
                    {failedCount}
                  </span>
                </Button>
              )}
            </div>

            {/* 搜索框 */}
            <div className="relative w-full sm:w-64">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索任务名称、分支、Cron..."
                className="h-7 pl-8 text-xs"
              />
            </div>
          </div>
        }
      />

      {/* 任务列表区域 */}
      {filteredTasks.length === 0 ? (
        <div className="py-8">
          {tasks.length === 0 ? (
            <div className="space-y-6">
              <EmptyHint
                title="尚未创建任何定时任务"
                description="定时任务可在后台自动化完成分支合并、流水线构建或数据同步。你可以选择从推荐模版快速创建："
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
                <TemplateCard
                  title="开发分支合入主干 (谨慎)"
                  description="每天凌晨 02:00 自动比对 dev 与 master，若有冲突则安全终止"
                  icon={<GitMergeIcon className="size-4 text-blue-500" />}
                  onClick={() => {
                    addTask({
                      name: '开发分支合入主干 (谨慎策略)',
                      description: '每日凌晨比对 dev 分支与 master，若无冲突则自动合入',
                      enabled: true,
                      cron: '0 2 * * *',
                      cronLabel: '每天 02:00',
                      action: {
                        type: 'branch_merge',
                        repoId: 0,
                        sourceBranch: 'dev',
                        targetBranch: 'master',
                        strategy: 'cautious',
                      },
                      notifyOnSuccess: true,
                      notifyOnFailure: true,
                    });
                    setEditorOpen(true);
                  }}
                />

                <TemplateCard
                  title="开发分支合入主干 (激进零污染)"
                  description="每天凌晨 03:00 遇冲突自动隔离至影子分支并提审，绝不污染原分支"
                  icon={<ShieldCheckIcon className="size-4 text-amber-500" />}
                  onClick={() => {
                    addTask({
                      name: '开发分支合入主干 (激进零污染)',
                      description: '每日凌晨自动解决冲突并在隔离分支创建 MR，严格不污染原分支',
                      enabled: true,
                      cron: '0 3 * * *',
                      cronLabel: '每天 03:00',
                      action: {
                        type: 'branch_merge',
                        repoId: 0,
                        sourceBranch: 'dev',
                        targetBranch: 'master',
                        strategy: 'aggressive',
                        aggressiveConflictPreference: 'theirs',
                      },
                      notifyOnSuccess: true,
                      notifyOnFailure: true,
                    });
                    setEditorOpen(true);
                  }}
                />

                <TemplateCard
                  title="云效需求每小时自动同步"
                  description="每小时整点自动刷新云效工作项与最新迭代进展"
                  icon={<RefreshCwIcon className="size-4 text-emerald-500" />}
                  onClick={() => {
                    addTask({
                      name: '云效需求每小时同步',
                      description: '整点定时拉取云效迭代内最新工作项状态',
                      enabled: true,
                      cron: '0 * * * *',
                      cronLabel: '每小时整点',
                      action: { type: 'sync_workitems' },
                      notifyOnSuccess: false,
                      notifyOnFailure: true,
                    });
                  }}
                />
              </div>
            </div>
          ) : (
            <EmptyHint
              title="未找到匹配的定时任务"
              description="尝试更换关键词或清除筛选标签"
            />
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border/80 bg-card overflow-hidden">
          {filteredTasks.map((task) => {
            const isRunning =
              runningIds.has(task.id) || task.lastStatus === 'running';

            return (
              <div
                key={task.id}
                className={cn(
                  'group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4 transition-colors hover:bg-muted/30',
                  !task.enabled && 'opacity-60 bg-muted/10',
                )}
              >
                {/* 状态点与任务主体 */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="pt-0.5 shrink-0">
                    {isRunning ? (
                      <Spinner className="size-4 text-amber-500 animate-spin" />
                    ) : task.lastStatus === 'success' ? (
                      <CheckCircle2Icon className="size-4 text-emerald-500" />
                    ) : task.lastStatus === 'failed' ? (
                      <XCircleIcon className="size-4 text-destructive" />
                    ) : (
                      <div className="size-2.5 rounded-full bg-muted-foreground/40 m-0.5" />
                    )}
                  </div>

                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground text-sm tracking-tight">
                        {task.name}
                      </span>
                      {/* 执行动作类型 Tag */}
                      <ActionTypeTag type={task.action.type} />
                      {/* 调度周期 Cron Tag */}
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] text-muted-foreground bg-muted/20 border-border/70"
                      >
                        <ClockIcon className="mr-1 size-2.5 text-muted-foreground" />
                        {task.cronLabel || task.cron}
                      </Badge>
                    </div>

                    {/* 专属动作类型详细信息 Tag 簇行（如分支合并展示仓库名、分支流向、策略） */}
                    <div className="pt-0.5">
                      <ActionDetailTags
                        action={task.action}
                        repositories={repositories}
                        pipelines={pipelines}
                      />
                    </div>

                    {task.description && (
                      <p className="text-xs text-muted-foreground/80 truncate max-w-xl">
                        {task.description}
                      </p>
                    )}

                    {/* 辅助元数据行 */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-mono">
                      <span>已运行 {task.runCount} 次</span>
                      {task.lastRunAt && (
                        <span>
                          上次：{formatCompactDateTime(task.lastRunAt)}
                          {typeof task.lastDurationMs === 'number' &&
                            ` (${(task.lastDurationMs / 1000).toFixed(1)}s)`}
                        </span>
                      )}
                      {task.nextRunAt && task.enabled && !globalPaused && (
                        <span className="text-primary/90">
                          预计下次：{formatCompactDateTime(task.nextRunAt)}
                        </span>
                      )}
                      {task.lastError && (
                        <span className="text-destructive truncate max-w-sm">
                          错误: {task.lastError}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 右侧动作操作位 */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRunning || globalPaused}
                    onClick={() => handleRunNow(task)}
                    className="h-7 text-xs hover:bg-muted font-medium"
                    title="立即执行此任务一次"
                  >
                    {isRunning ? (
                      <Spinner className="mr-1.5 size-3.5" />
                    ) : (
                      <PlayCircleIcon className="mr-1.5 size-3.5 text-primary" />
                    )}
                    立即运行
                  </Button>

                  <Switch
                    checked={task.enabled}
                    onCheckedChange={() => toggleTask(task.id)}
                    title={task.enabled ? '点击暂停此任务' : '点击启用此任务'}
                  />

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleOpenLogs(task.id)}
                    className="size-7 text-muted-foreground hover:text-foreground"
                    title="查看此任务的执行日志"
                  >
                    <FileTextIcon className="size-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleOpenEdit(task)}
                    className="size-7 text-muted-foreground hover:text-foreground"
                    title="编辑任务配置"
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>

                  <ConfirmButton
                    label="删除"
                    title="删除定时任务"
                    description={`确定要删除定时任务「${task.name}」吗？历史运行日志仍将予以保留。`}
                    onConfirm={() => deleteTask(task.id)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2Icon className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </ConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 弹窗与抽屉 */}
      <ScheduleEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initialTask={editingTask}
      />

      <ScheduleLogDrawer
        open={logDrawerOpen}
        onOpenChange={setLogDrawerOpen}
        taskId={logTaskId}
      />
    </div>
  );
}

/**
 * 执行动作类型标记 Tag 徽标
 */
export function ActionTypeTag({
  type,
  className,
}: {
  type: ScheduleActionType;
  className?: string;
}) {
  switch (type) {
    case 'branch_merge':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 text-[10px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5',
            className,
          )}
        >
          <GitMergeIcon className="size-3" />
          分支合并
        </Badge>
      );
    case 'pipeline':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-[10px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5',
            className,
          )}
        >
          <WorkflowIcon className="size-3" />
          云效流水线
        </Badge>
      );
    case 'jenkins':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/10 text-[10px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5',
            className,
          )}
        >
          <TerminalIcon className="size-3" />
          Jenkins
        </Badge>
      );
    case 'sync_workitems':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[10px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5',
            className,
          )}
        >
          <RefreshCwIcon className="size-3" />
          需求同步
        </Badge>
      );
    case 'scan_branches':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10 text-[10px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5',
            className,
          )}
        >
          <GitCompareIcon className="size-3" />
          分支巡检
        </Badge>
      );
    default:
      return null;
  }
}

/**
 * 不同动作类型的专有详细信息 Tag 簇
 * 例如：分支合并展示对应仓库信息、源目标分支、合并策略；流水线展示流水线名称与ID等
 */
export function ActionDetailTags({
  action,
  repositories = [],
  pipelines = [],
  className,
}: {
  action: ScheduledTask['action'];
  repositories?: { id: number; name: string }[];
  pipelines?: { pipelineId: number; pipelineName: string }[];
  className?: string;
}) {
  switch (action.type) {
    case 'branch_merge': {
      const isAggressive = action.strategy === 'aggressive';
      const matchedRepo = repositories.find((r) => r.id === action.repoId);
      const repoDisplayName =
        action.repoName || matchedRepo?.name || (action.repoId ? `仓库 #${action.repoId}` : '未指定仓库');

      return (
        <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
          {/* 仓库 Tag（重点：展示对应仓库信息） */}
          <Badge
            variant="outline"
            className="border-border/80 text-foreground/90 bg-muted/60 text-[10px] font-mono inline-flex items-center gap-1 px-1.5 py-0.5"
            title={`关联代码库: ${repoDisplayName}`}
          >
            <FolderGit2Icon className="size-3 text-muted-foreground shrink-0" />
            <span className="font-semibold">{repoDisplayName}</span>
          </Badge>

          {/* 分支流转 Tag */}
          <Badge
            variant="outline"
            className="border-border/80 text-foreground/90 bg-background/80 text-[10px] font-mono inline-flex items-center gap-1 px-1.5 py-0.5"
            title={`源分支 [${action.sourceBranch}] → 目标分支 [${action.targetBranch}]`}
          >
            <GitBranchIcon className="size-2.5 text-muted-foreground shrink-0" />
            <span>{action.sourceBranch}</span>
            <ArrowRightIcon className="size-2.5 text-muted-foreground mx-0.5 shrink-0" />
            <span className="text-primary font-medium">{action.targetBranch}</span>
          </Badge>

          {/* 合并策略 Tag */}
          {isAggressive ? (
            <Badge
              variant="outline"
              className="border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5"
              title="遇冲突将自动在影子隔离分支消解，原分支保持 100% 纯净"
            >
              <ShieldCheckIcon className="size-3 shrink-0" />
              激进 · 零污染
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5 text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5"
              title="检测到代码冲突立即中止合并，原分支零变更"
            >
              <ShieldAlertIcon className="size-3 shrink-0" />
              谨慎 · 冲突终止
            </Badge>
          )}
        </div>
      );
    }
    case 'pipeline': {
      const matchedPipeline = pipelines.find((p) => p.pipelineId === action.pipelineId);
      const pipelineDisplayName =
        action.pipelineName || matchedPipeline?.pipelineName || `流水线 #${action.pipelineId}`;

      return (
        <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
          <Badge
            variant="outline"
            className="border-border/80 text-foreground/90 bg-muted/60 text-[10px] font-mono inline-flex items-center gap-1 px-1.5 py-0.5"
          >
            <WorkflowIcon className="size-3 text-emerald-500 shrink-0" />
            <span>{pipelineDisplayName}</span>
          </Badge>
          <Badge
            variant="outline"
            className="border-border/60 text-muted-foreground bg-background/60 text-[10px] font-mono px-1 py-0.5"
          >
            #{action.pipelineId}
          </Badge>
        </div>
      );
    }
    case 'jenkins': {
      const paramCount = action.parameters ? Object.keys(action.parameters).length : 0;
      return (
        <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
          <Badge
            variant="outline"
            className="border-border/80 text-foreground/90 bg-muted/60 text-[10px] font-mono inline-flex items-center gap-1 px-1.5 py-0.5"
          >
            <TerminalIcon className="size-3 text-sky-500 shrink-0" />
            <span>{action.jobFullName}</span>
          </Badge>
          {paramCount > 0 && (
            <Badge
              variant="outline"
              className="border-border/60 text-muted-foreground bg-background/60 text-[10px] font-mono inline-flex items-center gap-1 px-1.5 py-0.5"
            >
              <SlidersHorizontalIcon className="size-2.5 text-muted-foreground" />
              {paramCount} 个参数
            </Badge>
          )}
        </div>
      );
    }
    case 'sync_workitems':
      return (
        <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
          <Badge
            variant="outline"
            className="border-border/80 text-muted-foreground bg-muted/40 text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5"
          >
            <RefreshCwIcon className="size-2.5 text-amber-500 shrink-0" />
            云效迭代与全量工作项状态巡检
          </Badge>
        </div>
      );
    case 'scan_branches':
      return (
        <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
          <Badge
            variant="outline"
            className="border-border/80 text-muted-foreground bg-muted/40 text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5"
          >
            <GitCompareIcon className="size-2.5 text-purple-500 shrink-0" />
            {action.repoIds && action.repoIds.length > 0
              ? `指定 ${action.repoIds.length} 个代码库落差`
              : '全量纳管仓库集成分支落差'}
          </Badge>
        </div>
      );
    default:
      return null;
  }
}

function TemplateCard({
  title,
  description,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="h-auto w-full flex flex-col items-start p-4 rounded-xl border-border/80 bg-card hover:bg-muted/40 hover:border-primary/50 text-left transition-all group whitespace-normal"
    >
      <div className="flex items-center gap-2 font-semibold text-foreground text-xs">
        {icon}
        <span>{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5 leading-normal font-normal">
        {description}
      </p>
      <span className="text-[10px] text-primary font-medium mt-3 group-hover:underline">
        立即配置 →
      </span>
    </Button>
  );
}
