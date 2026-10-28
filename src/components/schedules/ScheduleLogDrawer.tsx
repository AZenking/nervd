import { useMemo } from 'react';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  GitMergeIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { EmptyHint } from '@/components/empty-hint';
import { useScheduleStore } from '@/store/schedule';
import { formatDateTime } from '@/lib/format';
import type { ScheduleExecutionLog } from '@/types/schedule';
import { cn } from '@/lib/utils';

export interface ScheduleLogDrawerProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScheduleLogDrawer({
  taskId,
  open,
  onOpenChange,
}: ScheduleLogDrawerProps) {
  const tasks = useScheduleStore((s) => s.tasks);
  const logs = useScheduleStore((s) => s.logs);
  const clearLogs = useScheduleStore((s) => s.clearLogs);

  const currentTask = useMemo(
    () => (taskId ? tasks.find((t) => t.id === taskId) ?? null : null),
    [taskId, tasks],
  );

  const filteredLogs = useMemo(() => {
    const list = taskId ? logs.filter((l) => l.taskId === taskId) : logs;
    return [...list].sort(
      (a, b) =>
        new Date(b.startedAt || b.finishedAt || 0).getTime() -
        new Date(a.startedAt || a.finishedAt || 0).getTime(),
    );
  }, [logs, taskId]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="w-[100vw] sm:w-[min(54rem,92vw)] data-[swipe-axis=x]:sm:[--drawer-content-width:min(54rem,92vw)] p-0">
        <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
          {/* 抽屉头部 */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
            <div className="flex items-center gap-2.5">
              <ClockIcon className="size-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  {currentTask ? `${currentTask.name} · 执行日志` : '全部定时任务日志'}
                </h2>
                <p className="text-[11px] text-muted-foreground font-mono">
                  共 {filteredLogs.length} 条记录
                  {currentTask && ` · ${currentTask.cron}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {filteredLogs.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => clearLogs(taskId ?? undefined)}
                >
                  <Trash2Icon className="mr-1.5 size-3.5" />
                  清空此项日志
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7"
                onClick={() => onOpenChange(false)}
                aria-label="关闭"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>

          {/* 日志内容区域 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {filteredLogs.length === 0 ? (
              <EmptyHint
                title="暂无执行记录"
                description={
                  currentTask
                    ? '任务尚未执行或历史日志已被清理。可在任务卡片点击“立即执行”触发一次运行。'
                    : '目前尚无任何任务运行日志。'
                }
              />
            ) : (
              filteredLogs.map((log) => (
                <LogCard key={log.id} log={log} />
              ))
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function LogCard({ log }: { log: ScheduleExecutionLog }) {
  const isSuccess = log.status === 'success';
  const isManual = log.triggerMode === 'manual';
  const durationText =
    typeof log.durationMs === 'number'
      ? `${(log.durationMs / 1000).toFixed(2)}s`
      : null;
  const timeDisplay = log.startedAt || log.finishedAt ? formatDateTime(log.startedAt || log.finishedAt!) : '';

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors text-xs',
        isSuccess
          ? 'border-border/70 bg-card/60'
          : 'border-destructive/30 bg-destructive/5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <CheckCircle2Icon className="size-4 text-emerald-500 shrink-0" />
          ) : (
            <XCircleIcon className="size-4 text-destructive shrink-0" />
          )}
          <span className="font-semibold text-foreground text-[13px]">
            {log.taskName}
          </span>
          <Badge
            variant="outline"
            className={cn(
              'font-mono text-[10px] px-1.5 py-0',
              isManual
                ? 'border-blue-500/30 text-blue-500 bg-blue-500/5'
                : 'border-purple-500/30 text-purple-500 bg-purple-500/5',
            )}
          >
            {isManual ? '手动执行' : 'Cron 定时'}
          </Badge>
          <Badge
            variant="outline"
            className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground"
          >
            {log.actionType}
          </Badge>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground shrink-0">
          {durationText && <span>耗时 {durationText}</span>}
          <span>{timeDisplay}</span>
        </div>
      </div>

      {/* 结果概要 */}
      <div className="mt-2 text-foreground/90 leading-relaxed font-mono text-[12px] break-all">
        {log.details || log.error || (isSuccess ? '执行成功' : '执行失败')}
      </div>

      {/* 分支合并特殊详情 (谨慎 / 激进) */}
      {log.mergeResult && (
        <div className="mt-3 rounded border border-border/80 bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitMergeIcon className="size-3.5 text-muted-foreground" />
              <span className="font-medium text-muted-foreground text-[11px]">
                分支同步与合并详情
              </span>
            </div>
            <div className="flex items-center gap-2">
              {log.mergeResult.strategy === 'aggressive' ? (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]"
                >
                  <ShieldCheckIcon className="mr-1 size-3" />
                  激进策略 · 零污染影子分支
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px]"
                >
                  <ShieldAlertIcon className="mr-1 size-3" />
                  谨慎策略 · 遇冲突终止
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div>
              <span className="text-muted-foreground">源分支：</span>
              <span className="text-foreground ml-1">{log.mergeResult.sourceBranch}</span>
            </div>
            <div>
              <span className="text-muted-foreground">目标分支：</span>
              <span className="text-foreground ml-1">{log.mergeResult.targetBranch}</span>
            </div>
            <div>
              <span className="text-muted-foreground">是否存在冲突：</span>
              <span
                className={cn(
                  'ml-1 font-semibold',
                  log.mergeResult.conflictDetected ? 'text-amber-500' : 'text-emerald-500',
                )}
              >
                {log.mergeResult.conflictDetected ? '检测到代码冲突' : '无代码冲突'}
              </span>
            </div>
            {log.mergeResult.shadowBranch && (
              <div className="flex items-center gap-1 col-span-2">
                <span className="text-muted-foreground">零污染隔离分支：</span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold select-all">
                  {log.mergeResult.shadowBranch}
                </span>
                <CopyButton text={log.mergeResult.shadowBranch} label="复制" />
              </div>
            )}
            {log.mergeResult.mrId && (
              <div className="col-span-2">
                <span className="text-muted-foreground">已创建合并请求：</span>
                <span className="text-primary font-semibold ml-1">
                  MR #{log.mergeResult.mrId}
                </span>
              </div>
            )}
            {log.error && (
              <div className="col-span-2 flex items-start gap-1 text-destructive">
                <AlertTriangleIcon className="size-3.5 shrink-0 mt-0.5" />
                <span>终止原因：{log.error}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 详细数据 Payload 展开 */}
      {log.details && (
        <details className="mt-2 text-[11px] font-mono text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            查看原始输出
          </summary>
          <pre className="mt-1.5 max-h-40 overflow-y-auto rounded bg-muted/60 p-2 text-[10px] text-foreground/80 leading-normal whitespace-pre-wrap break-all">
            {typeof log.details === 'object'
              ? JSON.stringify(log.details, null, 2)
              : String(log.details)}
          </pre>
        </details>
      )}
    </div>
  );
}
