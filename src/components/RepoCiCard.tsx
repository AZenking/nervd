import { useState } from 'react';
import * as api from '../lib/api';
import { useApp } from '../store/app';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon } from 'lucide-react';
import { StatusDot } from './StatusDot';
import { WriteOpButton } from './WriteOpButton';

function when(timestamp?: number): string {
  if (!timestamp) return '时间未知';
  return new Date(timestamp).toLocaleString();
}

function duration(durationMs?: number): string {
  if (durationMs == null) return '耗时未知';
  if (durationMs < 60_000) return `${Math.round(durationMs / 1000)} 秒`;
  return `${Math.floor(durationMs / 60_000)} 分 ${Math.round((durationMs % 60_000) / 1000)} 秒`;
}

export function RepoCiCard({ repoId, repoName }: { repoId: number; repoName: string }) {
  const { repoCiByRepo, loadRepoCi, openRepoCiLogs, setToast } = useApp();
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

  const trigger = async () => {
    try {
      await api.triggerRepoCi(repoId);
      setToast({ text: `${repoName} 的 CI Job 已触发`, kind: 'ok' });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await loadRepoCi(repoId);
    } catch (e) {
      setToast({ text: `触发 ${repoName} CI 失败：${String(e)}`, kind: 'fail' });
    }
  };

  return (
    <section className="rounded-md border border-border bg-background/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot status={snapshot?.status} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {snapshot?.name ?? 'CI 未配置'}
        </span>
        {snapshot && <span className="text-[10px] uppercase text-muted-foreground">{snapshot.provider}</span>}
        <Button variant="ghost" size="icon-sm" title="刷新 CI 状态" aria-label="刷新 CI 状态" disabled={refreshing || entry?.loading} onClick={() => void refresh()}>
          <RefreshCwIcon className={refreshing || entry?.loading ? 'animate-spin' : undefined} />
        </Button>
      </div>

      {entry?.error ? (
        <div className="mt-2 rounded bg-sig-fail/10 px-2 py-1.5 text-xs text-sig-fail">CI 查询失败：{entry.error}</div>
      ) : !snapshot && entry?.loading ? (
        <p className="mt-2 text-xs text-muted-foreground">读取 Job 状态…</p>
      ) : !snapshot ? (
        <p className="mt-2 text-xs text-muted-foreground">该仓库尚未绑定云效 Flow 或 Jenkins Job，可在设置中配置。</p>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">当前状态</span>
            <span className="font-mono text-foreground">{snapshot.status ?? '未知'}</span>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              最近构建 · 仓库 Job 历史
            </div>
            {snapshot.runs.map((run) => (
              <div key={run.runId} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded bg-muted/50 px-2 py-1.5 text-[11px]">
                <StatusDot status={run.status} />
                <span className="font-mono text-foreground">#{run.runId}</span>
                <span className="text-muted-foreground">{run.status}</span>
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
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
        <p className="text-[10px] text-muted-foreground">显示该仓库 Job 的近期记录，不按需求过滤。</p>
        <WriteOpButton label="触发构建" title="触发仓库当前 CI Job" onAction={trigger} />
      </div>
    );
  }
}
