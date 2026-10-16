import { ChevronRightIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusIcon } from '@/components/status-icon';
import { WORKITEM_STATUS_OPTIONS } from './workitem-status-dropdown';

export interface FloatingBatchBarProps {
  /** 选中的工作项 ID 集合 */
  selectedIds: Set<string>;
  /** 清空多选回调 */
  onClear: () => void;
  /** 自定义批量流转状态回调 */
  onBatchStatusChange?: (statusName: string, selectedIds: string[]) => void;
}

/**
 * 底部浮动批量操作条（Linear 式 Floating Batch Bar）：
 * - 选中项 > 0 时从底部平滑滑出
 * - 支持一键批量流转状态（集成乐观更新）
 * - 显示当前已选项计数与 Esc 清空提示
 */
export function FloatingBatchBar({
  selectedIds,
  onClear,
  onBatchStatusChange,
}: FloatingBatchBarProps) {
  if (selectedIds.size === 0) return null;

  const handleStatusSelect = (statusName: string) => {
    const ids = Array.from(selectedIds);
    if (onBatchStatusChange) {
      onBatchStatusChange(statusName, ids);
    } else {
      const updateWorkitemStatusOptimistic = useApp.getState().updateWorkitemStatusOptimistic;
      void Promise.all(
        ids.map((id) => updateWorkitemStatusOptimistic(id, statusName)),
      );
    }
    onClear();
  };

  return (
    <div data-testid="floating-batch-bar" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-popover/95 backdrop-blur-md border border-border shadow-level-3 rounded-lg px-3.5 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <span data-testid="batch-bar-count" className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold tabular-nums font-mono">
        已选 {selectedIds.size} 项
      </span>
      <div className="h-4 w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="xs" variant="outline" className="gap-1.5 text-xs h-7">
              <span>变更状态</span>
              <ChevronRightIcon className="size-3 rotate-90 text-muted-foreground" />
            </Button>
          }
        />
        <DropdownMenuContent align="center" className="w-36 p-1 z-50">
          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            批量流转为
          </div>
          {WORKITEM_STATUS_OPTIONS.map((st) => (
            <DropdownMenuItem
              key={st.name}
              onClick={() => handleStatusSelect(st.name)}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm cursor-pointer"
            >
              <StatusIcon status={st.name} className="size-3.5" />
              <span>{st.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="xs"
        variant="ghost"
        onClick={onClear}
        className="text-xs text-muted-foreground hover:text-foreground h-7"
      >
        取消 (Esc)
      </Button>
    </div>
  );
}
