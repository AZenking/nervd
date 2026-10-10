import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from './StatusBadge';

/** 表格内的 CI 状态入口：状态徽章 + Tooltip（优先展示查询失败原因），点击打开 CI 详情 */
export function CiStatusButton({
  status,
  error,
  tooltip,
  onOpen,
}: {
  status: string;
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
            className="h-auto px-1.5 py-1 font-normal"
            onClick={onOpen}
          />
        }
      >
        <StatusBadge status={status} />
      </TooltipTrigger>
      <TooltipContent>{error ?? tooltip}</TooltipContent>
    </Tooltip>
  );
}
