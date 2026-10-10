import { useState } from 'react';
import { useApp } from '../store/app';
import { triggerRepoCiWithFeedback } from '../lib/ci';
import { formatDateTime, formatDuration } from '../lib/format';
import { humanizeError } from '@/lib/error-format';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from './StatusBadge';
import { WriteOpButton } from './WriteOpButton';

function when(timestamp?: number): string {
  if (!timestamp) return '时间未知';
  return formatDateTime(timestamp);
}

function duration(durationMs?: number): string {
  if (durationMs == null) return '耗时未知';
  return formatDuration(durationMs);
}

/** CI 提供方展示名（与设置/详情抽屉同口径，不再直出原始枚举） */
const PROVIDER_LABELS: Record<string, string> = { JENKINS: 'Jenkins', FLOW: '云效 Flow' };

export function RepoCiCard({ repoId, repoName }: { repoId: number; repoName: string }) {
  const { repoCiByRepo, loadRepoCi, openRepoCiLogs } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const entry = repoCiByRepo[repoId];
  const snapshot = entry?.snapshot;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadRepoCi(repoId);
    } finally {
      setRefreshing(false);
    }
  };

  const trigger = () =>
    triggerRepoCiWithFeedback(repoId, repoName, {
      okText: `${repoName} 的 CI Job 已触发`,
      failText: `触发 ${repoName} CI 失败`,
      refreshDelayMs: 1200,
    });

  return (
    <section className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/35">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={snapshot?.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-foreground">
          {snapshot?.name ?? 'CI 未配置'}
        </span>
        {snapshot && <span className="text-xs text-muted-foreground">{PROVIDER_LABELS[snapshot.provider.toUpperCase()] ?? snapshot.provider}</span>}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="刷新 CI 状态"
                disabled={refreshing || entry?.loading}
                onClick={() => void refresh()}
              />
            }
          >
            <RefreshCwIcon className={refreshing || entry?.loading ? 'animate-spin' : undefined} />
          </TooltipTrigger>
          <TooltipContent>刷新 CI 状态</TooltipContent>
        </Tooltip>
      </div>

      {entry?.error ? (
        <div className="mt-3 rounded-md border border-sig-fail/20 bg-sig-fail/8 px-3 py-2 text-xs text-sig-fail">CI 查询失败：{humanizeError(entry.error, '未能获取 CI 状态，请稍后重试')}</div>
      ) : !snapshot && entry?.loading ? (
        <p className="mt-2 text-xs text-muted-foreground">读取 Job 状态…</p>
      ) : !snapshot ? (
        <p className="mt-2 text-xs text-muted-foreground">该仓库尚未绑定云效 Flow 或 Jenkins Job，可在设置中配置。</p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
            <span className="text-muted-foreground">当前状态</span>
            <StatusBadge status={snapshot.status} />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="eyebrow">
              最近构建 · 仓库 Job 历史
            </div>
            {snapshot.runs.map((run) => (
              <div key={run.runId} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-muted/45 px-2.5 py-2 text-xs">
                <StatusBadge status={run.status} size="sm" />
                <span className="font-log text-foreground">#{run.runId}</span>
                <span className="ml-auto text-muted-foreground">{when(run.startTime)}</span>
                <span className="text-muted-foreground">{duration(run.durationMs)}</span>
                <Button variant="ghost" size="xs" onClick={() => void openRepoCiLogs(repoId, run.runId, `${repoName} · ${snapshot.name} #${run.runId}`)}>
                  查看日志
                </Button>
              </div>
            ))}
            {!snapshot.runs.length && <p className="px-2 py-2 text-xs text-muted-foreground">此 Job 尚无构建记录。</p>}
          </div>
          {runTrigger()}
        </>
      )}
    </section>
  );

  function runTrigger() {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">显示该仓库 Job 的近期记录，不按需求过滤。</p>
        <WriteOpButton label="触发构建" title="触发仓库当前 CI Job" onAction={trigger} />
      </div>
    );
  }
}
