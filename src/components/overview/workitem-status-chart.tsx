import { useId, useMemo } from 'react';
import type { WorkitemRow } from '@/lib/api';
import { toStatusChartData } from '@/lib/overview-metrics';
import { StatusIcon } from '@/components/status-icon';
import { Card } from '@heroui/react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const TONE_BAR_COLORS = {
  run: 'bg-sig-run/85',
  fail: 'bg-sig-fail/85',
  ok: 'bg-sig-ok/85',
  idle: 'bg-muted-foreground/45',
} as const;

export interface WorkitemStatusChartProps {
  items: Pick<WorkitemRow, 'status'>[];
  complete: boolean;
  loading?: boolean;
  title?: string;
  className?: string;
}

export function WorkitemStatusChart({
  items,
  complete,
  loading = false,
  title = '状态分布',
  className,
}: WorkitemStatusChartProps) {
  const titleId = useId();
  const data = useMemo(() => toStatusChartData(items, complete), [items, complete]);
  const maxCount = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data]);

  return (
    <Card className={cn('min-w-0 flex-1', className)}>
      <Card.Header className="flex flex-row items-center justify-between gap-3 pb-0">
        <div className="min-w-0">
          <Card.Title id={titleId} className="text-[13px] font-semibold tracking-tight text-foreground">
            {title}
          </Card.Title>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {complete ? '当前迭代与类别 · 完整列表' : '当前迭代与类别 · 已加载范围'}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {complete ? `共 ${items.length} 项` : `已加载 ${items.length} 项`}
        </span>
      </Card.Header>

      <Card.Content>
        {loading && items.length === 0 ? (
          <div className="flex flex-col gap-3 py-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-3.5 rounded-full shrink-0" />
                <Skeleton className="h-3.5 w-16 shrink-0" />
                <Skeleton className="h-2 flex-1 rounded-full" />
                <Skeleton className="h-3.5 w-6 shrink-0" />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">暂无工作项</div>
        ) : (
          <ul aria-label="状态分布文本统计" className="flex flex-col gap-2.5 pt-1">
            {data.map((row) => {
              const widthPct = Math.max(4, Math.round((row.count / maxCount) * 100));
              return (
                <li key={row.label} className="flex items-center gap-3 text-xs">
                  <StatusIcon status={row.label} className="size-3.5 shrink-0" />
                  <span className="w-20 shrink-0 truncate text-foreground">{row.label}</span>

                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/40">
                    <div
                      className={cn('h-full rounded-full transition-all duration-300', TONE_BAR_COLORS[row.tone])}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-1.5 shrink-0">
                    <span className="w-6 text-right font-mono tabular-nums text-foreground font-medium">
                      {row.count}
                    </span>
                    {row.percent != null && (
                      <span className="w-9 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                        {row.percent}%
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
