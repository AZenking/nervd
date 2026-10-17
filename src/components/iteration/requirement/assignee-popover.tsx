import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, SearchIcon, UserIcon, XIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';

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

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || updating) return;
    if (checkWriteOps && !allowWriteOps) {
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
    setOpen((prev) => !prev);
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
        <button
          type="button"
          onClick={handleTriggerClick}
          className={cn(
            'group/assignee inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer',
            updating && 'pointer-events-none opacity-60',
            disabled && 'pointer-events-none opacity-50',
            className,
          )}
          title="点击更改负责人"
        >
          {updating ? (
            <Spinner className="size-3.5" />
          ) : assignedToName ? (
            <Avatar className="size-4 shrink-0">
              <AvatarFallback className="text-[9px]">{assignedToName.charAt(0)}</AvatarFallback>
            </Avatar>
          ) : (
            <UserIcon className="size-3.5 text-muted-foreground/60" />
          )}
          <span className="hidden sm:inline truncate max-w-20">{assignedToName || placeholder}</span>
        </button>
      );
    }

    if (variant === 'button') {
      return (
        <button
          type="button"
          onClick={handleTriggerClick}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-border/60 bg-background px-2 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none max-w-44 cursor-pointer transition-colors',
            updating && 'pointer-events-none opacity-60',
            disabled && 'pointer-events-none opacity-50',
            className,
          )}
          title="选择处理人"
        >
          {updating ? (
            <Spinner className="size-3" />
          ) : (
            <UserIcon className="size-3 text-muted-foreground shrink-0" />
          )}
          <span className="truncate">{assignedToName || placeholder}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground opacity-60 shrink-0" />
        </button>
      );
    }

    // 'cell' 或 'badge'
    const isBadge = variant === 'badge';
    return (
      <button
        type="button"
        onClick={handleTriggerClick}
        className={cn(
          'group/assignee inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer rounded-sm hover:bg-muted/80 text-foreground',
          isBadge ? 'border border-border/70 bg-background px-2 py-0.5 text-xs font-medium' : 'px-1.5 py-0.5 text-xs font-medium',
          updating && 'pointer-events-none opacity-60',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
        title="点击更改负责人"
      >
        {updating ? (
          <Spinner className="size-3.5" />
        ) : assignedToName ? (
          <Avatar className="size-4 shrink-0">
            <AvatarFallback className="text-[9px]">{assignedToName.charAt(0)}</AvatarFallback>
          </Avatar>
        ) : (
          <UserIcon className="size-3.5 text-muted-foreground/60" />
        )}
        <span className="truncate">{assignedToName || placeholder}</span>
        <ChevronDownIcon className="size-3 text-muted-foreground opacity-60 transition-transform group-hover/assignee:opacity-100" />
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={renderTriggerContent()} />
      <PopoverContent
        align={align}
        sideOffset={4}
        className="w-56 p-1.5 z-50 shadow-level-2 bg-popover border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索框 */}
        <div className="relative mb-1">
          <SearchIcon className="absolute left-2 top-2 size-3 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索成员或角色…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="h-7 w-full rounded-md border border-border/70 bg-muted/40 pl-7 pr-6 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
              title="清空搜索"
            >
              <XIcon className="size-3" />
            </button>
          )}
        </div>

        {/* 候选列表 */}
        <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5">
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
                    <Avatar className="size-4 shrink-0">
                      <AvatarFallback className="text-[9px]">{c.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{c.name}</span>
                    {c.role && (
                      <span className="text-[10px] text-muted-foreground/80 shrink-0">({c.role})</span>
                    )}
                  </div>
                  {isSelected && <CheckIcon className="size-3 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
