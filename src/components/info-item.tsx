import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * 信息格（迭代摘要卡 / CI 详情抽屉共用；UX A12：纯展示态不做 hover 可点暗示）。
 * 值溢出时截断，Tooltip 呈现全量。
 */
export function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <Tooltip>
        <TooltipTrigger render={<p className="mt-1.5 truncate font-mono text-sm font-medium" />}>
          {value}
        </TooltipTrigger>
        <TooltipContent className="max-w-96 break-all">{value}</TooltipContent>
      </Tooltip>
    </div>
  );
}
