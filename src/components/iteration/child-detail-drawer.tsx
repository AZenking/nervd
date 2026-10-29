import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRightIcon,
  BugIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  FolderIcon,
  LayersIcon,
  Maximize2Icon,
  UserIcon,
  XIcon,
} from 'lucide-react';
import type { WorkitemChild } from '@/lib/api';
import * as api from '@/lib/api';
import { openWorkitemInYunxiao } from '@/lib/yunxiao-link';
import { CATEGORY_LABELS, type Category } from '@/types';
import { SearchableAssigneePopover } from './requirement/assignee-popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Descriptions, type DescriptionsItem } from '@/components/ui/descriptions';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { errorLog } from '@/lib/error-format';
import { useApp } from '@/store/app';
import { useClipboard } from '@/hooks/use-clipboard';
import { useWorkitemWorkflowStatuses } from '@/hooks/use-workitem-workflow-statuses';
import { StatusIcon } from '../status-icon';
import { OverflowTooltip } from '../overflow-tooltip';
import { RichDescription } from './rich-description';

export interface ChildDetailDrawerProps {
  child: WorkitemChild | null;
  parentWorkitem?: {
    workitemId: string;
    identifier: string;
    subject?: string;
  } | null;
  candidateAssignees?: { id: string; name: string; role?: string }[];
  onClose: () => void;
  onOpenInWorkbench: (child: WorkitemChild) => void;
  onStatusChange?: (childId: string, newStatus: string) => void;
  onAssigneeChange?: (childId: string, newAssignee: string) => void;
}

/**
 * 子任务 / 缺陷轻量查看抽屉（Linear Peek Drawer 风格）：
 * - 点击子任务/缺陷行就地滑出，底层父需求数据、展开状态与滚动条完全保持静止；
 * - 异步按需拉取描述，避免触发全链路流水线与 Git 探测开销；
 * - 抽屉内支持就地快速状态流转，联动同步父需求列表；
 * - 支持 Esc / 点击遮罩退出，精准停留在前序子任务行。
 */
export function ChildDetailDrawer({
  child,
  parentWorkitem,
  candidateAssignees,
  onClose,
  onOpenInWorkbench,
  onStatusChange,
  onAssigneeChange,
}: ChildDetailDrawerProps) {
  const open = child != null;
  const loadChildren = useApp((s) => s.loadChildren);
  const settings = useApp((s) => s.settings);
  const itemsInStore = useApp((s) => s.items);
  const currentUser = useApp((s) => s.currentUser);

  const [rawDetail, setRawDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const { copy: copyText, copied } = useClipboard({
    successMessage: (id) => `已复制编号 ${id}`,
  });

  const handleOpenInYunxiao = () => {
    if (!child) return;
    const wi = (rawDetail?.workitem ?? rawDetail ?? {}) as Record<string, unknown>;
    const spaceId = (wi.space && typeof wi.space === 'object' && typeof (wi.space as any).id === 'string' ? (wi.space as any).id : '')
      || (wi.space && typeof wi.space === 'object' && typeof (wi.space as any).identifier === 'string' ? (wi.space as any).identifier : '')
      || (typeof wi.spaceId === 'string' && wi.spaceId)
      || (typeof wi.projectId === 'string' && wi.projectId)
      || settings?.defaultSpaceIdentifier
      || '';

    void openWorkitemInYunxiao({
      workitemId: child.workitemId,
      spaceIdentifier: spaceId,
      category: child.category,
      organizationId: settings?.organizationId,
    });
  };

  // 状态流转状态
  const [statusName, setStatusName] = useState<string>(child?.status ?? '');
  const [statusId, setStatusId] = useState<string>(child?.statusId ?? '');
  const [statusOpen, setStatusOpen] = useState(false);

  // 负责人切换状态
  const [assignedToName, setAssignedToName] = useState<string>(child?.assignedTo ?? '');

  const {
    statuses,
    loadingStatuses,
    updatingStatus,
    fetchStatuses,
    changeStatus,
  } = useWorkitemWorkflowStatuses({
    workitemId: child?.workitemId,
    currentStatusId: statusId,
    currentStatusName: statusName,
    onSuccess: async (st) => {
      setStatusName(st.name);
      setStatusId(st.id);
      if (parentWorkitem?.workitemId) {
        await loadChildren(parentWorkitem.workitemId);
      }
      if (child) {
        onStatusChange?.(child.workitemId, st.name);
      }
    },
  });

  // 随 child 变化同步与请求
  useEffect(() => {
    if (!child) {
      setRawDetail(null);
      setStatusName('');
      setStatusId('');
      setAssignedToName('');
      return;
    }

    setStatusName(child.status || '');
    setStatusId(child.statusId || '');
    setAssignedToName(child.assignedTo || '');

    let alive = true;
    setLoading(true);

    void api.getWorkitem(child.workitemId)
      .then((res) => {
        if (!alive) return;
        const root = (res as Record<string, unknown>)?.workitem ?? res;
        const wi = (root && typeof root === 'object' ? root : {}) as Record<string, unknown>;
        setRawDetail(wi);
        if (typeof wi.status === 'string' && wi.status) setStatusName(wi.status);
        if (typeof wi.statusId === 'string' && wi.statusId) setStatusId(wi.statusId);
        const remoteAssignee = (typeof wi.assignedTo === 'string' && wi.assignedTo)
          || (wi.assignedTo && typeof wi.assignedTo === 'object' && typeof (wi.assignedTo as any).name === 'string' ? (wi.assignedTo as any).name : '');
        if (remoteAssignee) setAssignedToName(remoteAssignee);
      })
      .catch((e) => {
        errorLog('child-drawer-detail', e);
        if (alive) setRawDetail(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [child?.workitemId]);

  // 抽屉按工作项 ID 订阅父列表的最新行，避免父需求刷新后继续显示旧状态 / 负责人。
  useEffect(() => {
    if (!child) return;
    setStatusName(child.status || '');
    setStatusId(child.statusId || '');
    setAssignedToName(child.assignedTo || '');
  }, [child?.workitemId, child?.status, child?.statusId, child?.assignedTo]);

  // 候选处理人汇总
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role?: string }>();
    if (candidateAssignees) {
      for (const c of candidateAssignees) {
        if (c.name && !map.has(c.name)) map.set(c.name, c);
      }
    }
    if (currentUser?.id && currentUser?.name && !map.has(currentUser.name)) {
      map.set(currentUser.name, { id: currentUser.id, name: currentUser.name, role: '我' });
    }
    for (const it of itemsInStore) {
      if (it.assignedTo && it.assignedTo !== '—' && !map.has(it.assignedTo)) {
        map.set(it.assignedTo, { id: it.assignedToId || it.assignedTo, name: it.assignedTo, role: '成员' });
      }
    }
    return Array.from(map.values());
  }, [candidateAssignees, currentUser, itemsInStore]);

  const wi = rawDetail ?? {};
  const isBug = child?.category === 'Bug';
  const categoryLabel = child?.category && child.category in CATEGORY_LABELS
    ? CATEGORY_LABELS[child.category as Category]
    : isBug ? '缺陷' : '子任务';

  const gmtModified = (typeof wi.gmtModified === 'string' && wi.gmtModified)
    || (typeof wi.updatedAt === 'string' && wi.updatedAt)
    || child?.gmtModified
    || '';

  // 复制编号
  const copyIdentifier = () => {
    if (child?.identifier) void copyText(child.identifier);
  };

  // 就地执行流转状态
  const handleSelectStatus = async (status: { id: string; name: string }) => {
    await changeStatus(status);
  };

  const statusDropdown = (
    <DropdownMenu
      open={statusOpen}
      onOpenChange={(v) => {
        setStatusOpen(v);
        if (v) void fetchStatuses();
      }}
    >
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              'group/status inline-flex items-center gap-1.5 rounded border border-border/60 bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer',
              updatingStatus && 'pointer-events-none opacity-60',
            )}
            title="点击快速更改状态"
          />
        }
      >
        {updatingStatus ? (
          <Spinner className="size-3.5" />
        ) : (
          <StatusIcon status={statusName} className="size-3.5 shrink-0" />
        )}
        <span className="text-foreground">{statusName || '未指定'}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36 z-50">
        {loadingStatuses && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            <span>读取状态流程…</span>
          </div>
        )}
        {!loadingStatuses && statuses.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无可流转状态</div>
        )}
        {!loadingStatuses && statuses.map((s) => {
          const isCurrent = s.id === statusId || s.name === statusName;
          return (
            <DropdownMenuItem
              key={s.id}
              className={cn('flex cursor-pointer items-center justify-between text-xs', isCurrent && 'font-medium text-primary')}
              onClick={() => void handleSelectStatus(s)}
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

  const assigneeDropdown = (
    <SearchableAssigneePopover
      assignedToName={assignedToName}
      candidateAssignees={assigneeOptions}
      workitemId={child?.workitemId}
      onSelect={async (candidate) => {
        setAssignedToName(candidate.name);
        if (child) {
          onAssigneeChange?.(child.workitemId, candidate.name);
        }
        if (parentWorkitem?.workitemId) {
          void loadChildren(parentWorkitem.workitemId);
        }
      }}
      variant="button"
      checkWriteOps
      align="start"
    />
  );

  const attributeItems: DescriptionsItem[] = [
    {
      key: 'status',
      label: (
        <span className="flex items-center gap-1.5">
          <StatusIcon status={statusName} className="size-3.5" />
          <span>状态</span>
        </span>
      ),
      children: statusDropdown,
    },
    {
      key: 'assignee',
      label: (
        <span className="flex items-center gap-1.5">
          <UserIcon className="size-3.5" />
          <span>处理人</span>
        </span>
      ),
      children: assigneeDropdown,
    },
    {
      key: 'category',
      label: (
        <span className="flex items-center gap-1.5">
          <LayersIcon className="size-3.5" />
          <span>类型</span>
        </span>
      ),
      children: (
        <div className="flex items-center gap-1.5">
          {isBug && <BugIcon className="size-3.5 text-destructive" />}
          <span>{categoryLabel}</span>
        </div>
      ),
    },
    ...(parentWorkitem ? [{
      key: 'parent',
      label: (
        <span className="flex items-center gap-1.5">
          <FolderIcon className="size-3.5" />
          <span>所属父需求</span>
        </span>
      ),
      children: (
        <OverflowTooltip
          text={parentWorkitem.subject}
          tooltip={`${parentWorkitem.identifier} · ${parentWorkitem.subject}`}
          className="truncate font-mono text-xs text-muted-foreground"
        >
          {parentWorkitem.identifier} {parentWorkitem.subject ? `· ${parentWorkitem.subject}` : ''}
        </OverflowTooltip>
      ),
    }] : []),
    {
      key: 'updatedAt',
      label: (
        <span className="flex items-center gap-1.5">
          <ClockIcon className="size-3.5" />
          <span>更新时间</span>
        </span>
      ),
      children: gmtModified
        ? String(gmtModified).slice(0, 16).replace('T', ' ')
        : <span className="text-muted-foreground">—</span>,
      contentClassName: 'font-mono text-xs',
    },
  ];

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} swipeDirection="right">
      <DrawerContent className="w-full sm:w-[500px] lg:w-[560px] [--drawer-content-width:min(560px,100vw)]">
        {/* 顶部页头与快捷工具栏 */}
        <DrawerHeader className="border-b border-border/70 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'gap-1 px-1.5 py-0.5 text-[11px] font-normal shrink-0',
                  isBug
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : 'border-primary/30 bg-primary/10 text-primary',
                )}
              >
                {isBug ? <BugIcon className="size-3" /> : <LayersIcon className="size-3" />}
                <span>{categoryLabel}</span>
              </Badge>

              {child?.identifier && (
                <button
                  type="button"
                  onClick={copyIdentifier}
                  className="group inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
                  title="点击复制编号"
                >
                  <span>{child.identifier}</span>
                  {copied ? (
                    <CheckIcon className="size-3 text-sig-ok" />
                  ) : (
                    <CopyIcon className="size-3 text-muted-foreground group-hover:text-foreground" />
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={handleOpenInYunxiao}
                      aria-label="在云效中打开"
                    />
                  }
                >
                  <ExternalLinkIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>在云效中打开</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => {
                        if (child) onOpenInWorkbench(child);
                      }}
                      aria-label="在工作台全屏打开"
                    />
                  }
                >
                  <Maximize2Icon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>在独立工作台全屏打开</TooltipContent>
              </Tooltip>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onClose}
                aria-label="关闭抽屉 (Esc)"
                title="关闭抽屉 (Esc)"
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          </div>

          <DrawerTitle className="mt-2.5 min-w-0 text-base sm:text-lg font-semibold tracking-tight text-foreground">
            <OverflowTooltip
              as="span"
              lineClamp={2}
              text={child?.subject || child?.identifier || '工作项详情'}
              className="block max-w-full"
            />
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {child?.identifier} {categoryLabel} 详情与描述
          </DrawerDescription>
        </DrawerHeader>

        {/* 抽屉滚动内容主体 */}
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          {/* 属性列表：对齐 Linear 裸行规范 */}
          <section className="flex flex-col gap-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              属性
            </p>
            <div className="rounded-lg border border-border/50 bg-muted/15 p-2">
              <Descriptions variant="plain" items={attributeItems} />
            </div>
          </section>

          {/* 描述正文 */}
          <section className="flex flex-col gap-2.5">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              描述
            </p>
            {loading ? (
              <div className="flex flex-col gap-2 p-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 bg-muted/10 p-3.5 text-sm leading-relaxed text-foreground/90">
                <RichDescription
                  raw={wi.description ?? wi.content}
                  workitemId={child?.workitemId}
                  onSaved={(newHtml) => {
                    setRawDetail((prev) => (prev ? { ...prev, description: newHtml, content: newHtml } : prev));
                  }}
                />
              </div>
            )}
          </section>
        </div>

        {/* 底部操作条 */}
        <div className="flex items-center justify-between border-t border-border/70 px-5 py-3 bg-muted/20">
          <span className="text-xs text-muted-foreground font-mono">
            Esc 或点击外部关闭
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              关闭
            </Button>
            {child && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenInWorkbench(child)}
                className="gap-1.5"
              >
                <ArrowUpRightIcon className="size-3.5" />
                <span>在工作台打开</span>
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
