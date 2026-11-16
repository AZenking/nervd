import type { IterationWorkitemBreakdown } from '@/lib/iteration-period';
import { cn } from '@/lib/utils';
import { Tooltip } from '@heroui/react';

interface SegmentItem {
  key: string;
  label: string;
  count: number;
  colorClass: string;
}

export function LinearSegmentedProgressBar({
  breakdown,
  className,
}: {
  breakdown: IterationWorkitemBreakdown;
  className?: string;
}) {
  const { total, completed, inProgress, blocked, todo } = breakdown;

  if (total <= 0) {
    return (
      <div
        className={cn('h-1.5 w-full rounded-full bg-surface-secondary', className)}
        aria-label="暂无工作项进度"
      />
    );
  }

  const segments: SegmentItem[] = [
    // 已完成段用成功语义色（sig-ok），不再挪用品牌动作色 primary（审计 §2.4 P1-46）
    { key: 'completed', label: '已完成', count: completed, colorClass: 'bg-sig-ok' },
    { key: 'inProgress', label: '进行中', count: inProgress, colorClass: 'bg-sig-run' },
    { key: 'blocked', label: '阻塞/失败', count: blocked, colorClass: 'bg-sig-fail' },
    { key: 'todo', label: '待办', count: todo, colorClass: 'bg-sig-idle/35' },
  ].filter((s) => s.count > 0);

  return (
    <div
      role="progressbar"
      aria-valuenow={breakdown.percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`迭代完成度 ${breakdown.percent}%`}
      className={cn(
        'group flex h-[5px] w-full overflow-hidden rounded-full bg-surface-secondary gap-[1px]',
        className,
      )}
    >
      {segments.map((s, idx) => {
        const pct = (s.count / total) * 100;
        const isFirst = idx === 0;
        const isLast = idx === segments.length - 1;

        return (
          <Tooltip key={s.key} delay={0}>
            <Tooltip.Trigger
              render={(props) => (
                <span
                  {...props}
                  style={{ width: `${pct}%` }}
                  className={cn(
                    'block h-full transition-all duration-300 hover:brightness-110',
                    isFirst && 'rounded-l-full',
                    isLast && 'rounded-r-full',
                    s.colorClass,
                  )}
                />
              )}
            />
            <Tooltip.Content offset={6} placement="top" className="text-[11px] py-0.5 px-2 font-normal">
              <span className="font-medium text-foreground">{s.label}</span>
              <span className="text-muted-foreground">：</span>
              <span className="font-mono tabular-nums text-foreground">{s.count}</span>
              <span className="text-muted-foreground"> 项 (</span><span className="font-mono tabular-nums text-foreground">{Math.round(pct)}%</span><span className="text-muted-foreground">)</span>
            </Tooltip.Content>
          </Tooltip>
        );
      })}
    </div>
  );
}
