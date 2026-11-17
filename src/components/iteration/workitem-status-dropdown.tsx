import { CheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { StatusIcon } from '@/components/status-icon';
import { statusMeta, type StatusTone } from '../StatusBadge';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { READONLY_BTN_CLASS } from '../WriteOpButton';
import { useWorkitemWorkflowStatuses } from '@/hooks/use-workitem-workflow-statuses';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export { toneToChipColor };

export const WORKITEM_STATUS_OPTIONS = [
  { name: '待办', label: '待办' },
  { name: '进行中', label: '进行中' },
  { name: '测试中', label: '测试中' },
  { name: '已完成', label: '已完成' },
  { name: '已关闭', label: '已关闭' },
] as const;

/** 语义 tone → Chip color：iteration 内状态徽标/计数的唯一映射入口（避免各文件再写一份） */
const TONE_TO_CHIP_COLOR: Record<StatusTone, 'success' | 'warning' | 'danger' | 'default'> = {
  ok: 'success',
  run: 'warning',
  fail: 'danger',
  idle: 'default',
};

function toneToChipColor(tone: StatusTone): 'success' | 'warning' | 'danger' | 'default' {
  return TONE_TO_CHIP_COLOR[tone] ?? 'default';
}

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
  const allowWrite = useApp((s) => s.settings?.allowWriteOps ?? false);
  const openSettings = useUi((s) => s.openSettings);
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

  const meta = statusMeta(status);
  const chipColor = toneToChipColor(meta.tone);

  const notifyReadonly = () => {
    toast.add({
      title: '当前处于只读模式',
      description: '原地流转状态是写操作。可在「设置 → 安全与权限」中开启写权限后执行。',
      type: 'warning',
      actionProps: {
        children: '前往设置',
        onClick: () => openSettings('security'),
      },
    });
  };

  // 只读门控（AGENTS §5.1）：禁止原生 disabled（会吞 hover/focus 导致原因不可见）。
  // 触发器保留 aria-disabled + 灰阶样式 + Tooltip，点击给 Toast 引导，不展开菜单、不发写请求。
  if (!allowWrite) {
    const readonlyReason = '写操作已关闭：需在「设置 → 安全与权限」中开启（需写权限令牌）';
    const handleReadonlyClick = () => notifyReadonly();
    const readonlyTrigger = variant === 'icon' ? (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        data-testid="row-status-trigger"
        data-status={status || ''}
        aria-disabled="true"
        aria-label={`状态：${status || '未指定'}（只读，点击查看原因）`}
        onClick={(e) => e.stopPropagation()}
        onPress={handleReadonlyClick}
        className={cn('shrink-0', READONLY_BTN_CLASS, className)}
      >
        <StatusIcon status={status} className="size-3.5 shrink-0" />
      </Button>
    ) : variant === 'badge' ? (
      <Button
        type="button"
        variant="ghost"
        size="bare"
        aria-disabled="true"
        aria-label={`状态：${status || '未知状态'}（只读，点击查看原因）`}
        onClick={(e) => e.stopPropagation()}
        onPress={handleReadonlyClick}
        className={cn('cursor-not-allowed', READONLY_BTN_CLASS)}
      >
        <Chip size="sm" color={chipColor} variant="soft" className={cn('grayscale opacity-80', className)}>
          <StatusIcon status={status} className="size-3 shrink-0" />
          <Chip.Label>{status || '未知状态'}</Chip.Label>
        </Chip>
      </Button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-disabled="true"
        aria-label={`状态：${status || '未知状态'}（只读，点击查看原因）`}
        onClick={(e) => e.stopPropagation()}
        onPress={handleReadonlyClick}
        className={cn('gap-1.5 text-muted-foreground cursor-not-allowed', className)}
      >
        <StatusIcon status={status} className="size-3.5 shrink-0" />
        <span>{status || '未知状态'}</span>
      </Button>
    );

    return (
      <Tooltip>
        <TooltipTrigger render={readonlyTrigger} />
        <TooltipContent>{readonlyReason}</TooltipContent>
      </Tooltip>
    );
  }

  const renderTrigger = () => {
    if (variant === 'icon') {
      return (
        <DropdownMenuTrigger
          onClick={(e) => e.stopPropagation()}
          data-testid="row-status-trigger"
          data-status={status || ''}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer',
            className,
          )}
          title={`状态：${status || '未指定'}（点击原地流转）`}
          aria-label={`状态：${status || '未指定'}（点击原地流转）`}
        >
          <StatusIcon status={status} className="size-3.5 shrink-0" />
        </DropdownMenuTrigger>
      );
    }

    if (variant === 'badge') {
      return (
        <DropdownMenuTrigger
          onClick={(e) => e.stopPropagation()}
          className="cursor-pointer"
          render={
            <Chip
              size="sm"
              color={chipColor}
              variant="soft"
              className={className}
              title="点击原地流转状态"
            >
              <StatusIcon status={status} className="size-3 shrink-0" />
              <Chip.Label>{status || '未知状态'}</Chip.Label>
            </Chip>
          }
        />
      );
    }

    return (
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer rounded-sm hover:bg-surface-secondary text-foreground px-1.5 py-0.5 text-xs font-medium',
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
        className="w-36"
        onClick={(e) => e.stopPropagation()}
        header={
          <>
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider">
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
          </>
        }
      >
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
