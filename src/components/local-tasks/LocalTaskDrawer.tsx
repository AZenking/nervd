import { useEffect, useState } from 'react';
import {
  CheckCircle2Icon,
  CircleDotIcon,
  ClockIcon,
  FolderGit2Icon,
  GitBranchIcon,
  GitForkIcon,
  Trash2Icon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/searchable-select';
import { useApp } from '@/store/app';
import { useLocalTasksStore } from '@/store/local-tasks';
import type { LocalTaskPriority, LocalTaskRepoLink, LocalTaskStatus } from '@/types/local-task';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { CreateTaskBranchDialog } from './CreateTaskBranchDialog';

interface LocalTaskDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

const STATUS_OPTIONS: { label: string; value: LocalTaskStatus; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: '待办 (Todo)', value: 'todo', icon: ClockIcon },
  { label: '进行中 (In Progress)', value: 'in_progress', icon: CircleDotIcon },
  { label: '已完成 (Done)', value: 'done', icon: CheckCircle2Icon },
  { label: '已取消 (Canceled)', value: 'canceled', icon: XCircleIcon },
];

const PRIORITY_OPTIONS: { label: string; value: LocalTaskPriority; color: string }[] = [
  { label: '无优先级', value: 'none', color: 'text-muted-foreground' },
  { label: '低优先级', value: 'low', color: 'text-blue-500' },
  { label: '中等优先级', value: 'medium', color: 'text-amber-500' },
  { label: '高优先级', value: 'high', color: 'text-orange-500' },
  { label: '紧急', value: 'urgent', color: 'text-red-500' },
];

export function LocalTaskDrawer({ taskId, onClose }: LocalTaskDrawerProps) {
  const task = useLocalTasksStore((s) => s.tasks.find((t) => t.id === taskId));
  const updateTask = useLocalTasksStore((s) => s.updateTask);
  const deleteTask = useLocalTasksStore((s) => s.deleteTask);
  const repositories = useApp((s) => s.repositories);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [branchModal, setBranchModal] = useState<{
    open: boolean;
    repoId: number;
    repoName: string;
    defaultBranchName: string;
  } | null>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
    }
  }, [task]);

  if (!task) return null;

  const handleTitleBlur = () => {
    if (title.trim() && title.trim() !== task.title) {
      void updateTask(task.id, { title: title.trim() });
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== (task.description || '')) {
      void updateTask(task.id, { description });
    }
  };

  const handleRepoChange = (val: string | number | null) => {
    const rId = val ? Number(val) : null;
    if (!rId) return;
    const r = repositories.find((repo) => repo.id === rId);
    if (!r) return;

    const currentRepos: LocalTaskRepoLink[] = task.repos && task.repos.length > 0
      ? [...task.repos]
      : (task.repoId && task.repoName)
        ? [{ repoId: task.repoId, repoName: task.repoName, branchName: task.branchName }]
        : [];

    // 避免重复添加同一个仓库
    if (currentRepos.some((link) => link.repoId === rId)) return;

    const updated = [
      ...currentRepos,
      {
        repoId: rId,
        repoName: r.pathWithNamespace || r.name,
        branchName: null,
      },
    ];

    void updateTask(task.id, { repos: updated });
  };

  const handleRemoveRepo = (repoId: number) => {
    const currentRepos: LocalTaskRepoLink[] = task.repos && task.repos.length > 0
      ? [...task.repos]
      : (task.repoId && task.repoName)
        ? [{ repoId: task.repoId, repoName: task.repoName, branchName: task.branchName }]
        : [];

    const updated = currentRepos.filter((link) => link.repoId !== repoId);
    void updateTask(task.id, { repos: updated });
  };

  const handleUpdateRepoBranch = (repoId: number, newBranch: string) => {
    const currentRepos: LocalTaskRepoLink[] = task.repos && task.repos.length > 0
      ? [...task.repos]
      : (task.repoId && task.repoName)
        ? [{ repoId: task.repoId, repoName: task.repoName, branchName: task.branchName }]
        : [];

    const updated = currentRepos.map((link) =>
      link.repoId === repoId ? { ...link, branchName: newBranch.trim() || null } : link,
    );
    void updateTask(task.id, { repos: updated });
  };

  const activeRepos: LocalTaskRepoLink[] = task.repos && task.repos.length > 0
    ? task.repos
    : (task.repoId && task.repoName)
      ? [{ repoId: task.repoId, repoName: task.repoName, branchName: task.branchName }]
      : [];

  const handleDelete = async () => {
    if (window.confirm(`确定要彻底删除本地任务「${task.title}」吗？`)) {
      await deleteTask(task.id);
      onClose();
    }
  };

  return (
    <Drawer
      open={Boolean(taskId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      swipeDirection="right"
    >
      <DrawerContent className="w-[100vw] sm:w-[min(42rem,85vw)] data-[swipe-axis=x]:sm:[--drawer-content-width:min(42rem,85vw)] p-0">
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
          {/* 顶栏控制栏 */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 select-none">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground">
                更新于 {formatRelativeTime(task.updatedAt)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleDelete}
                title="删除任务"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onClose}
                title="关闭抽屉 (Esc)"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6">
            {/* 状态与优先级行 */}
            <div className="flex flex-wrap items-center gap-3">
              {/* 状态切换 */}
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-1">
                {STATUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = task.status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => void updateTask(task.id, { status: opt.value })}
                      className={cn(
                        'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer',
                        active
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="size-3" />
                      <span>{opt.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>

              {/* 优先级 */}
              <div className="flex items-center gap-1.5">
                <select
                  value={task.priority}
                  onChange={(e) => void updateTask(task.id, { priority: e.target.value as LocalTaskPriority })}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs font-medium outline-none cursor-pointer"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 标题输入 */}
            <div className="space-y-1">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                placeholder="任务名称..."
                className="w-full bg-transparent text-lg font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>

            {/* Codeup 仓库与分支联动卡片（支持关联多个仓库） */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-medium text-foreground">
                <div className="flex items-center gap-2">
                  <FolderGit2Icon className="size-3.5 text-primary" />
                  <span>关联 Codeup 代码仓库与分支 ({activeRepos.length})</span>
                </div>
              </div>

              {/* 已绑定的仓库与分支列表 */}
              {activeRepos.length > 0 && (
                <div className="space-y-2">
                  {activeRepos.map((link) => (
                    <div
                      key={link.repoId}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background/80 p-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <OverflowTooltip
                          text={link.repoName}
                          className="font-medium text-foreground truncate"
                        />
                      </div>

                      <div className="relative flex items-center w-44 sm:w-52 shrink-0">
                        <GitBranchIcon className="absolute left-2 size-3 text-muted-foreground pointer-events-none" />
                        <Input
                          defaultValue={link.branchName || ''}
                          onBlur={(e) => handleUpdateRepoBranch(link.repoId, e.target.value)}
                          placeholder="分支名，如 feat/demo"
                          className="pl-7 h-7 text-[11px] font-mono"
                        />
                      </div>

                      {/* 发起新分支按钮 */}
                      <Button
                        variant="outline"
                        size="icon-xs"
                        onClick={() =>
                          setBranchModal({
                            open: true,
                            repoId: link.repoId,
                            repoName: link.repoName,
                            defaultBranchName: link.branchName || `feat/${task.id.toLowerCase()}`,
                          })
                        }
                        title="在 Codeup 中由此发起新分支"
                        className="text-primary hover:bg-primary/10 shrink-0"
                      >
                        <GitForkIcon className="size-3.5" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRemoveRepo(link.repoId)}
                        title="取消关联此仓库"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* 添加新仓库关联下拉 */}
              <div className="pt-1">
                <SearchableSelect
                  className="w-full text-xs"
                  value={null}
                  onValueChange={handleRepoChange}
                  items={repositories
                    .filter((r) => !activeRepos.some((link) => link.repoId === r.id))
                    .map((r) => ({
                      label: r.pathWithNamespace || r.name,
                      value: String(r.id),
                    }))}
                  placeholder="+ 添加关联代码仓库..."
                />
              </div>
            </div>

            {/* 详细描述 / 清单 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                任务描述与 Checklist 备忘
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                placeholder="输入任务背景、实现思路或清单细节（支持 Markdown）..."
                rows={10}
                className="w-full rounded-md border border-border bg-muted/20 p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground outline-none focus:border-primary font-mono"
              />
            </div>
          </div>
        </div>
      </DrawerContent>

      {/* 发起分支弹窗 */}
      {branchModal && (
        <CreateTaskBranchDialog
          open={branchModal.open}
          onOpenChange={(open) => setBranchModal((prev) => (prev ? { ...prev, open } : null))}
          repoId={branchModal.repoId}
          repoName={branchModal.repoName}
          defaultBranchName={branchModal.defaultBranchName}
          onSuccess={(newBranch) => {
            handleUpdateRepoBranch(branchModal.repoId, newBranch);
          }}
        />
      )}
    </Drawer>
  );
}
