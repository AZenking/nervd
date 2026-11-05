import {
  CalendarIcon, ClockIcon, DatabaseIcon, FolderIcon, GitBranchIcon, LayersIcon, UserIcon,
} from 'lucide-react';
import { ListBox } from '@heroui/react';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, type Category } from '@/types';
import { Descriptions } from '@/components/ui/descriptions';
import { cn } from '@/lib/utils';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';
import { StatusIcon } from '@/components/status-icon';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { Avatar, AvatarFallback, getAvatarColorClass } from '@/components/ui/avatar';
import { useWorkitemWorkflowStatuses } from '@/hooks/use-workitem-workflow-statuses';

/** 原地快速流转详情状态（Select 下拉，打开时拉取状态流程） */
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
  const { statuses, loadingStatuses, fetchStatuses, changeStatus } = useWorkitemWorkflowStatuses({
    workitemId,
    currentStatusId: statusId,
    currentStatusName: status,
  });

  // Select 负责交互与无障碍，Chip 负责 HeroUI 语义化的视觉层。
  const triggerCls = cn(
    'min-h-0 border-0 bg-transparent p-0 shadow-none',
    className,
  );
  const chipCls = cn(
    'h-8 max-w-44 gap-1.5 px-2 text-sm',
    variant === 'cell' && 'h-7 text-xs',
  );

  return (
    <Select
      aria-label="流转状态"
      variant="secondary"
      value={statusId ?? null}
      onOpenChange={(open) => {
        if (open) void fetchStatuses();
      }}
      onValueChange={(key) => {
        const st = statuses.find((s) => s.id === key);
        if (st) void changeStatus(st);
      }}
      className={cn('min-w-0 max-w-44', className)}
    >
      <Select.Trigger className={triggerCls} showIndicator={false}>
        <Chip variant="soft" size={variant === 'cell' ? 'sm' : 'md'} className={chipCls}>
          <StatusIcon status={status} className="size-4 shrink-0" />
          <Chip.Label className="truncate">{status || '未知状态'}</Chip.Label>
          <Select.Indicator className="static size-3.5 shrink-0 text-muted-foreground" />
        </Chip>
      </Select.Trigger>
      {/* Select 必须始终保留 ListBox 集合，否则空态下触发器只能聚焦、无法展开。 */}
      {loadingStatuses || statuses.length === 0 ? (
        <Select.Popover className="min-w-36">
          <ListBox selectionMode="none">
            <ListBox.Item
              id="__status-empty"
              textValue={loadingStatuses ? '读取状态流程…' : '暂无可流转状态'}
              isDisabled
              className="text-xs text-muted-foreground"
            >
              {loadingStatuses ? '读取状态流程…' : '暂无可流转状态'}
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      ) : (
        <Select.Popover className="min-w-36">
          <ListBox>
            {statuses.map((st) => (
              <ListBox.Item key={st.id} id={st.id} textValue={st.name} className="text-xs">
                <span className="flex items-center gap-2">
                  <StatusIcon status={st.name} className="size-3.5 shrink-0" />
                  <span>{st.name}</span>
                </span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      )}
    </Select>
  );
}

/** 原地快速流转详情负责人（Select 下拉；只读门控 + 乐观更新） */
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
  const openSettings = useUi((s) => s.openSettings);
  const { settings, updateWorkitemAssigneeOptimistic } = useApp();
  const readOnly = !(settings?.allowWriteOps ?? false);
  const [updating, setUpdating] = useState(false);

  // 当前负责人可能不在候选列表（仅姓名已知）：补入选项以保证回显与可选
  const candidates = useMemo(() => {
    const list = [...(candidateAssignees ?? [])];
    if (assignedToName && !list.some((c) => c.name === assignedToName || c.id === assignedToName)) {
      list.unshift({ id: assignedToName, name: assignedToName });
    }
    return list;
  }, [candidateAssignees, assignedToName]);

  const selectedId = useMemo(
    () => candidates.find((c) => c.name === assignedToName || c.id === assignedToName)?.id ?? null,
    [candidates, assignedToName],
  );

  const handleValueChange = (key: string) => {
    if (readOnly) {
      toast.add({
        title: '当前处于只读模式',
        description: '更改负责人需在「设置 → 安全」中开启写操作。',
        type: 'warning',
        actionProps: {
          children: '前往设置',
          onClick: () => openSettings('security'),
        },
      });
      return; // 受控 selectedKey 不变，选择自动回弹
    }
    const candidate = candidates.find((c) => c.id === key);
    if (!candidate || !workitemId) return;
    setUpdating(true);
    void updateWorkitemAssigneeOptimistic(workitemId, candidate.id, candidate.name)
      .finally(() => setUpdating(false));
  };

  const triggerCls = cn(
    'min-h-0 border-0 bg-transparent p-0 shadow-none',
    className,
  );
  const chipCls = cn(
    'h-8 max-w-44 gap-1.5 px-2 text-sm',
    variant === 'cell' && 'h-7 text-xs',
  );

  return (
    <Select
      aria-label="更改负责人"
      variant="secondary"
      value={selectedId}
      onValueChange={handleValueChange}
      className={cn('min-w-0 max-w-44', className)}
    >
      <Select.Trigger className={triggerCls} showIndicator={false}>
        <Chip variant="soft" size={variant === 'cell' ? 'sm' : 'md'} className={chipCls}>
          {updating ? (
            <Spinner className="size-4 shrink-0" />
          ) : assignedToName ? (
            <Avatar className={cn('size-4 shrink-0 border', getAvatarColorClass(assignedToName))}>
              <AvatarFallback className="text-[9px] bg-transparent font-medium">
                {assignedToName.charAt(0)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <UserIcon className="size-4 text-muted-foreground/60 shrink-0" />
          )}
          <Chip.Label className="truncate">{assignedToName || '未分配'}</Chip.Label>
          <Select.Indicator className="static size-3.5 shrink-0 text-muted-foreground" />
        </Chip>
      </Select.Trigger>
      {/* Select 必须始终保留 ListBox 集合，否则空候选时触发器无法展开。 */}
      {candidates.length === 0 ? (
        <Select.Popover className="min-w-40">
          <ListBox selectionMode="none">
            <ListBox.Item
              id="__assignee-empty"
              textValue="暂无候选成员"
              isDisabled
              className="text-xs text-muted-foreground"
            >
              暂无候选成员
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      ) : (
        <Select.Popover className="min-w-44">
          <ListBox>
            {candidates.map((c) => (
              <ListBox.Item key={c.id} id={c.id} textValue={c.name} className="text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar className={cn('size-4 shrink-0 border', getAvatarColorClass(c.name))}>
                    <AvatarFallback className="text-[9px] bg-transparent font-medium">
                      {c.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{c.name}</span>
                  {c.role && (
                    <span className="shrink-0 text-[10px] text-muted-foreground/80">({c.role})</span>
                  )}
                </span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      )}
    </Select>
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
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={() => {
                    if (onSelectParent && embedded) onSelectParent(parent.workitemId);
                    else openWorkitem(parent.workitemId, parent);
                  }}
                  className="font-mono text-xs text-primary hover:underline cursor-pointer text-left truncate justify-start"
                >
                  <OverflowTooltip
                    text={`${parent.identifier} ${parent.subject}`}
                    className="min-w-0 truncate font-mono text-xs text-primary"
                  />
                </Button>
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
