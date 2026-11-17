import { useId, useMemo } from 'react';
import type { WorkitemRow } from '@/lib/api';
import { toUpdateActivityData } from '@/lib/overview-metrics';
import { ChartColumnIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyHint } from '@/components/empty-hint';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const ACTIVITY_ROW_COUNT = 7;

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
  const summaryId = useId();
  const { data, missingCount } = useMemo(() => toUpdateActivityData(items), [items]);
  const maxCount = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data]);
  const visibleRows = useMemo(() => data.slice(-ACTIVITY_ROW_COUNT), [data]);
  const summary = useMemo(
    () =>
      visibleRows.length > 0
        ? visibleRows.map((row) => `${row.date} ${row.count} 项`).join('；')
        : '暂无可用更新时间',
    [visibleRows],
  );

  return (
    <Card className={cn('min-w-0 flex-1', className)}>
      <Card.Header className="flex flex-row items-center justify-between gap-3 pb-0">
        <div className="min-w-0">
          <Card.Title id={titleId}>
            {title}
          </Card.Title>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {complete ? '当前迭代与类别 · 完整列表' : '当前迭代与类别 · 已加载范围'}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {complete ? `共 ${items.length} 项` : `已加载 ${items.length} 项`}
        </span>
      </Card.Header>

      <Card.Content>
        {loading && items.length === 0 ? (
          // 行级骨架：日期 + 条 + 计数，行数与真实图（最近 7 天）一致，避免「一根大灰条」
          <div className="flex flex-col gap-2.5 py-1" aria-hidden>
            {Array.from({ length: ACTIVITY_ROW_COUNT }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-24 shrink-0" />
                <Skeleton className="h-2 flex-1 rounded-full" />
                <Skeleton className="h-3.5 w-6 shrink-0" />
              </div>
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <EmptyHint
            icon={ChartColumnIcon}
            title="暂无可用更新时间"
            description={missingCount > 0 ? `另有 ${missingCount} 项缺失更新时间` : undefined}
            compact
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <div role="img" aria-labelledby={titleId} aria-describedby={summaryId} className="pt-1">
            <div className="flex flex-col gap-2.5">
              {visibleRows.map((row) => {
                const widthPct = Math.max(4, Math.round((row.count / maxCount) * 100));
                return (
                  <div key={row.date} className="flex items-center gap-3 text-xs">
                    <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">{row.date}</span>

                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-secondary">
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
            <p id={summaryId} className="sr-only">
              最近 {visibleRows.length} 个有更新的日期及工作项数：{summary}。
              {missingCount > 0 ? `另有 ${missingCount} 项缺失更新时间，未计入。` : ''}
              数据范围：{complete ? '当前迭代与类别完整列表' : '当前已加载范围，不含未加载数据'}。
            </p>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}