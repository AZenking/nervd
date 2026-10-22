import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  BugIcon, CheckIcon, ChevronRightIcon, InboxIcon, PencilIcon, PlusIcon, SearchIcon, ShieldCheckIcon, SparklesIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { getAiSettings, aiBreakdownRequirement } from '@/lib/ai-api';
import type { AiSettingsView } from '@/types/ai';
import { AiBreakdownDialog } from './ai-breakdown-dialog';
import { errorLog, humanizeError } from '@/lib/error-format';
import type { WorkitemChild, WorkitemTypeOption } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { useWorkitemWorkflowStatuses, type WorkflowStatusItem } from '@/hooks/use-workitem-workflow-statuses';
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
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { SectionHeader } from '@/components/section-header';
import { StatusIcon } from '@/components/status-icon';
import { SearchableAssigneePopover, type AssigneeOption } from './assignee-popover';

/** 行首快速状态切换下拉（免弹窗极速流转，即时回显 + 乐观更新） */
export function InlineStatusDropdown({
  task,
  parentWorkitemId,
}: {
  task: WorkitemChild;
  parentWorkitemId: string;
}) {
  const loadChildren = useApp((state) => state.loadChildren);
  const [open, setOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState({ id: task.statusId, name: task.status });
  const [statusSearch, setStatusSearch] = useState('');

  // 同步外部 task 状态变化
  useEffect(() => {
    setLocalStatus({ id: task.statusId, name: task.status });
  }, [task.statusId, task.status]);

  useEffect(() => {
    if (open) setStatusSearch('');
  }, [open]);

  const { statuses, loadingStatuses, updatingStatus, fetchStatuses, changeStatus } =
    useWorkitemWorkflowStatuses({
      workitemId: task.workitemId,
      currentStatusId: localStatus.id,
      currentStatusName: localStatus.name,
      onSuccess: async () => {
        // 延迟后台拉取最新状态（由 store 内时间戳防御 ES 索引延迟覆盖）
        setTimeout(() => {
          void loadChildren(parentWorkitemId);
        }, 1500);
      },
    });

  const filteredStatuses = useMemo(() => {
    const q = statusSearch.trim().toLowerCase();
    if (!q) return statuses;
    return statuses.filter((s) => s.name.toLowerCase().includes(q));
  }, [statuses, statusSearch]);

  const handleSelectStatus = async (s: WorkflowStatusItem) => {
    // 本地回显由统一 workflow action 负责，避免先写一次 store、再由 API action 写第二次。
    const previous = { ...localStatus };
    setLocalStatus({ id: s.id, name: s.name });
    const ok = await changeStatus(s);
    if (!ok) {
      setLocalStatus(previous);
    }
  };

  const displayStatus = localStatus.name || task.status;

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
          <StatusIcon status={displayStatus} className="size-3.5 shrink-0" />
        )}
        <span className="text-[12px] text-muted-foreground group-hover/status:text-foreground">
          {displayStatus || '未指定'}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        {statuses.length >= 5 && (
          <div className="p-1 border-b border-border/50">
            <div className="relative">
              <SearchIcon className="absolute left-2 top-2 size-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="搜索状态…"
                value={statusSearch}
                onChange={(e) => setStatusSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-6 w-full rounded border border-border/60 bg-muted/40 pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
              />
            </div>
          </div>
        )}
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
        {!loadingStatuses && statuses.length > 0 && filteredStatuses.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            未找到匹配状态
          </div>
        )}
        {!loadingStatuses && filteredStatuses.map((s) => {
          const isCurrent = s.id === localStatus.id || s.name === localStatus.name;
          return (
            <DropdownMenuItem
              key={s.id}
              className={cn('flex cursor-pointer items-center justify-between text-xs', isCurrent && 'font-medium text-primary')}
              onClick={(e) => {
                e.stopPropagation();
                void handleSelectStatus(s);
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

/** 行内处理人切换下拉（免弹窗极速分配，支持实时搜索与全键盘导航，即时回显 + 乐观更新） */
export function InlineAssigneeDropdown({
  task,
  candidateAssignees,
}: {
  task: WorkitemChild;
  candidateAssignees?: AssigneeOption[];
}) {
  return (
    <SearchableAssigneePopover
      assignedToName={task.assignedTo}
      candidateAssignees={candidateAssignees}
      workitemId={task.workitemId}
      variant="row"
      checkWriteOps
      align="end"
    />
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
  parentIdentifier?: string;
  parentSubject?: string;
  parentDescription?: string;
  parentAssigneeId?: string;
  parentAssigneeName?: string;
  candidateAssignees?: AssigneeOption[];
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
  parentIdentifier,
  parentSubject,
  parentDescription,
  parentAssigneeId,
  parentAssigneeName,
  candidateAssignees,
  selectedChildId,
  onSelect,
  footnote,
}: ChildrenCardProps) {
  const { settings, setToast, loadChildren, addOptimisticChild } = useApp();
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
  const [selectedAssignee, setSelectedAssignee] = useState<AssigneeOption | null>(null);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('一般');

  // AI 智能拆解相关状态
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiDirectLoading, setAiDirectLoading] = useState(false);
  const [aiSettingsCache, setAiSettingsCache] = useState<AiSettingsView | null>(null);

  const handleAiBreakdown = async () => {
    if (!allowWriteOps) {
      toast.add({
        title: '当前处于只读模式',
        description: 'AI 拆解创建子任务需在「设置 → 安全」中开启写操作。',
        type: 'warning',
        actionProps: {
          children: '前往设置',
          onClick: () => openSettings('security'),
        },
      });
      return;
    }

    let currentAi = aiSettingsCache;
    try {
      currentAi = await getAiSettings();
      setAiSettingsCache(currentAi);
    } catch {
      // ignore
    }

    if (!currentAi?.hasApiKey) {
      toast.add({
        title: '未配置 AI API Key',
        description: '请先在「设置 → AI 助手」中配置大模型密钥。',
        type: 'warning',
        actionProps: {
          children: '前往配置',
          onClick: () => openSettings('ai'),
        },
      });
      return;
    }

    // 预拉取工作项类型
    let availableTypes = types;
    if (availableTypes.length === 0) {
      try {
        availableTypes = await api.listWorkitemTypes(isBug ? 'Bug' : 'Task');
        setTypes(availableTypes);
      } catch {
        // ignore
      }
    }

    // 模式 A：弹窗二次确认
    if (currentAi.breakdownMode === 'review') {
      setAiDialogOpen(true);
      return;
    }

    // 模式 B：一键直达生成
    setAiDirectLoading(true);
    try {
      const taskType = availableTypes.find((t) => /任务|Task/i.test(t.name)) || availableTypes[0];
      const targetTypeId = taskType?.id ?? '';

      const tags = currentAi.defaultBreakdownTags.length > 0
        ? currentAi.defaultBreakdownTags
        : ['前端', '后端', '自测'];

      const generated = await aiBreakdownRequirement(
        parentSubject || title,
        parentDescription || '',
        tags,
      );

      if (generated.length === 0) {
        toast.add({ title: 'AI 未能生成有效子任务条目', type: 'warning' });
        return;
      }

      const createdChildren: WorkitemChild[] = [];
      for (const item of generated) {
        const created = await api.createWorkitemChild(parentWorkitemId, {
          subject: `【${item.tag}】${item.subject.trim()}`,
          workitemTypeId: targetTypeId,
          assignedTo: parentAssigneeId,
          category: 'Task',
        });
        const completeChild: WorkitemChild = {
          ...created,
          category: created.category || 'Task',
          assignedTo: created.assignedTo || parentAssigneeName || '',
          status: created.status || '待办',
        };
        createdChildren.push(completeChild);
      }

      addOptimisticChild(parentWorkitemId, createdChildren);
      void loadChildren(parentWorkitemId);
      toast.add({
        title: 'AI 一键拆解完成',
        description: `已自动为 ${parentIdentifier || '当前需求'} 批量创建 ${generated.length} 个子任务`,
        type: 'success',
      });
    } catch (err) {
      errorLog('ai-direct-breakdown', err);
      toast.add({
        title: 'AI 一键拆解失败',
        description: humanizeError(err),
        type: 'error',
      });
    } finally {
      setAiDirectLoading(false);
    }
  };

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
    // 默认指定人为需求负责人或候选列表首项
    if (!selectedAssignee) {
      const defaultAssignee = candidateAssignees?.find((a) => a.id === parentAssigneeId || a.name === parentAssigneeName)
        ?? candidateAssignees?.[0]
        ?? (parentAssigneeId ? { id: parentAssigneeId, name: parentAssigneeName || '需求负责人', role: '需求负责人' } : null);
      setSelectedAssignee(defaultAssignee);
    }
    setSelectedSeverity('一般');
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
        assignedTo: selectedAssignee?.id || parentAssigneeId,
        severity: isBug ? selectedSeverity : undefined,
        category: isBug ? 'Bug' : 'Task',
      });
      const completeChild: WorkitemChild = {
        ...created,
        category: created.category || (isBug ? 'Bug' : 'Task'),
        assignedTo: created.assignedTo || selectedAssignee?.name || parentAssigneeName || '',
        status: created.status || '待办',
      };
      addOptimisticChild(parentWorkitemId, completeChild);
      setToast({ text: `${title}「${completeChild.identifier || trimmed}」已创建`, kind: 'ok' });
      setNewSubject('');
      setIsAdding(false);
      void loadChildren(parentWorkitemId);
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
    <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/25 transition-colors">
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

      {/* 缺陷专属：严重程度快速选择 */}
      {isBug && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-border/60 bg-background px-2 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none"
                title="选择严重程度"
              />
            }
          >
            <span
              className={cn('size-1.5 rounded-full shrink-0', {
                'bg-red-500': selectedSeverity === '致命',
                'bg-amber-500': selectedSeverity === '严重',
                'bg-yellow-500': selectedSeverity === '一般',
                'bg-emerald-400': selectedSeverity === '轻微',
              })}
            />
            <span>{selectedSeverity}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-28">
            {[
              { label: '致命', color: 'bg-red-500' },
              { label: '严重', color: 'bg-amber-500' },
              { label: '一般', color: 'bg-yellow-500' },
              { label: '轻微', color: 'bg-emerald-400' },
            ].map((sev) => (
              <DropdownMenuItem
                key={sev.label}
                className={cn(
                  'text-xs cursor-pointer flex items-center justify-between',
                  sev.label === selectedSeverity && 'font-medium text-primary',
                )}
                onClick={() => setSelectedSeverity(sev.label)}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('size-1.5 rounded-full shrink-0', sev.color)} />
                  <span>{sev.label}</span>
                </div>
                {sev.label === selectedSeverity && <CheckIcon className="size-3" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* 指定人选择器（支持搜索与键盘快捷导航） */}
      <SearchableAssigneePopover
        assignedToName={selectedAssignee?.name || parentAssigneeName || '指定人'}
        candidateAssignees={candidateAssignees}
        onSelect={(a) => setSelectedAssignee(a)}
        variant="button"
        checkWriteOps={false}
        placeholder="指定人"
        align="start"
      />

      <Input
        value={newSubject}
        onChange={(e) => setNewSubject(e.target.value)}
        maxLength={500}
        autoFocus
        placeholder={isBug ? '输入缺陷描述，按 ↵ 快速创建…' : '输入子任务名称，按 ↵ 快速创建…'}
        className="h-7 text-xs flex-1 min-w-44 bg-background"
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
          <div className="flex items-center gap-1.5">
            {!isBug && (
              <Button
                variant="ghost"
                size="sm"
                disabled={aiDirectLoading}
                onClick={() => void handleAiBreakdown()}
                className="text-primary hover:text-primary hover:bg-primary/10"
                title="根据需求描述一键智能拆解前端、后端与自测子任务"
              >
                {aiDirectLoading ? (
                  <Spinner className="size-3.5 mr-1" />
                ) : (
                  <SparklesIcon className="size-3.5 mr-1 text-primary" />
                )}
                {aiDirectLoading ? 'AI 拆解生成中…' : 'AI 智能拆解'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={startAdding}>
              <PlusIcon data-icon="inline-start" />
              新建{title}
            </Button>
          </div>
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
                data-testid="child-row"
                data-identifier={task.identifier ?? ''}
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
                <OverflowTooltip
                  text={task.subject || task.identifier}
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm font-medium',
                    isCompleted ? 'text-muted-foreground/75' : 'text-foreground/90',
                  )}
                />

                {/* 处理人下拉切换 */}
                <InlineAssigneeDropdown task={task} candidateAssignees={candidateAssignees} />

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

      {!isBug && (
        <AiBreakdownDialog
          open={aiDialogOpen}
          onOpenChange={setAiDialogOpen}
          parentWorkitemId={parentWorkitemId}
          parentIdentifier={parentIdentifier || ''}
          parentSubject={parentSubject || title}
          parentDescription={parentDescription}
          parentAssigneeId={parentAssigneeId}
          parentAssigneeName={parentAssigneeName}
          candidateAssignees={candidateAssignees}
          defaultTags={aiSettingsCache?.defaultBreakdownTags}
          workitemTypes={types}
          onCreated={async () => {
            await loadChildren(parentWorkitemId);
          }}
        />
      )}
    </div>
  );
}
