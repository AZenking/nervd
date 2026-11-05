import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, SearchIcon, UserIcon, XIcon } from 'lucide-react';
import { Popover } from '@heroui/react';
import { Avatar, AvatarFallback, getAvatarColorClass } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';
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
  /** 是否在点击触发器时校验只读门控（默认 true） */
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

/**
 * 带有实时搜索、全键盘导航的候选处理人选择下拉（Linear 体验对齐）
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

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时重置搜索词与高亮项，自动聚焦输入框
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlightedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // 实时搜索过滤（支持按姓名、角色、ID 不区分大小写匹配）
  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidateAssignees;
    return candidateAssignees.filter((c) => {
      const nameMatch = c.name?.toLowerCase().includes(q);
      const roleMatch = c.role?.toLowerCase().includes(q);
      const idMatch = c.id?.toLowerCase().includes(q);
      return Boolean(nameMatch || roleMatch || idMatch);
    });
  }, [candidateAssignees, query]);

  // 边界保护：高亮索引不超过过滤后长度
  useEffect(() => {
    if (highlightedIndex >= filteredCandidates.length) {
      setHighlightedIndex(Math.max(0, filteredCandidates.length - 1));
    }
  }, [filteredCandidates.length, highlightedIndex]);

  const handleSelect = async (candidate: AssigneeOption) => {
    setOpen(false);
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
  };

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
    setOpen(nextOpen);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 阻止向外层冒泡，避免触发 j/k 列表跳转或全局快捷键
    e.stopPropagation();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filteredCandidates.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredCandidates[highlightedIndex] || filteredCandidates[0];
      if (target) {
        void handleSelect(target);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  // 触发器样式分发
  const renderTriggerContent = () => {
    if (variant === 'row') {
      return (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={disabled}
          className={cn(
            'group/assignee h-6 gap-1.5 rounded-sm px-1.5 text-xs text-muted-foreground hover:text-foreground',
            updating && 'pointer-events-none opacity-60',
            disabled && 'pointer-events-none opacity-50',
            className,
          )}
          title="点击更改负责人"
          aria-label="点击更改负责人"
        >
          {updating ? (
            <Spinner className="size-3.5" />
          ) : assignedToName ? (
            <Avatar className={cn('size-4 shrink-0 border', getAvatarColorClass(assignedToName))}>
              <AvatarFallback className="text-[9px] bg-transparent font-medium">{assignedToName.charAt(0)}</AvatarFallback>
            </Avatar>
          ) : (
            <UserIcon className="size-3.5 text-muted-foreground/60" />
          )}
          <OverflowTooltip
            text={assignedToName || placeholder}
            className="hidden max-w-20 sm:inline truncate"
          />
        </Button>
      );
    }

    if (variant === 'button') {
      return (
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled}
          className={cn(
            'h-7 shrink-0 gap-1.5 rounded-md border border-border/70 bg-background px-2 text-xs font-medium text-foreground hover:bg-muted max-w-44',
            updating && 'pointer-events-none opacity-60',
            disabled && 'pointer-events-none opacity-50',
            className,
          )}
          title="选择处理人"
          aria-label="选择处理人"
        >
          {updating ? (
            <Spinner className="size-3" />
          ) : (
            <UserIcon className="size-3 text-muted-foreground shrink-0" />
          )}
          <OverflowTooltip text={assignedToName || placeholder} className="truncate" />
          <ChevronDownIcon className="size-3 text-muted-foreground opacity-60 shrink-0" />
        </Button>
      );
    }

    // 'cell' 或 'badge'
    const isBadge = variant === 'badge';
    if (isBadge) {
      return (
        <Chip
          size="sm"
          color="default"
          variant="soft"
          className={cn(
            'group/assignee gap-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer text-foreground select-none hover:bg-muted/60',
            updating && 'pointer-events-none opacity-60',
            disabled && 'pointer-events-none opacity-50',
            className,
          )}
          title="点击更改负责人"
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
            <OverflowTooltip
              text={assignedToName || placeholder}
              className="max-w-28 truncate"
            />
          </Chip.Label>
          <ChevronDownIcon className="size-3 text-muted-foreground/60 shrink-0 ml-0.5 transition-transform group-hover/assignee:opacity-100" />
        </Chip>
      );
    }

    return (
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={disabled}
        className={cn(
          'group/assignee h-6 gap-1.5 rounded-sm px-1.5 text-xs font-medium text-foreground',
          updating && 'pointer-events-none opacity-60',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
        title="点击更改负责人"
        aria-label="点击更改负责人"
      >
        {updating ? (
          <Spinner className="size-3.5 shrink-0" />
        ) : assignedToName ? (
          <Avatar className={cn('size-4 shrink-0 border', getAvatarColorClass(assignedToName))}>
            <AvatarFallback className="text-[9px] bg-transparent font-medium">{assignedToName.charAt(0)}</AvatarFallback>
          </Avatar>
        ) : (
          <UserIcon className="size-3.5 text-muted-foreground/60 shrink-0" />
        )}
        <OverflowTooltip
          text={assignedToName || placeholder}
          className="max-w-24 truncate"
        />
        <ChevronDownIcon className="size-3 text-muted-foreground/60 shrink-0 ml-0.5 transition-transform group-hover/assignee:opacity-100" />
      </Button>
    );
  };

  return (
    <Popover isOpen={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger>
        {renderTriggerContent()}
      </Popover.Trigger>
      <Popover.Content
        placement={align === 'end' ? 'bottom end' : 'bottom start'}
        className="w-56 p-1.5 z-50 shadow-level-2 bg-popover border border-border rounded-lg"
      >
        <Popover.Dialog className="outline-none">
          {/* 搜索框 */}
          <div className="relative mb-1 flex items-center">
            <SearchIcon className="absolute left-2 size-3 text-muted-foreground pointer-events-none z-10" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="搜索成员或角色…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="h-7 w-full pl-7 pr-6 text-xs bg-muted/40"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-1 size-5 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                title="清空搜索"
                aria-label="清空搜索"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>

          {/* 候选列表 */}
          <ScrollArea size={24} className="max-h-56 flex flex-col gap-0.5">
            {filteredCandidates.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">
                未找到匹配成员{query ? `「${query}」` : ''}
              </div>
            ) : (
              filteredCandidates.map((c, index) => {
                const isSelected = c.name === assignedToName || c.id === assignedToName;
                const isHighlighted = index === highlightedIndex;
                return (
                  <button
                    key={c.id || c.name}
                    type="button"
                    onClick={() => void handleSelect(c)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded-sm cursor-pointer transition-colors text-left w-full',
                      isHighlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60 text-foreground',
                      isSelected && 'font-medium text-primary',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className={cn('size-4 shrink-0 border', getAvatarColorClass(c.name))}>
                        <AvatarFallback className="text-[9px] bg-transparent font-medium">{c.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <OverflowTooltip text={c.name} className="min-w-0 truncate" />
                      {c.role && (
                        <span className="text-[10px] text-muted-foreground/80 shrink-0">({c.role})</span>
                      )}
                    </div>
                    {isSelected && <CheckIcon className="size-3 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </ScrollArea>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
