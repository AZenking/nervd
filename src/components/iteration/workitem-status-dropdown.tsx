import { CheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { StatusIcon } from '@/components/status-icon';
import { Spinner } from '@/components/ui/spinner';
import { useWorkitemWorkflowStatuses } from '@/hooks/use-workitem-workflow-statuses';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const WORKITEM_STATUS_OPTIONS = [
  { name: '待办', label: '待办' },
  { name: '进行中', label: '进行中' },
  { name: '测试中', label: '测试中' },
  { name: '已完成', label: '已完成' },
  { name: '已关闭', label: '已关闭' },
] as const;

export interface WorkitemStatusDropdownProps {
  workitemId?: string;
  status: string;
  statusId?: string;
  variant?: 'icon' | 'badge' | 'cell';
  className?: string;
  onStatusChange?: (newStatus: string) => void;
}

/**
 * 工作项原地流转下拉组件：
 * - variant="icon"：列表行首紧凑图标 Trigger，点击呼出菜单原地流转
 * - variant="badge"：详情页顶部紧凑带边框徽标形态
 * - variant="cell"：裸单元格无边框形态（用于属性栏等）
 * - 内置 updateWorkitemStatusOptimistic 乐观更新与回滚
 */
export function WorkitemStatusDropdown({
  workitemId,
  status,
  statusId,
  variant = 'icon',
  className,
  onStatusChange,
}: WorkitemStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const { statuses, loadingStatuses, fetchStatuses, changeStatus } = useWorkitemWorkflowStatuses({
    workitemId,
    currentStatusId: statusId,
    currentStatusName: status,
  });

  useEffect(() => {
    if (open) void fetchStatuses();
  }, [fetchStatuses, open]);

  const handleSelect = async (target: { id: string; name: string }) => {
    const success = await changeStatus(target);
    if (success) onStatusChange?.(target.name);
  };

  const renderTrigger = () => {
    if (variant === 'icon') {
      return (
        <DropdownMenuTrigger
          onClick={(e) => e.stopPropagation()}
          data-testid="row-status-trigger"
          data-status={status || ''}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer',
            className,
          )}
          title={`状态：${status || '未指定'}（点击原地流转）`}
        >
          <StatusIcon status={status} className="size-3.5 shrink-0" />
        </DropdownMenuTrigger>
      );
    }

    return (
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer rounded-sm hover:bg-muted/80 text-foreground',
          variant === 'badge'
            ? 'border border-border/70 bg-background px-2 py-0.5 text-xs font-medium'
            : 'px-1.5 py-0.5 text-xs font-medium',
          className,
        )}
        title="点击原地流转状态"
      >
        <StatusIcon status={status} className="size-3.5 shrink-0" />
        <span>{status || '未知状态'}</span>
      </DropdownMenuTrigger>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {renderTrigger()}
      <DropdownMenuContent
        align="start"
        className="w-36 p-1 z-50 bg-popover/95 backdrop-blur-md border border-border shadow-level-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          流转状态
        </div>
        {loadingStatuses && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            读取状态流程…
          </div>
        )}
        {!loadingStatuses && statuses.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无可流转状态</div>
        )}
        {!loadingStatuses && statuses.map((st) => (
          <DropdownMenuItem
            key={st.id}
            onClick={(e) => {
              e.stopPropagation();
              void handleSelect(st);
            }}
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
