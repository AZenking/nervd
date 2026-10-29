import { useMemo } from 'react';
import { statusMeta, STATUS_TONE_ORDER, StatusIcon } from '@/components/status-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface HealthDistributionProps {
  items: { status?: string | null }[];
  loading?: boolean;
  className?: string;
  title?: string;
}

interface StatusStatRow {
  status: string;
  count: number;
  tone: 'ok' | 'run' | 'fail' | 'idle';
}

const TONE_BAR_COLORS = {
  run: 'bg-sig-run/85',
  fail: 'bg-sig-fail/85',
  ok: 'bg-primary/85',
  idle: 'bg-muted-foreground/45',
} as const;

export function HealthDistributionCard({
  items,
  loading = false,
  className,
  title = '状态分布',
}: HealthDistributionProps) {
  const { rows, maxCount, total } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const s = item.status?.trim() || '—';
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }

    const statRows: StatusStatRow[] = [...counts.entries()].map(([status, count]) => ({
      status,
      count,
      tone: statusMeta(status).tone,
    }));

    // 严格按生命周期排序：运行中 (Run) → 失败 (Fail) → 待办 (Idle) → 完成 (Ok)
    statRows.sort((a, b) => {
      const toneOrder = STATUS_TONE_ORDER.indexOf(a.tone) - STATUS_TONE_ORDER.indexOf(b.tone);
      if (toneOrder !== 0) return toneOrder;
      return b.count - a.count;
    });

    const max = statRows[0]?.count ?? 1;
    return { rows: statRows, maxCount: max, total: items.length };
  }, [items]);

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-border bg-card p-5',
        className,
      )}
    >
      <div className="flex items-center justify-between text-[13px] font-medium">
        <span className="text-foreground font-semibold tracking-tight">{title}</span>
        <span className="font-mono text-xs text-muted-foreground">共 {total} 项</span>
      </div>

      {loading && !items.length ? (
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
      ) : rows.length > 0 ? (
        <div className="flex flex-col gap-2.5 pt-1">
          {rows.map((row) => {
            const pctOfTotal = total > 0 ? Math.round((row.count / total) * 100) : 0;
            const widthPct = Math.max(4, Math.round((row.count / maxCount) * 100));

            return (
              <div key={row.status} className="flex items-center gap-3 text-xs">
                <StatusIcon status={row.status} className="size-3.5 shrink-0" />
                <span className="w-20 shrink-0 truncate text-foreground">{row.status}</span>

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
                  <span className="w-9 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {pctOfTotal}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-muted-foreground">暂无工作项</div>
      )}
    </div>
  );
}
