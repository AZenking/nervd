// 工作项代码变更时间线（commit / MR / build）。
//
// 数据全部来自 `useAttribution`（Agent C 已实现），组件只负责：
// 按本地日期分组、倒序渲染、分页「加载更多」、同步状态与错误重试；
// 顶部「待归属变更（指派）」队列已下线，仅保留自动归属后的时间线。
import { useEffect, useMemo } from 'react';
import { AlertTriangleIcon, GitCommitIcon, RefreshCwIcon } from 'lucide-react';
import type { WorkitemChange } from '@/types/attribution';
import { localDateKey } from '@/lib/attribution-format';
import { cn } from '@/lib/utils';
import { useAttribution } from '@/store/attribution';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyHint } from '@/components/empty-hint';
import { SectionHeader } from '@/components/section-header';
import { ChangeEventCard } from './change-event-card';

export interface ChangeTimelineProps {
  workitemId: string;
  identifier?: string;
  /** 是否包含父需求 rollup 事件（缺省由 store 决定，默认 true）。 */
  includeRollup?: boolean;
  /** 子项抽屉内的紧凑形态。 */
  compact?: boolean;
  className?: string;
}

/** 稳定空数组：避免 selector 回退值每次渲染都新建数组，导致 useMemo 失效。 */
const EMPTY_TIMELINE: WorkitemChange[] = [];

export interface ChangeDayGroup {
  key: string;
  label: string;
  items: WorkitemChange[];
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 分组标题：今天 / 昨天 / M月D日（跨年补年份），全部按本地时区计算。 */
export function dayLabelOf(ts: number, now = Date.now()): string {
  const key = localDateKey(ts);
  if (key === localDateKey(now)) return '今天';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === localDateKey(yesterday.getTime())) return '昨天';
  const date = new Date(ts);
  const currentYear = new Date(now).getFullYear();
  return date.getFullYear() === currentYear
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 事件按本地日期分组，组内与组间均按 occurredAt 倒序。 */
export function groupChangesByDay(items: WorkitemChange[], now = Date.now()): ChangeDayGroup[] {
  const sorted = [...items].sort((a, b) => b.occurredAt - a.occurredAt);
  const groups = new Map<string, WorkitemChange[]>();
  for (const item of sorted) {
    const key = localDateKey(item.occurredAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()].map(([key, groupItems]) => ({
    key,
    label: dayLabelOf(groupItems[0].occurredAt, now),
    items: groupItems,
  }));
}

export interface ChangeTimelinePartition {
  /** 逐条渲染的事件：子项自身（primary / related）与父需求里程碑（rollup MR / build）。 */
  visible: WorkitemChange[];
  /** 父需求 rollup 的子项提交：只聚合计数，避免刷屏。 */
  rollupCommits: WorkitemChange[];
}

/**
 * 父需求噪音治理：`includeRollup=true` 时后端会把子项 commit 以 rollup 返回，
 * 但「需求只记里程碑」——rollup commit 折叠为一行计数，rollup MR / build 终态保留。
 * 子项自身（primary / related）不受影响。
 */
export function partitionTimeline(items: WorkitemChange[]): ChangeTimelinePartition {
  const visible: WorkitemChange[] = [];
  const rollupCommits: WorkitemChange[] = [];
  for (const item of items) {
    if (item.relation === 'rollup' && item.kind === 'commit') rollupCommits.push(item);
    else visible.push(item);
  }
  return { visible, rollupCommits };
}

/** 最近同步时间：当天只给 HH:mm，跨天补 M月D日。 */
function formatSyncTime(ts: number): string {
  const date = new Date(ts);
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return localDateKey(ts) === localDateKey(Date.now())
    ? clock
    : `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}

/** 精准骨架：与 ChangeEventCard 相同的行高 / 圆角 / 内边距，避免加载完成时跳动。 */
function TimelineSkeleton({ compact }: { compact: boolean }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="change-timeline-skeleton" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className={cn(
            'rounded-lg border border-border/50 bg-surface',
            compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
          )}
        >
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 w-14 shrink-0" />
            <Skeleton className="h-3.5 min-w-0 flex-1" />
            <Skeleton className="h-4 w-12 shrink-0 rounded-xs" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="ml-auto h-3 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div
      data-testid="change-timeline-error"
      className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-sig-fail" />
        <p className="min-w-0 text-xs leading-relaxed text-foreground/85">{text}</p>
      </div>
      <div className="flex justify-end">
        <Button size="xs" variant="outline" onPress={onRetry}>
          重试
        </Button>
      </div>
    </div>
  );
}

/**
 * 代码变更时间线：
 * - 切换 workitemId 自动 `loadTimeline`；
 * - 顶部工具行显示事件数、同步按钮（spinner）、最近同步时间；
 * - 事件按本地日期倒序分组，底部按游标「加载更多」；
 * - 空态 / 错误态 / 精准骨架三态齐备；不重复渲染云效评论。
 */
export function ChangeTimeline({
  workitemId,
  identifier,
  includeRollup,
  compact = false,
  className,
}: ChangeTimelineProps) {
  const timeline = useAttribution((state) => state.timelineByWorkitem[workitemId]) ?? EMPTY_TIMELINE;
  const loading = useAttribution((state) => Boolean(state.loadingTimeline[workitemId]));
  const error = useAttribution((state) => state.timelineError[workitemId] ?? null);
  const nextBefore = useAttribution((state) => state.timelineNextBefore[workitemId]);
  const syncing = useAttribution((state) => state.syncing);
  const status = useAttribution((state) => state.status);
  const loadTimeline = useAttribution((state) => state.loadTimeline);
  const loadMore = useAttribution((state) => state.loadMore);
  const refreshStatus = useAttribution((state) => state.refreshStatus);
  const syncNow = useAttribution((state) => state.syncNow);


  useEffect(() => {
    if (!workitemId) return;
    void loadTimeline(workitemId, includeRollup);
  }, [workitemId, includeRollup, loadTimeline]);

  useEffect(() => {
    if (status) return;
    void refreshStatus({ silent: true });
  }, [status, refreshStatus]);

  const { visible: visibleTimeline, rollupCommits } = useMemo(
    () => partitionTimeline(timeline),
    [timeline],
  );
  const groups = useMemo(() => groupChangesByDay(visibleTimeline), [visibleTimeline]);
  const total = visibleTimeline.length;
  const rollupCommitCount = rollupCommits.length;
  const hasHiddenRollupCommits = rollupCommitCount > 0;
  const hasContent = total > 0 || hasHiddenRollupCommits;
  const lastSyncAt = status?.lastSyncAt;
  const hasMore = typeof nextBefore === 'number';
  const showSkeleton = loading && timeline.length === 0;

  const retry = () => {
    void loadTimeline(workitemId, includeRollup);
  };

  const syncButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="xs"
            variant="ghost"
            aria-label="立即同步代码变更"
            aria-disabled={syncing}
            className={cn(
              'gap-1',
              syncing && 'cursor-wait',
            )}
            onPress={() => {
              if (syncing) return;
              void syncNow();
            }}
          >
            <RefreshCwIcon className={cn('size-3.5', syncing && 'animate-spin')} />
            {!compact && <span>{syncing ? '同步中…' : '同步'}</span>}
          </Button>
        }
      />
      <TooltipContent>{syncing ? '正在同步代码变更…' : '立即同步代码变更'}</TooltipContent>
    </Tooltip>
  );

  return (
    <section
      className={cn('flex min-w-0 flex-col gap-3', className)}
      data-testid="change-timeline"
      aria-label={identifier ? `${identifier} 代码变更时间线` : '代码变更时间线'}
    >
      <SectionHeader
        title="代码变更"
        count={!loading || total > 0 ? total : undefined}
        hint={!compact && lastSyncAt ? `最近同步 ${formatSyncTime(lastSyncAt)}` : undefined}
        level={compact ? 'h3' : 'h2'}
        action={syncButton}
      />

      {showSkeleton ? (
        <TimelineSkeleton compact={compact} />
      ) : !hasContent && error ? (
        <TimelineError text={error} onRetry={retry} />
      ) : !hasContent ? (
        <EmptyHint
          icon={GitCommitIcon}
          title="暂无代码变更"
          description="提交、MR、构建会自动汇总到这里"
          compact={compact}
          className={compact ? 'py-4' : 'py-8'}
        />
      ) : (
        <>
          {hasHiddenRollupCommits && (
            <p
              data-testid="timeline-rollup-commits"
              className="flex items-center gap-2 rounded-md border border-border/50 bg-surface-secondary/20 px-2.5 py-1.5 text-[11px] text-muted-foreground"
            >
              <GitCommitIcon className="size-3 shrink-0" />
              <span className="min-w-0 truncate">
                子项另有 {rollupCommitCount} 个提交已汇总，不在此逐条展开
              </span>
            </p>
          )}

          {error && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-danger/25 bg-danger/5 px-2.5 py-1.5">
              <span className="min-w-0 truncate text-[11px] text-foreground/80">{error}</span>
              <Button size="xs" variant="ghost" className="shrink-0 text-danger" onPress={retry}>
                重试
              </Button>
            </div>
          )}

          {total > 0 ? (
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                  <div
                    data-testid="timeline-group-header"
                    className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/80"
                  >
                    <span className="shrink-0">{group.label}</span>
                    <span className="h-px min-w-0 flex-1 bg-border/50" aria-hidden />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {group.items.map((item) => (
                      <ChangeEventCard key={item.id} change={item} compact={compact} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-1 text-[11px] text-muted-foreground">
              父需求只记录里程碑（MR / 构建终态），子项提交请到对应子工作项查看。
            </p>
          )}

          {hasMore && (
            <div className="flex justify-center pt-0.5">
              <Button
                size="xs"
                variant="ghost"
                aria-disabled={loading}
                className={cn(
                  'gap-1.5',
                  loading && 'cursor-wait',
                )}
                onPress={() => {
                  if (loading) return;
                  void loadMore(workitemId, includeRollup);
                }}
              >
                {loading ? <Spinner className="size-3" /> : null}
                <span>{loading ? '加载中…' : '加载更多'}</span>
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}