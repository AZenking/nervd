import { ChevronRightIcon, CalendarDaysIcon, CheckIcon } from 'lucide-react';
import type { IterationSummary } from '@/types';
import {
  calculateSprintRemaining,
  formatSprintDateRange,
  type IterationWorkitemBreakdown,
} from '@/lib/iteration-period';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusIcon } from '@/components/status-icon';
import { LinearSegmentedProgressBar } from './segmented-progress-bar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface CycleHeaderBannerProps {
  iteration?: IterationSummary | null;
  iterations?: IterationSummary[];
  breakdown: IterationWorkitemBreakdown;
  onOpenIterationWorkbench?: (iterationName: string) => void;
  onSelectIteration?: (iterationName: string) => void;
  className?: string;
}

export function CycleHeaderBanner({
  iteration,
  iterations = [],
  breakdown,
  onOpenIterationWorkbench,
  onSelectIteration,
  className,
}: CycleHeaderBannerProps) {
  const remaining = calculateSprintRemaining(iteration?.endDate);

  const remainingToneClasses = {
    run: 'border-sig-run/30 bg-sig-run/10 text-sig-run',
    fail: 'border-sig-fail/30 bg-sig-fail/10 text-sig-fail',
    ok: 'border-sig-ok/30 bg-sig-ok/10 text-sig-ok',
    idle: 'border-border bg-muted/40 text-muted-foreground',
  }[remaining.tone];

  return (
    <div
      className={cn(
        'group flex flex-col gap-3 rounded-lg border border-border bg-card/70 p-4 transition-colors hover:bg-card/90 sm:p-5',
        className,
      )}
    >
      {/* 顶部主信息栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <StatusIcon status={iteration?.state ?? '进行中'} className="size-4 shrink-0" />

          {/* 迭代名（支持在多迭代之间切换） */}
          {iterations.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm sm:text-base font-semibold tracking-tight text-foreground transition-colors hover:text-primary focus-visible:outline-hidden"
                  >
                    <span>{iteration?.name || '当前迭代'}</span>
                    <span className="text-[10px] text-muted-foreground">▼</span>
                  </button>
                }
              />
              <DropdownMenuContent align="start" className="min-w-52 max-h-80 overflow-y-auto">
                {iterations.map((it) => {
                  const isSelected = it.name === iteration?.name;
                  return (
                    <DropdownMenuItem
                      key={it.id || it.name}
                      className={cn(
                        'flex items-center gap-2 justify-between cursor-pointer px-2.5 py-1.5',
                        isSelected && 'font-medium bg-accent/60',
                      )}
                      onClick={() => onSelectIteration?.(it.name)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <StatusIcon status={it.state} className="size-3.5 shrink-0" />
                        <span className="truncate">{it.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {isSelected ? (
                          <span className="flex items-center gap-1 text-[11px] text-primary font-medium">
                            <span>当前</span>
                            <CheckIcon className="size-3" />
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/70">
                            {it.state}
                          </span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-sm sm:text-base font-semibold tracking-tight text-foreground">
              {iteration?.name || '当前迭代'}
            </span>
          )}

          {/* 状态徽标 */}
          <span className="rounded px-1.5 py-0.5 text-[11px] font-medium border border-border/80 bg-muted/40 text-muted-foreground">
            {iteration?.state || '进行中'}
          </span>

          {/* 日期周期 */}
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
            <CalendarDaysIcon className="size-3 text-muted-foreground/70" />
            <span>{formatSprintDateRange(iteration?.startDate, iteration?.endDate)}</span>
          </span>

          {/* 倒计时胶囊 */}
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] font-medium',
              remainingToneClasses,
            )}
          >
            {remaining.label}
          </span>
        </div>

        {/* 右侧进入工作台操作 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenIterationWorkbench?.(iteration?.name ?? '')}
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60"
        >
          <span>进入迭代工作台</span>
          <kbd className="hidden sm:inline-block rounded border border-border bg-muted/80 px-1 py-0.2 font-mono text-[10px] text-muted-foreground">
            g i
          </kbd>
          <ChevronRightIcon className="size-3.5" />
        </Button>
      </div>

      {/* 中部 Linear 标志性细长复合进度条 */}
      <div className="py-0.5">
        <LinearSegmentedProgressBar breakdown={breakdown} />
      </div>

      {/* 底部摘要信息 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="font-medium text-foreground">
            {breakdown.completed} / {breakdown.total}
          </span>
          <span>项已完成</span>
          <span>·</span>
          <span>完成率</span>
          <span className="font-mono font-medium text-foreground">{breakdown.percent}%</span>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px]">
          {breakdown.inProgress > 0 && (
            <span className="flex items-center gap-1 text-sig-run">
              <span className="size-1.5 rounded-full bg-sig-run" />
              <span>{breakdown.inProgress} 进行中</span>
            </span>
          )}
          {breakdown.blocked > 0 && (
            <span className="flex items-center gap-1 text-sig-fail">
              <span className="size-1.5 rounded-full bg-sig-fail" />
              <span>{breakdown.blocked} 阻塞</span>
            </span>
          )}
          {breakdown.todo > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className="size-1.5 rounded-full bg-muted-foreground/50" />
              <span>{breakdown.todo} 待办</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
