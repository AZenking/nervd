import { useState, type ReactNode } from 'react';
import {
  BugIcon, CheckIcon, ChevronRightIcon, InboxIcon, PencilIcon, PlusIcon, ShieldCheckIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { errorLog, humanizeError } from '@/lib/error-format';
import type { WorkitemChild, WorkitemTypeOption } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { useWorkitemWorkflowStatuses } from '@/hooks/use-workitem-workflow-statuses';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CopyButton } from '@/components/ui/copy-button';
import { EmptyHint } from '@/components/empty-hint';
import { SectionHeader } from '@/components/section-header';
import { StatusIcon } from '@/components/status-icon';

/** 行首快速状态切换下拉（免弹窗极速流转） */
export function InlineStatusDropdown({
  task,
  parentWorkitemId,
}: {
  task: WorkitemChild;
  parentWorkitemId: string;
}) {
  const { loadChildren } = useApp();
  const [open, setOpen] = useState(false);
  const { statuses, loadingStatuses, updatingStatus, fetchStatuses, changeStatus } =
    useWorkitemWorkflowStatuses({
      workitemId: task.workitemId,
      currentStatusId: task.statusId,
      currentStatusName: task.status,
      onSuccess: async () => {
        await loadChildren(parentWorkitemId);
      },
    });

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void fetchStatuses();
      }}
    >
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        render={
          <button
            type="button"
            className={cn(
              'group/status flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              updatingStatus && 'pointer-events-none opacity-60',
            )}
            title="点击快速更改状态"
          />
        }
      >
        {updatingStatus ? (
          <Spinner className="size-3.5" />
        ) : (
          <StatusIcon status={task.status} className="size-3.5 shrink-0" />
        )}
        <span className="text-[12px] text-muted-foreground group-hover/status:text-foreground">
          {task.status || '未指定'}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        {loadingStatuses && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            <span>读取状态流程…</span>
          </div>
        )}
        {!loadingStatuses && statuses.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            暂无可流转状态
          </div>
        )}
        {!loadingStatuses && statuses.map((s) => {
          const isCurrent = s.id === task.statusId || s.name === task.status;
          return (
            <DropdownMenuItem
              key={s.id}
              className={cn('flex cursor-pointer items-center justify-between text-xs', isCurrent && 'font-medium text-primary')}
              onClick={(e) => {
                e.stopPropagation();
                void changeStatus(s);
              }}
            >
              <div className="flex items-center gap-2">
                <StatusIcon status={s.name} className="size-3" />
                <span>{s.name}</span>
              </div>
              {isCurrent && <CheckIcon className="size-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ChildrenCardProps {
  title: string;
  category: 'Task' | 'Bug';
  description: string;
  items: WorkitemChild[];
  error?: string | null;
  debug?: string | null;
  parentWorkitemId: string;
  parentAssigneeId?: string;
  selectedChildId?: string | null;
  onSelect: (child: WorkitemChild) => void;
  onEdit?: (child: WorkitemChild) => void;
  action?: ReactNode;
  /** 列表非空时的尾部说明 */
  footnote?: string;
}

/** 子工作项/缺陷区块（Linear 列表形态）：行内极简展示，支持状态流转、统计概览、行内快速创建与详情抽屉 */
export function ChildrenCard({
  title,
  category,
  description,
  items,
  error,
  debug,
  parentWorkitemId,
  parentAssigneeId,
  selectedChildId,
  onSelect,
  footnote,
}: ChildrenCardProps) {
  const { settings, setToast, loadChildren } = useApp();
  const openSettings = useUi((s) => s.openSettings);
  const allowWriteOps = settings?.allowWriteOps ?? false;

  const isBug = category === 'Bug';
  const completedCount = items.filter((t) =>
    /完成|已解决|已关闭|已发布|已合并|已修复/.test(t.status || ''),
  ).length;
  const openDefectsCount = items.length - completedCount;

  // 行内快捷新建状态
  const [isAdding, setIsAdding] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [types, setTypes] = useState<WorkitemTypeOption[]>([]);
  const [typeId, setTypeId] = useState('');
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const startAdding = async () => {
    if (!allowWriteOps) {
      toast.add({
        title: '当前处于只读模式',
        description: `新建${title}需在「设置 → 安全」中开启写操作。`,
        type: 'warning',
        actionProps: {
          children: '前往设置',
          onClick: () => openSettings('security'),
        },
      });
      return;
    }
    setIsAdding(true);
    if (!types.length && !loadingTypes) {
      setLoadingTypes(true);
      try {
        const fetched = await api.listWorkitemTypes(category);
        setTypes(fetched);
        const def = fetched.find((t) => t.defaultType)?.id ?? fetched[0]?.id ?? '';
        setTypeId(def);
      } catch (e) {
        errorLog('inline-subtask-types', e);
      } finally {
        setLoadingTypes(false);
      }
    }
  };

  const cancelAdding = () => {
    setIsAdding(false);
    setNewSubject('');
  };

  const handleCreate = async () => {
    const trimmed = newSubject.trim();
    if (!trimmed || submitting) return;
    if (!allowWriteOps) {
      toast.add({
        title: '当前处于只读模式',
        description: `新建${title}需在「设置 → 安全」中开启写操作。`,
        type: 'warning',
        actionProps: {
          children: '前往设置',
          onClick: () => openSettings('security'),
        },
      });
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.createWorkitemChild(parentWorkitemId, {
        subject: trimmed,
        workitemTypeId: typeId || (types[0]?.id ?? ''),
        assignedTo: parentAssigneeId,
      });
      await loadChildren(parentWorkitemId);
      setToast({ text: `${title}「${created.identifier || trimmed}」已创建`, kind: 'ok' });
      setNewSubject('');
    } catch (cause) {
      errorLog('inline-subtask-create', cause);
      setToast({ text: `${title}创建失败：${humanizeError(cause)}`, kind: 'fail' });
    } finally {
      setSubmitting(false);
    }
  };

  // 统计概览胶囊
  const countBadge = items.length > 0 ? (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
      {isBug ? (
        openDefectsCount > 0 ? (
          <Badge
            variant="outline"
            className="border-destructive/30 bg-destructive/10 px-1.5 py-0 text-[11px] font-medium text-destructive"
          >
            {openDefectsCount} 待修复
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[11px] font-normal text-emerald-600 dark:text-emerald-400"
          >
            全部已解决
          </Badge>
        )
      ) : (
        <Badge
          variant="outline"
          className={cn(
            'px-1.5 py-0 text-[11px] font-normal',
            completedCount === items.length
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-border/60 bg-muted/50 text-muted-foreground',
          )}
        >
          {completedCount === items.length ? '全部完成' : `${completedCount}/${items.length} 完成`}
        </Badge>
      )}
    </div>
  ) : (
    <span className="font-mono text-xs text-muted-foreground">0</span>
  );

  const inlineAddRow = (
    <div className="flex items-center gap-2 p-2 bg-muted/25 transition-colors">
      {types.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-border/60 bg-background px-2 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none"
              />
            }
          >
            {isBug ? <BugIcon className="size-3 text-destructive/70" /> : <PlusIcon className="size-3 text-primary" />}
            <span>{types.find((t) => t.id === typeId)?.name || (isBug ? '缺陷' : '子任务')}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-32">
            {types.map((t) => (
              <DropdownMenuItem
                key={t.id}
                className={cn('text-xs cursor-pointer', t.id === typeId && 'font-medium text-primary')}
                onClick={() => setTypeId(t.id)}
              >
                {t.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex items-center gap-1.5 px-1.5 text-xs text-muted-foreground font-medium shrink-0">
          {isBug ? <BugIcon className="size-3 text-destructive/70" /> : <PlusIcon className="size-3 text-primary" />}
          <span>{types[0]?.name || (isBug ? '缺陷' : '子任务')}</span>
        </div>
      )}

      <Input
        value={newSubject}
        onChange={(e) => setNewSubject(e.target.value)}
        maxLength={500}
        autoFocus
        placeholder={isBug ? '输入缺陷描述，按 ↵ 快速创建…' : '输入子任务名称，按 ↵ 快速创建…'}
        className="h-7 text-xs flex-1 bg-background"
        disabled={submitting}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleCreate();
          if (e.key === 'Escape') cancelAdding();
        }}
      />

      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="xs"
          disabled={submitting || !newSubject.trim()}
          onClick={() => void handleCreate()}
        >
          {submitting ? '创建中…' : '创建'}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={submitting}
          onClick={cancelAdding}
        >
          取消
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <SectionHeader
        title={title}
        count={countBadge}
        hint={description}
        action={(
          <Button variant="ghost" size="sm" onClick={startAdding}>
            <PlusIcon data-icon="inline-start" />
            新建{title}
          </Button>
        )}
      />

      {(items.length > 0 || isAdding) && (
        <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/50 bg-background/50 overflow-hidden">
          {items.map((task) => {
            const isCompleted = /完成|已解决|已关闭|已发布|已合并|已修复/.test(task.status || '');
            const isSelected = selectedChildId === task.workitemId;
            return (
              <div
                key={task.workitemId}
                role="button"
                tabIndex={0}
                className={cn(
                  'group/row flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  isSelected && 'bg-muted/80 ring-1 ring-primary/40',
                )}
                onClick={() => onSelect(task)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelect(task);
                }}
              >
                {/* 行首：快捷状态切换下拉 */}
                <InlineStatusDropdown task={task} parentWorkitemId={parentWorkitemId} />

                {/* 编号：Task 浅蓝/默认，Bug 浅红标识 */}
                <div className="flex w-24 shrink-0 items-center gap-1">
                  {isBug && <BugIcon className="size-3 shrink-0 text-destructive/70" />}
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {task.identifier}
                  </span>
                </div>

                {/* 标题：已完成项微弱化 */}
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm font-medium',
                    isCompleted ? 'text-muted-foreground/75' : 'text-foreground/90',
                  )}
                  title={task.subject || task.identifier}
                >
                  {task.subject || task.identifier}
                </span>

                {/* 处理人 */}
                {task.assignedTo && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Avatar className="size-4">
                      <AvatarFallback className="text-[9px]">{task.assignedTo.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline">{task.assignedTo}</span>
                  </div>
                )}

                {/* 悬停快捷动作条 */}
                <div className="flex items-center gap-1">
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 transition-opacity group-hover/row:opacity-100"
                  >
                    <CopyButton text={task.identifier} label={`复制编号 ${task.identifier}`} />
                  </div>
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/row:opacity-100"
                    title="在详情抽屉中查看与编辑"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(task);
                    }}
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                  <ChevronRightIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100" />
                </div>
              </div>
            );
          })}

          {/* 行内创建行 */}
          {isAdding ? inlineAddRow : (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground text-left cursor-pointer border-t border-border/40"
              onClick={startAdding}
            >
              <PlusIcon className="size-3.5 shrink-0" />
              <span>添加{title}…</span>
            </button>
          )}
        </div>
      )}

      {items.length === 0 && !isAdding && !error && (
        <EmptyHint
          icon={isBug ? ShieldCheckIcon : InboxIcon}
          title={isBug ? '暂无挂载缺陷' : `暂无${title}`}
          className="py-6"
        />
      )}
      {!items.length && debug && (
        <Tooltip>
          <TooltipTrigger
            render={
              <p className="max-h-20 overflow-y-auto break-all rounded bg-muted/50 px-3 py-2 font-mono text-xs leading-4 text-muted-foreground" />
            }
          >
            接口返回：{debug}
          </TooltipTrigger>
          <TooltipContent className="max-w-96">接口原始返回（诊断用）</TooltipContent>
        </Tooltip>
      )}
      {!items.length && error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {title}加载失败：{error}
        </div>
      )}
      {items.length > 0 && footnote && (
        <p className="text-xs text-muted-foreground">{footnote}</p>
      )}
    </div>
  );
}
