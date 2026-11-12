import { ChevronRightIcon, CalendarDaysIcon, CheckIcon } from 'lucide-react';
import type { IterationSummary } from '@/types';
import {
  calculateSprintRemaining,
  formatSprintDateRange,
  type IterationWorkitemBreakdown,
} from '@/lib/iteration-period';
import { cn } from '@/lib/utils';
import { Button, Card, Chip, Dropdown, Label } from '@heroui/react';
import { statusMeta } from '@/components/StatusBadge';
import { StatusIcon } from '@/components/status-icon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Kbd } from '@/components/ui/kbd';

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
            <Dropdown>
              <Dropdown.Trigger
                className="flex items-center gap-1.5 text-sm sm:text-base font-semibold tracking-tight text-foreground transition-colors hover:text-primary focus-visible:outline-hidden"
              >
                <span className="truncate max-w-[280px]" title={iteration?.name || '当前迭代'}>{iteration?.name || '当前迭代'}</span>
                <span className="text-[10px] text-muted-foreground">▼</span>
              </Dropdown.Trigger>
              <Dropdown.Popover className="min-w-52 max-h-80">
                <ScrollArea size={24} className="max-h-[inherit]">
                <Dropdown.Menu
                  aria-label="切换迭代"
                  onAction={(key) => onSelectIteration?.(String(key))}
                >
                  {iterations.map((it) => {
                    const isSelected = it.id === iteration?.id;
                    return (
                      <Dropdown.Item
                        key={it.id || it.name}
                        id={it.id}
                        textValue={it.name}
                        className={cn(
                          'flex items-center gap-2 justify-between cursor-pointer px-2.5 py-1.5',
                          isSelected && 'font-medium bg-accent/60',
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <StatusIcon status={it.state} className="size-3.5 shrink-0" />
                          <Label className="truncate" title={it.name}>{it.name}</Label>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {isSelected ? (
                            <span className="flex items-center gap-1 text-[11px] text-primary font-medium">
                              <span>当前</span>
                              <CheckIcon className="size-3" />
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {it.state}
                            </span>
                          )}
                        </div>
                      </Dropdown.Item>
                    );
                  })}
                </Dropdown.Menu>
                </ScrollArea>
              </Dropdown.Popover>
            </Dropdown>
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
          >
            {remaining.label}
          </Chip>
        </div>

        {/* 右侧进入工作台操作 */}
        <Button
          variant="ghost"
          size="sm"
          onPress={() => onOpenIterationWorkbench?.(iteration?.name ?? '')}
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60"
        >
          <span>进入迭代工作台</span>
          <Kbd variant="light" className="hidden! sm:inline-flex! h-auto! rounded-sm! px-1! py-0! font-mono! text-[10px]!">
            g i
          </Kbd>
          <ChevronRightIcon className="size-3.5" />
        </Button>
      </Card.Header>

      <Card.Footer className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        <div className="flex items-center gap-1">
          <span className="font-medium text-foreground">
            {dataComplete ? `共 ${visibleItemCount} 项` : `已加载 ${visibleItemCount} 项`}
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
