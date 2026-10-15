import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from './StatusBadge';

/**
 * 表格 CI 概要单元：状态徽章 + 运行次数聚合为唯一点击入口（打开 CI 详情抽屉）。
 * 取代原先「CI 状态列 + 运行记录列 + 操作列 CI 详情按钮」的三个重复入口；
 * Tooltip 优先展示查询失败原因。
 */
export function CiSummaryButton({
  status,
  runCount,
  error,
  tooltip,
  onOpen,
}: {
  status: string;
  runCount?: number;
  error?: string | null;
  tooltip: string;
  onOpen: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-auto gap-1.5 px-1.5 py-1 font-normal"
            onClick={onOpen}
          />
        }
      >
        <StatusBadge status={status} />
        {runCount ? (
          <span className="whitespace-nowrap text-xs text-muted-foreground">· {runCount} 次运行</span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent>{error ?? tooltip}</TooltipContent>
    </Tooltip>
  );
}
