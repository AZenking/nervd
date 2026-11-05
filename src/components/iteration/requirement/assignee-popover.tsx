import { useMemo, useState } from 'react';
import { UserIcon } from 'lucide-react';
import { ListBox } from '@heroui/react';
import { Avatar, AvatarFallback, getAvatarColorClass } from '@/components/ui/avatar';
import { Chip } from '@/components/ui/chip';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { OverflowTooltip } from '@/components/overflow-tooltip';

export interface AssigneeOption {
  id: string;
  name: string;
  role?: string;
}

export interface SearchableAssigneePopoverProps {
  /** 当前选中的处理人显示姓名 */
  assignedToName?: string;
  /** 可供选择的候选处理人列表 */
  candidateAssignees?: AssigneeOption[];
  /** 若提供 workitemId，选中时自动触发全局乐观更新 */
  workitemId?: string | null;
  /** 选中后的自定义回调 */
  onSelect?: (candidate: AssigneeOption) => void | Promise<void>;
  /** 触发器视觉形态：'row' 列表紧凑行 | 'cell' 属性栏表单格 | 'badge' 顶部徽标 | 'button' 独立微按钮 */
  variant?: 'row' | 'cell' | 'badge' | 'button';
  /** 是否在选择时校验只读门控（默认 true）；开启后只读模式下弹层不可展开 */
  checkWriteOps?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 未选择时的占位文案 */
  placeholder?: string;
  /** 弹出对齐方向 */
  align?: 'start' | 'end';
  /** 附加到触发器的 className */
  className?: string;
}

const EMPTY_STATE_KEY = '__assignee-empty';

/**
 * 候选处理人选择下拉（HeroUI Select 规范实现）：
 * 与属性栏 DetailAssigneePopover、快速创建行指定人选择器同一套交互与视觉，
 * 键盘方向键 / Enter / Esc / 首字母 typeahead 由 Select 原生提供。
 */
export function SearchableAssigneePopover({
  assignedToName = '',
  candidateAssignees = [],
  workitemId,
  onSelect,
  variant = 'cell',
  checkWriteOps = true,
  disabled = false,
  placeholder = '未分配',
  align = 'start',
  className,
}: SearchableAssigneePopoverProps) {
  const openSettings = useUi((s) => s.openSettings);
  const { settings, updateWorkitemAssigneeOptimistic } = useApp();
  const allowWriteOps = settings?.allowWriteOps ?? false;

  const [isOpen, setIsOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  // 当前负责人可能不在候选列表（仅姓名已知）：补入选项以保证回显与可选
  const candidates = useMemo(() => {
    const list = [...candidateAssignees];
    if (assignedToName && !list.some((c) => c.name === assignedToName || c.id === assignedToName)) {
      list.unshift({ id: assignedToName, name: assignedToName });
    }
    return list;
  }, [candidateAssignees, assignedToName]);

  const selectedId = useMemo(
    () => candidates.find((c) => c.name === assignedToName || c.id === assignedToName)?.id ?? null,
    [candidates, assignedToName],
  );

  // 只读门控：受控 isOpen 直接拦截展开（比展开后回弹更符合 WriteOpGatedTrigger 心智）
  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled || updating) return;
    if (nextOpen && checkWriteOps && !allowWriteOps) {
      toast.add({
        title: '当前处于只读模式',
        description: '更改负责人需在「设置 → 安全」中开启写操作。',
        type: 'warning',
        actionProps: {
          children: '前往设置',
          onClick: () => openSettings('security'),
        },
      });
      return;
    }
    setIsOpen(nextOpen);
  };

  const handleSelectionChange = (key: unknown) => {
    if (key === null || key === undefined) return;
    const candidate = candidates.find((c) => c.id === String(key));
    if (!candidate) return;
    if (checkWriteOps && !allowWriteOps) {
      // 关闭态 typeahead 等路径仍可能触发选择，此处兜底拦截；受控 value 不变自动回弹
      toast.add({
        title: '当前处于只读模式',
        description: '更改负责人需在「设置 → 安全」中开启写操作。',
        type: 'warning',
        actionProps: {
          children: '前往设置',
          onClick: () => openSettings('security'),
        },
      });
      return;
    }
    void (async () => {
      if (onSelect) {
        await onSelect(candidate);
      }
      if (workitemId) {
        setUpdating(true);
        try {
          await updateWorkitemAssigneeOptimistic(workitemId, candidate.id, candidate.name);
        } finally {
          setUpdating(false);
        }
      }
    })();
  };

  const updatingCls = cn(updating && 'pointer-events-none opacity-60', disabled && 'pointer-events-none opacity-50');

  // 触发器视觉分发（Select.Trigger 本身是 button，严禁再嵌套 Button）
  const renderTriggerContent = () => {
    const face =
      updating ? (
        <Spinner className="size-3.5 shrink-0" />
      ) : assignedToName ? (
        <Avatar className={cn('size-4 shrink-0 border', getAvatarColorClass(assignedToName))}>
          <AvatarFallback className="text-[9px] bg-transparent font-medium">{assignedToName.charAt(0)}</AvatarFallback>
        </Avatar>
      ) : (
        <UserIcon className="size-3.5 text-muted-foreground/60 shrink-0" />
      );
    const label = (
      <OverflowTooltip text={assignedToName || placeholder} className="min-w-0 truncate" />
    );

    if (variant === 'row') {
      return (
        <span
          title="点击更改负责人"
          className={cn(
            'group/assignee flex h-6 items-center gap-1.5 rounded-sm px-1.5 text-xs text-muted-foreground hover:text-foreground',
            updatingCls,
          )}
        >
          {face}
          <OverflowTooltip
            text={assignedToName || placeholder}
            className="hidden max-w-20 truncate sm:inline"
          />
        </span>
      );
    }

    if (variant === 'button') {
      return (
        <span
          title="点击更改负责人"
          className={cn(
            'flex h-7 max-w-44 items-center gap-1.5 truncate rounded-md border border-border/70 bg-background px-2 text-xs font-medium text-foreground hover:bg-muted',
            updatingCls,
          )}
        >
          <UserIcon className="size-3 shrink-0 text-muted-foreground" />
          {label}
          <Select.Indicator className="static size-3 shrink-0 text-muted-foreground opacity-60" />
        </span>
      );
    }

    if (variant === 'badge') {
      return (
        <Chip
          size="sm"
          color="default"
          variant="soft"
          title="点击更改负责人"
          className={cn(
            'group/assignee max-w-32 cursor-pointer gap-1.5 rounded-md text-foreground transition-colors select-none hover:bg-muted/60',
            updatingCls,
          )}
        >
          {updating ? (
            <Spinner className="size-3.5 shrink-0" />
          ) : assignedToName ? (
            <Avatar className={cn('size-3.5 shrink-0 border', getAvatarColorClass(assignedToName))}>
              <AvatarFallback className="text-[9px] bg-transparent font-medium">{assignedToName.charAt(0)}</AvatarFallback>
            </Avatar>
          ) : (
            <UserIcon className="size-3.5 text-muted-foreground/60 shrink-0" />
          )}
          <Chip.Label>
            <OverflowTooltip text={assignedToName || placeholder} className="max-w-28 truncate" />
          </Chip.Label>
          <Select.Indicator className="static size-3 ml-0.5 shrink-0 text-muted-foreground/60" />
        </Chip>
      );
    }

    // 'cell'：属性栏表单格
    return (
      <span
        title="点击更改负责人"
        className={cn(
          'group/assignee flex h-6 items-center gap-1.5 rounded-sm px-1.5 text-xs font-medium text-foreground',
          updatingCls,
        )}
      >
        {face}
        {label}
        <Select.Indicator className="static size-3 ml-0.5 shrink-0 text-muted-foreground/60" />
      </span>
    );
  };

  return (
    <Select
      aria-label="更改负责人"
      variant="secondary"
      value={selectedId}
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      onValueChange={handleSelectionChange}
      isDisabled={disabled}
      className={cn('min-w-0 max-w-44', className)}
    >
      <Select.Trigger
        showIndicator={false}
        className={cn(
          'min-h-0 border-0 bg-transparent p-0 shadow-none',
          variant === 'row' && 'h-6 px-0',
          className,
        )}
      >
        {renderTriggerContent()}
      </Select.Trigger>
      {/* Select 必须始终保留 ListBox 集合，否则空候选时触发器只能聚焦、无法展开。 */}
      {candidates.length === 0 ? (
        <Select.Popover className="min-w-40" placement={align === 'end' ? 'bottom end' : 'bottom start'}>
          <ListBox selectionMode="none">
            <ListBox.Item
              id={EMPTY_STATE_KEY}
              textValue="暂无候选成员"
              isDisabled
              className="text-xs text-muted-foreground"
            >
              暂无候选成员
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      ) : (
        <Select.Popover className="min-w-44" placement={align === 'end' ? 'bottom end' : 'bottom start'}>
          <ListBox>
            {candidates.map((c) => (
              <ListBox.Item key={c.id} id={c.id} textValue={c.name} className="text-xs">
                <Avatar className={cn('size-4 shrink-0 border', getAvatarColorClass(c.name))}>
                  <AvatarFallback className="text-[9px] bg-transparent font-medium">
                    {c.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate">{c.name}</span>
                  {c.role && (
                    <span className="shrink-0 text-[10px] text-muted-foreground/80">({c.role})</span>
                  )}
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      )}
    </Select>
  );
}
