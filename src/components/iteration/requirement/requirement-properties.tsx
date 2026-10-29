import {
  CalendarIcon, ClockIcon, DatabaseIcon, FolderIcon, GitBranchIcon, LayersIcon, UserIcon, CheckIcon, ChevronDownIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CATEGORY_LABELS, type Category } from '@/types';
import { Descriptions } from '@/components/ui/descriptions';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { useUi } from '@/store/ui';
import { StatusIcon } from '@/components/status-icon';
import { SearchableAssigneePopover } from './assignee-popover';
import { useWorkitemWorkflowStatuses } from '@/hooks/use-workitem-workflow-statuses';

/** 原地快速流转详情状态 Popover */
export function DetailStatusPopover({
  status,
  statusId,
  workitemId,
  variant = 'badge',
  className,
}: {
  status: string;
  statusId?: string;
  workitemId?: string;
  variant?: 'badge' | 'cell';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { statuses, loadingStatuses, fetchStatuses, changeStatus } = useWorkitemWorkflowStatuses({
    workitemId,
    currentStatusId: statusId,
    currentStatusName: status,
  });

  useEffect(() => {
    if (open) void fetchStatuses();
  }, [fetchStatuses, open]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer text-foreground select-none',
          variant === 'badge'
            ? 'h-7 rounded-md border border-border/60 bg-muted/20 hover:bg-muted/60 hover:border-border/80 px-2.5 text-xs font-medium'
            : 'rounded-sm hover:bg-muted/80 px-1.5 py-0.5 text-xs font-medium',
          className,
        )}
        title="点击原地流转状态"
      >
        <StatusIcon status={status} className="size-3.5 shrink-0" />
        <span>{status || '未知状态'}</span>
        {variant === 'badge' && <ChevronDownIcon className="size-3 text-muted-foreground/60 shrink-0 ml-0.5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36 p-1 z-50 bg-popover/95 backdrop-blur-md border border-border shadow-level-2">
        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          流转状态
        </div>
        {loadingStatuses && <div className="px-2 py-1.5 text-xs text-muted-foreground">读取状态流程…</div>}
        {!loadingStatuses && statuses.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无可流转状态</div>}
        {!loadingStatuses && statuses.map((st) => (
          <DropdownMenuItem
            key={st.id}
            onClick={() => void changeStatus(st)}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm cursor-pointer',
              status === st.name && 'bg-accent font-medium text-accent-foreground',
            )}
          >
            <StatusIcon status={st.name} className="size-3.5" />
            <span className="flex-1">{st.name}</span>
            {status === st.name && <CheckIcon className="size-3 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 原地快速流转详情负责人 Popover（支持搜索与键盘快捷导航） */
export function DetailAssigneePopover({
  assignedToName,
  workitemId,
  candidateAssignees,
  variant = 'cell',
  className,
}: {
  assignedToName: string;
  workitemId?: string | null;
  candidateAssignees?: { id: string; name: string; role?: string }[];
  variant?: 'badge' | 'cell';
  className?: string;
}) {
  return (
    <SearchableAssigneePopover
      assignedToName={assignedToName}
      workitemId={workitemId}
      candidateAssignees={candidateAssignees}
      variant={variant}
      checkWriteOps
      align="start"
      className={className}
    />
  );
}

export interface RequirementPropertiesProps {
  statusName: string;
  statusId?: string;
  selectedId: string | null;
  assignedToName: string;
  candidateAssignees?: { id: string; name: string; role?: string }[];
  category: string;
  parent?: { workitemId: string; identifier: string; subject?: string } | null;
  spaceName: string;
  iterationName: string;
  updatedAt: string;
  effectiveRepoCount: number;
  iterationBranchValue: string;
  embedded?: boolean;
  onSelectParent?: (parentId: string) => void;
  className?: string;
}

/** 右侧边栏：Linear 式属性栏（全屏/非 embedded 模式下展示） */
export function RequirementProperties({
  statusName,
  statusId,
  selectedId,
  assignedToName,
  candidateAssignees,
  category,
  parent,
  spaceName,
  iterationName,
  updatedAt,
  effectiveRepoCount,
  iterationBranchValue,
  embedded = false,
  onSelectParent,
  className,
}: RequirementPropertiesProps) {
  const openWorkitem = useUi((s) => s.openWorkitem);

  return (
    <aside className={cn('flex w-full flex-col gap-6 xl:sticky xl:top-20 xl:w-auto', className)}>
      <div className="flex flex-col">
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">属性</p>
        <Descriptions
          variant="plain"
          items={[
            {
              key: 'status',
              label: (
                <span className="flex items-center gap-1.5">
                  <StatusIcon status={statusName} className="size-3.5" />
                  <span>状态</span>
                </span>
              ),
              children: (
                <DetailStatusPopover
                  status={statusName}
                  statusId={statusId}
                  workitemId={selectedId ?? undefined}
                  variant="cell"
                />
              ),
            },
            {
              key: 'assignee',
              label: (
                <span className="flex items-center gap-1.5">
                  <UserIcon className="size-3.5" />
                  <span>处理人</span>
                </span>
              ),
              children: (
                <DetailAssigneePopover
                  assignedToName={assignedToName}
                  workitemId={selectedId}
                  candidateAssignees={candidateAssignees}
                  variant="cell"
                />
              ),
            },
            {
              key: 'category',
              label: (
                <span className="flex items-center gap-1.5">
                  <LayersIcon className="size-3.5" />
                  <span>类型</span>
                </span>
              ),
              children: category in CATEGORY_LABELS ? CATEGORY_LABELS[category as Category] : category,
            },
            ...(parent ? [{
              key: 'parent',
              label: (
                <span className="flex items-center gap-1.5">
                  <FolderIcon className="size-3.5" />
                  <span>所属父需求</span>
                </span>
              ),
              children: (
                <button
                  type="button"
                  onClick={() => {
                    if (onSelectParent && embedded) onSelectParent(parent.workitemId);
                    else openWorkitem(parent.workitemId, parent);
                  }}
                  className="font-mono text-xs text-primary hover:underline cursor-pointer text-left truncate"
                >
                  <OverflowTooltip
                    text={`${parent.identifier} ${parent.subject}`}
                    className="min-w-0 truncate font-mono text-xs text-primary"
                  />
                </button>
              ),
            }] : []),
            {
              key: 'space',
              label: (
                <span className="flex items-center gap-1.5">
                  <FolderIcon className="size-3.5" />
                  <span>项目空间</span>
                </span>
              ),
              children: spaceName || <span className="text-muted-foreground">—</span>,
            },
            {
              key: 'iteration',
              label: (
                <span className="flex items-center gap-1.5">
                  <CalendarIcon className="size-3.5" />
                  <span>所属迭代</span>
                </span>
              ),
              children: iterationName || <span className="text-muted-foreground">未关联</span>,
            },
            {
              key: 'updatedAt',
              label: (
                <span className="flex items-center gap-1.5">
                  <ClockIcon className="size-3.5" />
                  <span>更新时间</span>
                </span>
              ),
              children: updatedAt
                ? String(updatedAt).slice(0, 16).replace('T', ' ')
                : <span className="text-muted-foreground">—</span>,
              contentClassName: 'font-mono text-xs',
            },
          ]}
        />
      </div>

      <div className="flex flex-col">
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">交付配置</p>
        <Descriptions
          variant="plain"
          items={[
            {
              key: 'linkedRepos',
              label: (
                <span className="flex items-center gap-1.5">
                  <DatabaseIcon className="size-3.5" />
                  <span>关联仓库</span>
                </span>
              ),
              children: `${effectiveRepoCount} 个`,
            },
            {
              key: 'branchRule',
              label: (
                <span className="flex items-center gap-1.5">
                  <GitBranchIcon className="size-3.5" />
                  <span>分支规则</span>
                </span>
              ),
              children: iterationBranchValue || <span className="text-muted-foreground">未选择模板</span>,
            },
          ]}
        />
      </div>
    </aside>
  );
}
