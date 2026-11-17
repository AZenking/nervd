import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from 'react';
import {
  BugIcon, ChevronRightIcon, InboxIcon, PencilIcon, PlusIcon, ShieldCheckIcon, SparklesIcon,
  TerminalIcon, UserIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { getAiSettings, aiBreakdownRequirement } from '@/lib/ai-api';
import { postChildCreationActivity } from '@/lib/child-activity';
import type { AiSettingsView, BreakdownContext } from '@/types/ai';
import type { RepoSummary } from '@/types';
import { extractBreakdownKeywords } from '@/lib/breakdown-keywords';
import { AiBreakdownDialog } from './ai-breakdown-dialog';
import { BreakdownRepoPicker } from './breakdown-repo-picker';
import { errorLog, humanizeError } from '@/lib/error-format';
import type { WorkitemChild, WorkitemTypeOption } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { useAttribution } from '@/store/attribution';
import { useClipboard } from '@/hooks/use-clipboard';
import { workitemScanRepoIds } from '@/lib/workitem-repos';
import { buildCodexLaunchCommand } from '@/lib/agent-launch';
import { StartProcessingButton } from '../start-processing';
import { useWorkitemWorkflowStatuses, type WorkflowStatusItem } from '@/hooks/use-workitem-workflow-statuses';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card } from '@/components/ui/card';
import { ListBox } from '@/components/ui/list-box';
import { Select } from '@/components/ui/select';
import { Surface } from '@/components/ui/surface';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CopyButton } from '@/components/ui/copy-button';
import { EmptyHint } from '@/components/empty-hint';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { SectionHeader } from '@/components/section-header';
import { StatusIcon } from '@/components/status-icon';
import { Avatar, AvatarFallback, getAvatarColorClass } from '@/components/ui/avatar';
import { READONLY_BTN_CLASS } from '@/components/WriteOpButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SearchableAssigneePopover, type AssigneeOption } from './assignee-popover';

const EMPTY_REPOS: RepoSummary[] = [];

const SEVERITY_OPTIONS = [
  { label: '致命', color: 'bg-danger' },
  { label: '严重', color: 'bg-warning' },
  { label: '一般', color: 'bg-(--sticker-sky)' },
  { label: '轻微', color: 'bg-success' },
] as const;

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

  // 同步外部 task 状态变化
  useEffect(() => {
    setLocalStatus({ id: task.statusId, name: task.status });
  }, [task.statusId, task.status]);

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
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="shrink-0"
    >
      <DropdownMenu
        isOpen={open}
        onOpenChange={(v) => {
          // 状态更新中：保留可聚焦与 hover 说明，但不允许再次展开菜单
          if (updatingStatus) return;
          setOpen(v);
          if (v) void fetchStatuses();
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-disabled={updatingStatus || undefined}
              className={cn(
                'group/status gap-1.5 hover:bg-surface-secondary',
                updatingStatus && READONLY_BTN_CLASS,
              )}
              aria-label={updatingStatus ? '正在更新状态…' : '点击快速更改状态'}
            />
          }
        >
          {updatingStatus ? (
            <Spinner className="size-3.5" />
          ) : (
            <StatusIcon status={displayStatus} className="size-3.5 shrink-0" />
          )}
          <span className="text-muted-foreground group-hover/status:text-foreground">
            {displayStatus || '未指定'}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" aria-label="流转状态" className="min-w-36">
          {loadingStatuses ? (
            <DropdownMenuItem disabled textValue="读取状态流程…">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner className="size-3" />
                <span>读取状态流程…</span>
              </div>
            </DropdownMenuItem>
          ) : statuses.length === 0 ? (
            <DropdownMenuItem disabled textValue="暂无可流转状态">
              <span className="text-muted-foreground">暂无可流转状态</span>
            </DropdownMenuItem>
          ) : (
            statuses.map((s) => {
              const isCurrent = s.id === localStatus.id || s.name === localStatus.name;
              return (
                <DropdownMenuItem
                  key={s.id}
                  textValue={s.name}
                  onSelect={() => void handleSelectStatus(s)}
                  className={cn('justify-between', isCurrent && 'font-medium text-primary')}
                >
                  <div className="flex items-center gap-2">
                    <StatusIcon status={s.name} className="size-3" />
                    <span>{s.name}</span>
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
  items: WorkitemChild[];
  error?: string | null;
  debug?: string | null;
  parentWorkitemId: string;
  parentIdentifier?: string;
  parentSubject?: string;
  parentDescription?: string;
  parentAssigneeId?: string;
  parentAssigneeName?: string;
  /** 需求显式关联的仓库（方案 A）；为空时拆解前弹出上下文仓库选择 */
  explicitRepoIds?: number[];
  /** 采集所选仓库的改动范围 + 现有代码节选（由需求详情提供） */
  collectBreakdownContext?: (
    repoIds: number[],
    keywords: string[],
  ) => Promise<BreakdownContext>;
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
  items,
  error,
  debug,
  parentWorkitemId,
  parentIdentifier,
  parentSubject,
  parentDescription,
  parentAssigneeId,
  parentAssigneeName,
  explicitRepoIds = [],
  collectBreakdownContext,
  candidateAssignees,
  selectedChildId,
  onSelect,
  footnote,
}: ChildrenCardProps) {
  // 只订阅需要的字段与稳定 action：避免日志 / CI 轮询等高频 set 触发子项卡片整块重渲。
  const settings = useApp((s) => s.settings);
  const setToast = useApp((s) => s.setToast);
  const loadChildren = useApp((s) => s.loadChildren);
  const addOptimisticChild = useApp((s) => s.addOptimisticChild);
  const reloadComments = useApp((s) => s.reloadComments);
  const openSettings = useUi((s) => s.openSettings);
  const repositories = useApp((s) => s.repositories) ?? EMPTY_REPOS;
  const allowWriteOps = settings?.allowWriteOps ?? false;

  // Agent 联动（纯前端）：子任务行共享父级加载的本地仓库绑定与 active-workitem 状态，
  // 行内「处理」写入上下文，行尾 chip 透出「处理中 · 仓库」，并支持复制 Codex 启动命令。
  const iterationName = useUi((s) => s.iterationKey);
  const loadBindings = useAttribution((s) => s.loadBindings);
  const loadActiveWorkitems = useAttribution((s) => s.loadActiveWorkitems);
  const bindings = useAttribution((s) => s.bindings);
  const activeWorkitems = useAttribution((s) => s.activeWorkitems);
  const { copy } = useClipboard();

  useEffect(() => {
    // 每行一个「处理」实例会跳过各自的自动加载，这里统一加载一次（本地 IPC，失败静默）。
    void loadBindings({ silent: true });
    void loadActiveWorkitems({ silent: true });
  }, [loadBindings, loadActiveWorkitems]);

  /** 每个子任务当前所在本地仓库（同一工作项多仓库时以最后一次写入的记录为准） */
  const activeChildContext = useMemo(() => {
    const map = new Map<string, { repoId: number; repoName: string; path: string }>();
    for (const [repoIdText, item] of Object.entries(activeWorkitems)) {
      if (!item?.workitemId) continue;
      const repoId = Number(repoIdText);
      if (!Number.isFinite(repoId)) continue;
      const binding = bindings.find((entry) => entry.repoId === repoId);
      if (!binding) continue;
      const repoName = repositories.find((repo) => repo.id === repoId)?.name || `#${repoId}`;
      map.set(item.workitemId, { repoId, repoName, path: binding.path });
    }
    return map;
  }, [activeWorkitems, bindings, repositories]);

  /**
   * 复制 Codex 启动命令：优先使用该子任务当前所在仓库；否则在「父需求关联 ∩ 已绑定」的唯一候选上生成；
   * 多候选 / 无绑定则引导先点「处理」或在设置中绑定。
   */
  const copyCodexCommand = useCallback((task: WorkitemChild) => {
    const childCategory = (task.category ?? category).toLowerCase() === 'bug' ? 'Bug' : 'Task';
    const active = activeChildContext.get(task.workitemId);
    let binding = active ? bindings.find((entry) => entry.repoId === active.repoId) : undefined;

    if (!binding && settings) {
      const scanIds = workitemScanRepoIds(childCategory, task.workitemId, settings, parentWorkitemId);
      const candidates = bindings.filter((entry) => scanIds.includes(entry.repoId));
      if (candidates.length === 1) binding = candidates[0];
      else if (candidates.length === 0 && bindings.length === 1) binding = bindings[0];
    }

    if (!binding) {
      toast.add({
        title: '尚未确定本地仓库',
        description: '先在子任务行点「处理」选择要使用的本地仓库，再复制 Codex 启动命令。',
        type: 'warning',
        actionProps: { children: '前往设置', onClick: () => openSettings('trace') },
      });
      return;
    }

    const command = buildCodexLaunchCommand(binding.path, {
      identifier: task.identifier || task.workitemId,
      subject: task.subject,
      category: childCategory,
      parentIdentifier,
      parentSubject,
      iterationName,
    });
    void copy(command, `已复制 Codex 启动命令（${binding.path}）`);
  }, [activeChildContext, bindings, category, copy, iterationName, openSettings, parentIdentifier, parentSubject, parentWorkitemId, settings]);

  const breakdownKeywords = useMemo(
    () => extractBreakdownKeywords(parentSubject || title, parentDescription || ''),
    [parentDescription, parentSubject, title],
  );

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
  // AI 拆解上下文：本次使用的仓库与选择器状态
  const [contextRepoIds, setContextRepoIds] = useState<number[]>([]);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const pendingAiRef = useRef<AiSettingsView | null>(null);
  const pendingTypesRef = useRef<WorkitemTypeOption[]>([]);

  const proceedBreakdown = async (repoIds: number[]) => {
    const currentAi = pendingAiRef.current ?? (await getAiSettings());
    pendingAiRef.current = currentAi;
    const availableTypes = pendingTypesRef.current;
    const context = collectBreakdownContext
      ? await collectBreakdownContext(repoIds, breakdownKeywords)
      : { scope: [], code: [] };
    setContextRepoIds(repoIds);

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

      const generated = await aiBreakdownRequirement(
        parentSubject || title,
        parentDescription || '',
        context.scope,
        context.code,
      );

      if (generated.length === 0) {
        toast.add({ title: 'AI 未能生成有效子任务条目', type: 'warning' });
        return;
      }

      const createdChildren: WorkitemChild[] = [];
      for (const item of generated) {
        const created = await api.createWorkitemChild(parentWorkitemId, {
          subject: item.subject.trim(),
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
      // AI 批量拆解：需求动态汇总一条（全部任务概要与状态），避免逐条刷屏
      void postChildCreationActivity(parentWorkitemId, createdChildren, 'Task')
        .then((posted) => {
          if (posted) void reloadComments(parentWorkitemId);
        });
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

  const handleRepoPickerConfirm = (repoIds: number[]) => {
    setRepoPickerOpen(false);
    if (repoIds.length === 0) return;
    void proceedBreakdown(repoIds);
  };

  const handleAiBreakdown = async () => {
    if (!allowWriteOps) {
      toast.add({
        title: '当前处于只读模式',
        description: 'AI 拆解创建子任务需在「设置 → 安全与权限」中开启写操作。',
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
    pendingAiRef.current = currentAi;
    pendingTypesRef.current = availableTypes;

    // 需求有显式关联仓库：直接作为拆解上下文
    if (explicitRepoIds.length > 0) {
      await proceedBreakdown(explicitRepoIds);
      return;
    }

    // 没有显式关联：弹出仓库选择（只影响本次拆解，不改关联）
    setRepoPickerOpen(true);
  };

  const startAdding = async () => {
    if (!allowWriteOps) {
      toast.add({
        title: '当前处于只读模式',
        description: `新建${title}需在「设置 → 安全与权限」中开启写操作。`,
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
        description: `新建${title}需在「设置 → 安全与权限」中开启写操作。`,
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
      // 需求动态补充：任务带概要与状态，缺陷只带当前动态（best-effort，失败不阻断）
      void postChildCreationActivity(parentWorkitemId, [completeChild], isBug ? 'Bug' : 'Task')
        .then((posted) => {
          if (posted) void reloadComments(parentWorkitemId);
        });
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
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{items.length}</span>
      {isBug ? (
        openDefectsCount > 0 ? (
          <Badge variant="soft" color="danger" size="sm" className="font-medium">
            <span className="font-mono tabular-nums">{openDefectsCount}</span> 待修复
          </Badge>
        ) : (
          <Badge variant="soft" color="success" size="sm">
            全部已解决
          </Badge>
        )
      ) : (
        <Badge
          variant="outline"
          className={cn(
            'px-1.5 py-0 text-[11px] font-normal',
            completedCount === items.length
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-border/60 bg-surface-secondary/50 text-muted-foreground',
          )}
        >
          {completedCount === items.length
            ? '全部完成'
            : (
              <>
                <span className="font-mono tabular-nums">{completedCount}/{items.length}</span> 完成
              </>
            )}
        </Badge>
      )}
    </div>
  ) : (
    <span className="font-mono text-xs text-muted-foreground">0</span>
  );

  // 保证当前选中的人或需求负责人在候选人列表中，确保 Select 能够正确匹配 value 和回显
  const assigneeCandidates = useMemo(() => {
    const list = [...(candidateAssignees ?? [])];
    const currentName = selectedAssignee?.name || parentAssigneeName;
    const currentId = selectedAssignee?.id || parentAssigneeId;
    if (currentName && !list.some((c) => c.name === currentName || (currentId && c.id === currentId))) {
      list.unshift({
        id: currentId || currentName,
        name: currentName,
        role: currentId === parentAssigneeId ? '需求负责人' : undefined,
      });
    }
    return list;
  }, [candidateAssignees, selectedAssignee, parentAssigneeName, parentAssigneeId]);

  const currentAssigneeKey = useMemo(() => {
    if (selectedAssignee?.id) return selectedAssignee.id;
    const matched = assigneeCandidates.find((c) => c.name === (selectedAssignee?.name || parentAssigneeName));
    return matched?.id ?? (assigneeCandidates[0]?.id || '');
  }, [selectedAssignee, parentAssigneeName, assigneeCandidates]);

  const inlineAddRow = (
    <Surface
      variant="secondary"
      onKeyDown={(e) => e.stopPropagation()}
      className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-border/70 transition-colors"
    >
      {types.length > 1 ? (
        <Select
          aria-label="工作项类型"
          variant="secondary"
          className="w-auto shrink-0"
          selectedKey={typeId || (types[0]?.id ?? '')}
          onSelectionChange={(key) => {
            if (key !== null) setTypeId(String(key));
          }}
        >
          <Select.Trigger className="gap-1.5 font-medium">
            <Select.Value>
              {({ state }) => {
                const currentType = types.find((t) => t.id === state.selectedItems[0]?.key) || types[0];
                return (
                  <div className="flex items-center gap-1.5 truncate">
                    {isBug ? (
                      <BugIcon className="size-3 text-destructive/70 shrink-0" />
                    ) : (
                      <PlusIcon className="size-3 text-primary shrink-0" />
                    )}
                    <span className="truncate">{currentType?.name || (isBug ? '缺陷' : '子任务')}</span>
                  </div>
                );
              }}
            </Select.Value>
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover className="min-w-32">
            <ListBox>
              {types.map((t) => (
                <ListBox.Item key={t.id} id={t.id} textValue={t.name} className="text-xs">
                  {t.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      ) : (
        <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 text-xs font-medium text-foreground">
          {isBug ? <BugIcon className="size-3 text-destructive/70 shrink-0" /> : <PlusIcon className="size-3 text-primary shrink-0" />}
          <span>{types[0]?.name || (isBug ? '缺陷' : '子任务')}</span>
        </div>
      )}

      {/* 缺陷专属：严重程度快速选择（严格按照 HeroUI Select 规范） */}
      {isBug && (
        <Select
          aria-label="严重程度"
          variant="secondary"
          className="w-auto shrink-0"
          selectedKey={selectedSeverity}
          onSelectionChange={(key) => {
            if (key !== null) setSelectedSeverity(String(key));
          }}
        >
          <Select.Trigger className="gap-1.5 font-medium">
            <Select.Value>
              {({ state }) => {
                const sev = SEVERITY_OPTIONS.find((s) => s.label === state.selectedItems[0]?.key) || SEVERITY_OPTIONS[2];
                return (
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={cn('size-1.5 rounded-full shrink-0', sev.color)} />
                    <span className="truncate">{sev.label}</span>
                  </div>
                );
              }}
            </Select.Value>
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover className="min-w-28">
            <ListBox>
              {SEVERITY_OPTIONS.map((sev) => (
                <ListBox.Item key={sev.label} id={sev.label} textValue={sev.label} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className={cn('size-1.5 rounded-full shrink-0', sev.color)} />
                    <span>{sev.label}</span>
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}

      {/* 指定人选择器（严格按照 HeroUI Select 规范） */}
      <Select
        aria-label="指定处理人"
        variant="secondary"
        className="w-auto shrink-0 max-w-44"
        placeholder="指定处理人"
        selectedKey={currentAssigneeKey}
        onSelectionChange={(key) => {
          if (key !== null) {
            const found = assigneeCandidates.find((c) => c.id === String(key));
            if (found) setSelectedAssignee(found);
          }
        }}
      >
        <Select.Trigger className="gap-1.5 font-medium">
          <Select.Value>
            {({ state }) => {
              const item = assigneeCandidates.find((c) => c.id === state.selectedItems[0]?.key);
              const name = item?.name || selectedAssignee?.name || parentAssigneeName;
              if (!name) {
                return (
                  <div className="flex items-center gap-1.5 text-muted-foreground truncate">
                    <UserIcon className="size-3.5 text-muted-foreground shrink-0" />
                    <span>指定处理人</span>
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-1.5 truncate">
                  <Avatar className={cn('size-3.5 shrink-0 border', getAvatarColorClass(name))}>
                    <AvatarFallback className="text-[9px] bg-transparent font-medium">
                      {name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{name}</span>
                </div>
              );
            }}
          </Select.Value>
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover className="min-w-44">
          <ListBox>
            {assigneeCandidates.map((c) => (
              <ListBox.Item key={c.id} id={c.id} textValue={c.name} className="text-xs">
                <Avatar className={cn('size-4 shrink-0 border', getAvatarColorClass(c.name))}>
                  <AvatarFallback className="text-[9px] bg-transparent font-medium">
                    {c.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="truncate" title={c.name}>{c.name}</span>
                  {c.role && (
                    <span className="text-[10px] text-muted-foreground/80 shrink-0" title={c.role}>({c.role})</span>
                  )}
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <Input
        value={newSubject}
        onChange={(e) => setNewSubject(e.target.value)}
        maxLength={500}
        autoFocus
        placeholder={isBug ? '输入缺陷描述，按 ↵ 快速创建…' : '输入子任务名称，按 ↵ 快速创建…'}
        className="border-border/70 flex-1 min-w-44 bg-background"
        disabled={submitting}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') {
            e.stopPropagation();
            e.nativeEvent?.stopImmediatePropagation?.();
          }
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            void handleCreate();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelAdding();
          }
        }}
        onKeyUp={(e) => {
          if (e.key !== 'Escape' && e.key !== 'Tab') {
            e.stopPropagation();
            e.nativeEvent?.stopImmediatePropagation?.();
          }
        }}
      />

      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          disabled={submitting || !newSubject.trim()}
          onPress={() => void handleCreate()}
                  >
          {submitting ? '创建中…' : '创建'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={submitting}
          onPress={cancelAdding}
          className="text-muted-foreground hover:text-foreground"
        >
          取消
        </Button>
      </div>
    </Surface>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <SectionHeader
        title={title}
        count={countBadge}
        action={(
          /* 2026-11-17 设计评审：不再用「更多」菜单收纳这两个动作，
             直接以 HeroUI ButtonGroup 常驻呈现；文案超过四个字按规范只给图标 + Tooltip。 */
          <ButtonGroup variant="secondary" className="shrink-0" aria-label={`${title}操作`}>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    data-testid="children-card-add"
                    aria-label={`新建${title}`}
                    aria-disabled={!allowWriteOps || undefined}
                    className={cn(!allowWriteOps && READONLY_BTN_CLASS)}
                    onPress={() => void startAdding()}
                  />
                )}
              >
                <PlusIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>新建{title}</TooltipContent>
            </Tooltip>
            {!isBug && (
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      data-testid="children-card-ai-breakdown"
                      aria-label={aiDirectLoading ? 'AI 拆解生成中…' : 'AI 智能拆解'}
                      aria-disabled={!allowWriteOps || undefined}
                      disabled={aiDirectLoading}
                      className={cn('text-primary', !allowWriteOps && READONLY_BTN_CLASS)}
                      onPress={() => void handleAiBreakdown()}
                    />
                  )}
                >
                  {aiDirectLoading ? <Spinner className="size-3.5" /> : <SparklesIcon className="size-3.5" />}
                </TooltipTrigger>
                <TooltipContent>{aiDirectLoading ? 'AI 拆解生成中…' : 'AI 智能拆解'}</TooltipContent>
              </Tooltip>
            )}
          </ButtonGroup>
        )}
      />

      {(items.length > 0 || isAdding) && (
        <Card className="divide-y divide-border/40 p-0 overflow-hidden">
          {items.map((task) => {
            const isCompleted = /完成|已解决|已关闭|已发布|已合并|已修复/.test(task.status || '');
            const isSelected = selectedChildId === task.workitemId;
            const activeContext = activeChildContext.get(task.workitemId);
            return (
              <div
                key={task.workitemId}
                data-testid="child-row"
                data-identifier={task.identifier ?? ''}
                title={`${task.identifier} ${task.subject || ''}`.trim()}
                className={cn(
                  'group/row flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-secondary',
                  isSelected && 'bg-surface-secondary/80 ring-1 ring-primary/40',
                )}
              >
                {/* 行首：快捷状态切换下拉 */}
                <InlineStatusDropdown task={task} parentWorkitemId={parentWorkitemId} />

                {/* 标题区：行内唯一可点击进入详情的控件（不再用整行 role="button" 包裹内嵌控件） */}
                <button
                  type="button"
                  data-testid="child-row-open"
                  onClick={() => onSelect(task)}
                  aria-label={`打开 ${task.identifier ?? ''} ${task.subject ?? ''} 详情`.trim()}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* 编号：Task 浅蓝/默认，Bug 浅红标识 */}
                  <div className="flex w-24 shrink-0 items-center gap-1">
                    {isBug && <BugIcon className="size-3 shrink-0 text-destructive/70" />}
                    <span className="truncate font-mono text-xs text-muted-foreground" title={task.identifier}>
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
                </button>

                {/* Agent 联动：处理中状态（常驻）+ 开始处理入口（写入 .nervd/active-workitem.json） */}
                <div
                  className="flex shrink-0 items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {activeContext && (
                    <Chip
                      size="sm"
                      variant="soft"
                      color="accent"
                      className="max-w-28 shrink-0"
                      title={`当前处理仓库：${activeContext.path}`}
                    >
                      <Chip.Label className="truncate">处理中 · {activeContext.repoName}</Chip.Label>
                    </Chip>
                  )}
                  <span data-testid="child-agent-start" className="inline-flex">
                    <StartProcessingButton
                      workitemId={task.workitemId}
                      category={task.category?.toLowerCase() === 'bug' ? 'Bug' : 'Task'}
                      parentWorkitemId={parentWorkitemId}
                      size="xs"
                      iconOnly
                      disableAutoLoad
                    />
                  </span>
                </div>

                {/* 处理人下拉切换 */}
                <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <InlineAssigneeDropdown task={task} candidateAssignees={candidateAssignees} />
                </div>

                {/* 悬停快捷动作条 */}
                <div className="flex items-center gap-1">
                  {/* 复制 Agent 启动命令：纯前端生成 cd + codex prompt，粘贴到终端即可开始 */}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          data-testid="child-codex-copy"
                          className={cn(
                            'text-muted-foreground transition-opacity hover:text-foreground',
                            // 已开始处理的子任务常驻展示「复制 Codex 命令」，让下一步动作可发现
                            activeContext ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
                          )}
                          aria-label="复制 Codex 启动命令"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyCodexCommand(task);
                          }}
                        />
                      }
                    >
                      <TerminalIcon className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>复制 Codex 启动命令（含该子任务上下文）</TooltipContent>
                  </Tooltip>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 transition-opacity group-hover/row:opacity-100"
                  >
                    <CopyButton text={task.identifier} label={`复制编号 ${task.identifier}`} />
                  </div>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/row:opacity-100"
                          aria-label="在详情抽屉中查看与编辑"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(task);
                          }}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent>在详情抽屉中查看与编辑</TooltipContent>
                  </Tooltip>
                  <ChevronRightIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100" />
                </div>
              </div>
            );
          })}

          {/* 行内创建行 */}
          {isAdding ? inlineAddRow : (
            <Button
              type="button"
              variant="ghost"
              size="default"
              className="w-full justify-start"
              onPress={startAdding}
            >
              <PlusIcon className="size-3.5 shrink-0" />
              <span>添加{title}…</span>
            </Button>
          )}
        </Card>
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
              <ScrollArea size={24} className="max-h-20 break-words rounded bg-surface-secondary/50 px-3 py-2 font-mono text-xs leading-4 text-muted-foreground" />
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
      {items.length > 0 && error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          刷新{title}列表失败，当前显示的是上次数据：{error}
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
          contextRepoIds={contextRepoIds}
          contextKeywords={breakdownKeywords}
          collectBreakdownContext={collectBreakdownContext}
          workitemTypes={types}
          onCreated={async () => {
            await loadChildren(parentWorkitemId);
          }}
        />
      )}

      <BreakdownRepoPicker
        open={repoPickerOpen}
        onOpenChange={setRepoPickerOpen}
        repositories={repositories}
        onConfirm={handleRepoPickerConfirm}
      />
    </div>
  );
}
