import {
  CalendarIcon, ClockIcon, DatabaseIcon, FolderIcon, GitBranchIcon, LayersIcon, UserIcon, CheckIcon,
} from 'lucide-react';
import { CATEGORY_LABELS, type Category } from '@/types';
import { Descriptions } from '@/components/ui/descriptions';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { StatusIcon } from '@/components/status-icon';
import { SearchableAssigneePopover } from './assignee-popover';
import { STATUS_OPTIONS } from './types';

/** 原地快速流转详情状态 Popover */
export function DetailStatusPopover({
  status,
  workitemId,
  variant = 'badge',
}: {
  status: string;
  workitemId?: string;
  variant?: 'badge' | 'cell';
}) {
  const updateWorkitemStatusOptimistic = useApp((s) => s.updateWorkitemStatusOptimistic);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer rounded-sm hover:bg-muted/80 text-foreground',
          variant === 'badge' ? 'border border-border/70 bg-background px-2 py-0.5 text-xs font-medium' : 'px-1.5 py-0.5 text-xs font-medium',
        )}
        title="点击原地流转状态"
      >
        <StatusIcon status={status} className="size-3.5" />
        <span>{status || '未知状态'}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36 p-1 z-50 bg-popover/95 backdrop-blur-md border border-border shadow-level-2">
        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          流转状态
        </div>
        {STATUS_OPTIONS.map((st) => (
          <DropdownMenuItem
            key={st.name}
            onClick={() => {
              if (workitemId) {
                void updateWorkitemStatusOptimistic(workitemId, st.name);
              }
            }}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm cursor-pointer',
              status === st.name && 'bg-accent font-medium text-accent-foreground',
            )}
          >
            <StatusIcon status={st.name} className="size-3.5" />
            <span className="flex-1">{st.label}</span>
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
}: {
  assignedToName: string;
  workitemId?: string | null;
  candidateAssignees?: { id: string; name: string; role?: string }[];
  variant?: 'badge' | 'cell';
}) {
  return (
    <SearchableAssigneePopover
      assignedToName={assignedToName}
      workitemId={workitemId}
      candidateAssignees={candidateAssignees}
      variant={variant}
      checkWriteOps
      align="start"
    />
  );
}

export interface RequirementPropertiesProps {
  statusName: string;
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
                  {parent.identifier} {parent.subject}
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
