import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2Icon,
  CircleDotIcon,
  ClockIcon,
  GitBranchIcon,
  ListTodoIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';
import { PageHeader, STICKY_PAGE_HEADER_CLASS } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyHint } from '@/components/empty-hint';
import { useLocalTasksStore } from '@/store/local-tasks';
import { LocalTaskDrawer } from './LocalTaskDrawer';
import type { LocalTask, LocalTaskStatus } from '@/types/local-task';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';

/** 状态元数据 */
const STATUS_CONFIG: Record<
  LocalTaskStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  todo: { label: '待办', icon: ClockIcon, color: 'text-slate-400' },
  in_progress: { label: '进行中', icon: CircleDotIcon, color: 'text-amber-500' },
  done: { label: '已完成', icon: CheckCircle2Icon, color: 'text-emerald-500' },
  canceled: { label: '已取消', icon: XCircleIcon, color: 'text-muted-foreground/60' },
};

/** 状态分组顺序：进行中 -> 待办 -> 已完成 -> 已取消 */
const GROUP_ORDER: LocalTaskStatus[] = ['in_progress', 'todo', 'done', 'canceled'];

export function LocalTasksView() {
  const tasks = useLocalTasksStore((s) => s.tasks);
  const loading = useLocalTasksStore((s) => s.loading);
  const loadTasks = useLocalTasksStore((s) => s.loadTasks);
  const createTask = useLocalTasksStore((s) => s.createTask);
  const cycleTaskStatus = useLocalTasksStore((s) => s.cycleTaskStatus);
  const deleteTask = useLocalTasksStore((s) => s.deleteTask);
  const activeTaskId = useLocalTasksStore((s) => s.activeTaskId);
  const setActiveTaskId = useLocalTasksStore((s) => s.setActiveTaskId);

  // 状态筛选与搜索
  const [tabFilter, setTabFilter] = useState<'all' | LocalTaskStatus>('all');
  const [search, setSearch] = useState('');
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // 快速指标统计
  const totalCount = tasks.length;
  const pendingCount = tasks.filter((t) => t.status === 'todo' || t.status === 'in_progress').length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;

  // 过滤后的列表
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (tabFilter !== 'all' && task.status !== tabFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(q);
        const matchesDesc = (task.description ?? '').toLowerCase().includes(q);
        const matchesBranch = (task.branchName ?? '').toLowerCase().includes(q);
        const matchesRepo = (task.repoName ?? '').toLowerCase().includes(q);
        return matchesTitle || matchesDesc || matchesBranch || matchesRepo;
      }
      return true;
    });
  }, [tasks, tabFilter, search]);

  // 按状态分组
  const groupedTasks = useMemo(() => {
    const map = new Map<LocalTaskStatus, LocalTask[]>();
    for (const st of GROUP_ORDER) {
      map.set(st, []);
    }
    for (const t of filteredTasks) {
      const list = map.get(t.status) ?? [];
      list.push(t);
      map.set(t.status, list);
    }
    return map;
  }, [filteredTasks]);

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle('');
    await createTask(title);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 顶部吸顶页头：支持原生窗口拖拽与状态过滤 */}
      <PageHeader
        className={STICKY_PAGE_HEADER_CLASS}
        title="本地任务"
        titleBadge={
          <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">
            {pendingCount} 个未完成 · {doneCount} 个已完成
          </Badge>
        }
        description="与云效迭代完全解耦的个人轻量工作台，基于 SQLite 持久化并联动 Codeup 仓库与分支"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <SearchIcon className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索任务、分支、仓库..."
                className="pl-8 h-8 w-48 sm:w-64 text-xs font-mono"
              />
            </div>
          </div>
        }
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {/* 状态分类切换 Tabs */}
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <Tabs value={tabFilter} onValueChange={(v) => setTabFilter(v as 'all' | LocalTaskStatus)}>
            <TabsList className="h-8 bg-muted/60 p-0.5">
              <TabsTrigger value="all" className="px-3 py-1 text-xs gap-1.5">
                <span>全部</span>
                <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.2 font-mono text-[10px] tabular-nums">
                  {totalCount}
                </span>
              </TabsTrigger>
              <TabsTrigger value="in_progress" className="px-3 py-1 text-xs gap-1.5">
                <span>进行中</span>
                <span className="rounded-full bg-amber-500/15 text-amber-500 px-1.5 py-0.2 font-mono text-[10px] tabular-nums">
                  {tasks.filter((t) => t.status === 'in_progress').length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="todo" className="px-3 py-1 text-xs gap-1.5">
                <span>待办</span>
                <span className="rounded-full bg-slate-500/15 text-slate-400 px-1.5 py-0.2 font-mono text-[10px] tabular-nums">
                  {tasks.filter((t) => t.status === 'todo').length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="done" className="px-3 py-1 text-xs gap-1.5">
                <span>已完成</span>
                <span className="rounded-full bg-emerald-500/15 text-emerald-500 px-1.5 py-0.2 font-mono text-[10px] tabular-nums">
                  {doneCount}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
            快捷键 g t · 单手极速流转
          </span>
        </div>

        {/* 快速行内创建输入行 */}
        <form onSubmit={handleQuickCreate} className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-1.5 shadow-xs transition-colors focus-within:border-primary/60 focus-within:bg-background">
          <PlusIcon className="size-4 text-muted-foreground shrink-0" />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="新建本地任务，输入名称按 Enter 极速保存..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
          {newTitle.trim() && (
            <Button size="xs" type="submit" className="h-6 text-[11px] px-2">
              创建
            </Button>
          )}
        </form>

        {/* 任务列表：Linear 无边框裸行形态 */}
        {filteredTasks.length === 0 && !loading ? (
          <EmptyHint
            icon={ListTodoIcon}
            title={tasks.length === 0 ? '暂无本地任务' : '未找到匹配的任务'}
            description={
              tasks.length === 0
                ? '可在上方输入框中随手输入任务标题并回车，建立您的第一个与分支联动的轻量任务。'
                : '请尝试修改搜索词或切换状态筛选 Tab。'
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            {GROUP_ORDER.map((statusKey) => {
              const groupList = groupedTasks.get(statusKey) || [];
              if (groupList.length === 0) return null;
              const cfg = STATUS_CONFIG[statusKey];
              const StatusIconComponent = cfg.icon;

              return (
                <div key={statusKey} className="flex flex-col gap-1">
                  {/* 分组组头 */}
                  <div className="flex h-7 items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
                    <StatusIconComponent className={cn('size-3.5', cfg.color)} />
                    <span>{cfg.label}</span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground/60">
                      {groupList.length}
                    </span>
                  </div>

                  {/* 分组内部任务行 */}
                  <div className="flex flex-col gap-0.5">
                    {groupList.map((task) => {
                      const active = activeTaskId === task.id;
                      return (
                        <div
                          key={task.id}
                          className={cn(
                            'group flex h-10 w-full items-center gap-3 rounded-lg px-3 transition-colors hover:bg-muted/60 cursor-pointer',
                            active && 'bg-accent text-accent-foreground',
                          )}
                          onClick={() => setActiveTaskId(task.id)}
                        >
                          {/* 行首原地切换图标（点击即流转） */}
                          <button
                            type="button"
                            title={`当前: ${cfg.label} · 点击一键流转下一个状态`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void cycleTaskStatus(task.id);
                            }}
                            className="size-5 flex items-center justify-center rounded hover:bg-muted transition-transform active:scale-90 cursor-pointer"
                          >
                            <StatusIconComponent className={cn('size-3.5 transition-colors', cfg.color)} />
                          </button>

                          {/* 任务标题 */}
                          <span
                            className={cn(
                              'flex-1 truncate text-xs font-medium',
                              task.status === 'done' && 'text-muted-foreground line-through',
                            )}
                          >
                            {task.title}
                          </span>

                          {/* 关联 Codeup 分支芯片 */}
                          {task.branchName && (
                            <span
                              className="flex items-center gap-1 rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground border border-border/40 shrink-0"
                              title={task.repoName ? `${task.repoName} -> ${task.branchName}` : task.branchName}
                            >
                              <GitBranchIcon className="size-3 text-primary" />
                              <span className="truncate max-w-[140px]">{task.branchName}</span>
                            </span>
                          )}

                          {/* 关联仓库名 */}
                          {task.repoName && (
                            <span className="text-[11px] text-muted-foreground/70 truncate max-w-[120px] hidden md:inline">
                              {task.repoName.split('/').pop()}
                            </span>
                          )}

                          {/* 更新时间 */}
                          <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground font-mono tabular-nums">
                            {formatRelativeTime(task.updatedAt)}
                          </span>

                          {/* 悬停快捷删除 */}
                          <button
                            type="button"
                            title="删除任务"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`确定删除任务「${task.title}」？`)) {
                                void deleteTask(task.id);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive rounded"
                          >
                            <Trash2Icon className="size-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 任务详情 Peek View 抽屉 */}
      <LocalTaskDrawer taskId={activeTaskId} onClose={() => setActiveTaskId(null)} />
    </div>
  );
}
