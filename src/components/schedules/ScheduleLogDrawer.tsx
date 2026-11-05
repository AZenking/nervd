import { useMemo } from 'react';
import { Button, Chip, Disclosure, Surface, Tooltip } from '@heroui/react';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  GitCommitIcon,
  GitMergeIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CopyButton } from '@/components/ui/copy-button';
import { EmptyHint } from '@/components/empty-hint';
import { useScheduleStore } from '@/store/schedule';
import { formatDateTime } from '@/lib/format';
import type { ScheduleExecutionLog } from '@/types/schedule';
import { ActionTypeTag } from './SchedulesView';
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
      <DrawerContent className="w-full sm:w-[min(54rem,92vw)] sm:max-w-none">
        <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
          {/* 抽屉头部 */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/80 px-6">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground shrink-0">
                <ClockIcon className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    {currentTask ? `${currentTask.name} · 执行日志` : '全部定时任务日志'}
                  </h2>
                  <Chip
                    size="sm"
                    variant="soft"
                    color="default"
                    className="font-mono text-[10px] h-4.5 px-1.5"
                  >
                    {filteredLogs.length} 条记录
                  </Chip>
                </div>
                {currentTask && (
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    调度周期: {currentTask.cron}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {filteredLogs.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onPress={() => clearLogs(taskId ?? undefined)}
                >
                  <Trash2Icon className="mr-1.5 size-3.5" />
                  清空日志
                </Button>
              )}
              <Tooltip>
                <Tooltip.Trigger>
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    onPress={() => onOpenChange(false)}
                    aria-label="关闭抽屉"
                  >
                    <XIcon className="size-4" />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content className="text-xs">关闭 (Esc)</Tooltip.Content>
              </Tooltip>
            </div>
          </div>

          {/* 日志内容区域 */}
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-3.5">
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
          </ScrollArea>
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
  const timeDisplay =
    log.startedAt || log.finishedAt
      ? formatDateTime(log.startedAt || log.finishedAt!)
      : '';

  return (
    <Surface
      variant="default"
      className={cn(
        'rounded-xl border border-border/70 p-4 transition-all hover:border-border text-xs space-y-3',
        !isSuccess && 'border-destructive/30 bg-destructive/5',
      )}
    >
      {/* 头部状态与标签 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {isSuccess ? (
            <CheckCircle2Icon className="size-4 text-success shrink-0" />
          ) : (
            <XCircleIcon className="size-4 text-destructive shrink-0" />
          )}
          <span className="font-semibold text-foreground text-[13px] tracking-tight">
            {log.taskName}
          </span>
          <Chip
            size="sm"
            variant="soft"
            color={isManual ? 'accent' : 'default'}
            className="font-mono text-[11px] h-5 px-1.5"
          >
            {isManual ? '手动执行' : 'Cron 定时'}
          </Chip>
          <ActionTypeTag type={log.actionType} />
        </div>

        <div className="flex items-center gap-2.5 font-mono text-[11px] text-muted-foreground shrink-0">
          {durationText && (
            <span className="flex items-center gap-1">
              <span>耗时</span>
              <span className="text-foreground/85 font-medium">{durationText}</span>
            </span>
          )}
          <span>{timeDisplay}</span>
        </div>
      </div>

      {/* 结果概要信息 */}
      <div className="text-foreground/90 leading-relaxed font-mono text-[12px] break-all bg-muted/20 rounded-md px-2.5 py-1.5 border border-border/50">
        {log.details || log.error || (isSuccess ? '执行成功，无额外输出' : '执行失败')}
      </div>

      {/* 分支合并特殊详情 (谨慎 / 激进) */}
      {log.mergeResult && (
        <Surface
          variant="secondary"
          className="rounded-lg border border-border/70 p-3.5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
              <GitMergeIcon className="size-3.5 text-primary shrink-0" />
              <span>分支同步与合并详情</span>
            </div>
            {log.mergeResult.strategy === 'aggressive' ? (
              <Chip size="sm" variant="soft" color="warning" className="gap-1 h-5 text-[11px]">
                <ShieldCheckIcon className="size-3" />
                <Chip.Label>激进策略 · 零污染影子分支</Chip.Label>
              </Chip>
            ) : (
              <Chip size="sm" variant="soft" color="accent" className="gap-1 h-5 text-[11px]">
                <ShieldAlertIcon className="size-3" />
                <Chip.Label>谨慎策略 · 遇冲突终止</Chip.Label>
              </Chip>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-1 text-xs">
            {/* 分支流动 */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span className="text-muted-foreground shrink-0 font-sans text-xs">分支流动:</span>
              <Chip size="sm" variant="secondary" className="font-mono text-[11px] h-5.5 px-2">
                {log.mergeResult.sourceBranch}
              </Chip>
              <ArrowRightIcon className="size-3 text-muted-foreground shrink-0" />
              <Chip size="sm" variant="secondary" color="accent" className="font-mono text-[11px] h-5.5 px-2">
                {log.mergeResult.targetBranch}
              </Chip>
            </div>

            {/* 冲突状态与 MR 汇总 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">冲突检测:</span>
              {log.mergeResult.conflictDetected ? (
                <Chip size="sm" variant="soft" color="danger" className="gap-1 h-5.5 text-[11px] font-medium">
                  <AlertTriangleIcon className="size-3" />
                  <Chip.Label>检测到代码冲突</Chip.Label>
                </Chip>
              ) : (
                <Chip size="sm" variant="soft" color="success" className="gap-1 h-5.5 text-[11px] font-medium">
                  <CheckCircle2Icon className="size-3" />
                  <Chip.Label>无代码冲突</Chip.Label>
                </Chip>
              )}

              {log.mergeResult.mrId && (
                <Chip size="sm" variant="soft" color="accent" className="font-mono text-[11px] h-5.5">
                  MR #{log.mergeResult.mrId}
                </Chip>
              )}
            </div>

            {log.mergeResult.shadowBranch && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 font-mono text-[11px]">
                <span className="text-muted-foreground font-sans text-xs shrink-0">零污染隔离分支:</span>
                <Chip size="sm" variant="soft" color="warning" className="font-mono text-[11px] h-5.5 select-all">
                  {log.mergeResult.shadowBranch}
                </Chip>
                <CopyButton text={log.mergeResult.shadowBranch} label="复制影子分支名" />
              </div>
            )}

            {/* 合并变更点列表 */}
            {log.mergeResult.commits && log.mergeResult.commits.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1.5 border-t border-border/40">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span className="flex items-center gap-1 text-foreground">
                    <GitCommitIcon className="size-3 text-primary" />
                    <span>合入变更点 ({log.mergeResult.commits.length})</span>
                  </span>
                  {typeof log.mergeResult.diffsCount === 'number' && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      涉及 {log.mergeResult.diffsCount} 个文件变更
                    </span>
                  )}
                </div>
                <div className="flex flex-col divide-y divide-border/30 rounded-lg border border-border/40 bg-background/60 overflow-hidden">
                  {log.mergeResult.commits.slice(0, 5).map((c) => (
                    <div key={c.id || c.shortId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <code className="font-mono text-primary font-semibold shrink-0">
                          {c.shortId || c.id.slice(0, 7)}
                        </code>
                        <span className="truncate text-foreground/90">{c.title}</span>
                        {c.workitems?.map((wi) => (
                          <Chip key={wi} size="sm" variant="soft" color="accent" className="h-4 px-1 text-[9px] font-mono shrink-0">
                            {wi}
                          </Chip>
                        ))}
                      </div>
                      {c.authorName && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{c.authorName}</span>
                      )}
                    </div>
                  ))}
                  {log.mergeResult.commits.length > 5 && (
                    <div className="py-1 text-center text-[10px] text-muted-foreground bg-muted/20 font-mono">
                      …还有 {log.mergeResult.commits.length - 5} 个变更点
                    </div>
                  )}
                </div>
              </div>
            )}

            {log.error && (
              <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/8 p-2 text-destructive text-[11px]">
                <AlertTriangleIcon className="size-3.5 shrink-0 mt-0.5" />
                <span>终止原因：{log.error}</span>
              </div>
            )}
          </div>
        </Surface>
      )}

      {/* 详细数据 Payload 展开（HeroUI Disclosure 原生折叠） */}
      {log.details && (
        <Disclosure className="text-xs">
          <Disclosure.Heading>
            <Disclosure.Trigger className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground outline-none">
              <span className="font-mono text-[11px]">查看原始输出</span>
              <Disclosure.Indicator className="size-3.5 text-muted-foreground" />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="p-0 pt-2">
              <Surface
                variant="secondary"
                className="overflow-hidden rounded-lg border border-border/70"
              >
                <Surface
                  variant="tertiary"
                  className="flex items-center justify-between border-b border-border/50 px-3 py-1.5 text-[10px] text-muted-foreground font-mono"
                >
                  <span className="font-semibold tracking-wider">RAW PAYLOAD</span>
                  <CopyButton
                    text={
                      typeof log.details === 'object'
                        ? JSON.stringify(log.details, null, 2)
                        : String(log.details)
                    }
                    label="复制"
                  />
                </Surface>
                <ScrollArea size={24} className="max-h-48">
                  <pre className="p-3 text-[11px] font-mono leading-relaxed text-foreground/90 whitespace-pre-wrap break-all select-text">
                    {typeof log.details === 'object'
                      ? JSON.stringify(log.details, null, 2)
                      : String(log.details)}
                  </pre>
                </ScrollArea>
              </Surface>
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      )}
    </Surface>
  );
}
