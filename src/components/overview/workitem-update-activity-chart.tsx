import { useId, useMemo } from 'react';
import type { WorkitemRow } from '@/lib/api';
import { toUpdateActivityData } from '@/lib/overview-metrics';
import { Card } from '@heroui/react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface WorkitemUpdateActivityChartProps {
  items: Pick<WorkitemRow, 'updatedAt'>[];
  complete: boolean;
  loading?: boolean;
  title?: string;
  className?: string;
}

export function WorkitemUpdateActivityChart({
  items,
  complete,
  loading = false,
  title = '更新时间分布',
  className,
}: WorkitemUpdateActivityChartProps) {
  const titleId = useId();
  const { data, missingCount } = useMemo(() => toUpdateActivityData(items), [items]);
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
          <Skeleton className="h-[220px] w-full rounded-md" aria-label="正在加载更新时间分布" />
        ) : data.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            暂无可用更新时间
            {missingCount > 0 && <span className="ml-1">（{missingCount} 项缺失更新时间）</span>}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pt-1">
            {data.slice(-7).map((row) => {
              const widthPct = Math.max(4, Math.round((row.count / maxCount) * 100));
              return (
                <div key={row.date} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">{row.date}</span>

                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/40">
                    <div
                      className="h-full rounded-full bg-primary/80 transition-all duration-300"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-1.5 shrink-0">
                    <span className="w-6 text-right font-mono tabular-nums text-foreground font-medium">
                      {row.count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
