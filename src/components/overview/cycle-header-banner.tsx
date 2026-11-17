import { ChevronRightIcon, CalendarDaysIcon, CheckIcon } from 'lucide-react';
import type { IterationSummary } from '@/types';
import {
  calculateSprintRemaining,
  formatSprintDateRange,
  type IterationWorkitemBreakdown,
} from '@/lib/iteration-period';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { statusMeta } from '@/components/StatusBadge';
import { StatusIcon } from '@/components/status-icon';
import { Kbd } from '@/components/ui/kbd';
import { OverflowTooltip } from '@/components/overflow-tooltip';

export interface CycleHeaderBannerProps {
  iteration?: IterationSummary | null;
  iterations?: IterationSummary[];
  /** 兼容旧调用方；纵览页不再把它渲染成完成率或阻塞统计。 */
  breakdown?: IterationWorkitemBreakdown;
  itemCount?: number;
  dataComplete?: boolean;
  onOpenIterationWorkbench?: (iterationName: string) => void;
  onSelectIteration?: (iterationId: string) => void;
  className?: string;
}

export function CycleHeaderBanner({
  iteration,
  iterations = [],
  breakdown,
  itemCount,
  dataComplete = true,
  onOpenIterationWorkbench,
  onSelectIteration,
  className,
}: CycleHeaderBannerProps) {
  const remaining = calculateSprintRemaining(iteration?.endDate);
  const visibleItemCount = itemCount ?? breakdown?.total ?? 0;

  return (
    <Card
      className={cn(
        'group gap-0 overflow-hidden p-0',
        className,
      )}
    >
      <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <StatusIcon status={iteration?.state ?? '进行中'} className="size-4 shrink-0" />

          {/* 迭代名（支持在多迭代之间切换） */}
          {iterations.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-sm text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary sm:text-base">
                <OverflowTooltip
                  text={iteration?.name || '当前迭代'}
                  className="max-w-[280px]"
                />
                <span className="text-[10px] text-muted-foreground">▼</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent aria-label="切换迭代" className="max-h-80 min-w-52">
                {iterations.map((it) => {
                  const isSelected = it.id === iteration?.id;
                  return (
                    <DropdownMenuItem
                      key={it.id || it.name}
                      id={it.id}
                      textValue={it.name}
                      onAction={() => onSelectIteration?.(String(it.id))}
                      className={cn(
                        'flex items-center gap-2 justify-between px-2.5 py-1.5',
                        // 激活态配方：实色 accent 底 + accent-foreground 前景（禁止半透明 accent + 默认深色前景）
                        isSelected && 'font-medium bg-accent text-accent-foreground',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <StatusIcon status={it.state} className="size-3.5 shrink-0" />
                        <Label className={cn('min-w-0 truncate', isSelected && 'text-accent-foreground')}>
                          <OverflowTooltip text={it.name} className="min-w-0" />
                        </Label>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {isSelected ? (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-accent-foreground">
                            <span>当前</span>
                            <CheckIcon className="size-3" />
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{it.state}</span>
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
          <Chip
            size="sm"
            variant="soft"
            color={
              statusMeta(iteration?.state).tone === 'ok'
                ? 'success'
                : statusMeta(iteration?.state).tone === 'fail'
                  ? 'danger'
                  : statusMeta(iteration?.state).tone === 'run'
                    ? 'warning'
                    : 'default'
            }
          >
            {iteration?.state || '进行中'}
          </Chip>

          {/* 日期周期 */}
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
            <CalendarDaysIcon className="size-3 text-muted-foreground" />
            <span>{formatSprintDateRange(iteration?.startDate, iteration?.endDate)}</span>
          </span>

          {/* 倒计时胶囊 */}
          <Chip
            size="sm"
            variant="soft"
            color={remaining.tone === 'fail' ? 'danger' : remaining.tone === 'run' ? 'warning' : 'default'}
            className="font-mono tabular-nums"
          >
            {remaining.label}
          </Chip>
        </div>

        {/* 右侧进入工作台操作 */}
        <Button
          variant="ghost"
          onPress={() => onOpenIterationWorkbench?.(iteration?.name ?? '')}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <span>进入迭代工作台</span>
          <Kbd>g i</Kbd>
          <ChevronRightIcon className="size-3.5" />
        </Button>
      </Card.Header>

      <Card.Footer className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        <div className="flex items-center gap-1">
          <span className="font-medium text-foreground">
            {dataComplete ? (
              <>
                共 <span className="font-mono tabular-nums">{visibleItemCount}</span> 项
              </>
            ) : (
              <>
                已加载 <span className="font-mono tabular-nums">{visibleItemCount}</span> 项
              </>
            )}
          </span>
          <span>当前类别工作项</span>
        </div>

        <span className="font-mono text-[11px]">
          {dataComplete ? '分页已完成' : '分页未完成'}
        </span>
      </Card.Footer>
    </Card>
  );
}
