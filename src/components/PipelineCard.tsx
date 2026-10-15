import { useApp } from '../store/app';
import type { PipelineRunSummary } from '../types';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { StatusBadge } from './StatusBadge';
import { WriteOpButton } from './WriteOpButton';
import * as api from '../lib/api';
import { formatDateTime } from '../lib/format';
import { errorLog, humanizeError } from '@/lib/error-format';

const TRIGGER: Record<number, string> = { 1: '手动', 2: '定时', 3: '代码', 5: '流水线', 6: 'WEBHOOK' };

export function PipelineCard({
  pipelineId, pipelineName, runs,
}: { pipelineId: number; pipelineName: string; runs: PipelineRunSummary[] }) {
  const { setToast, loadRuns, openLogs } = useApp();
  const latest = runs[0];

  const openLatestLogs = async () => {
    if (!latest) return;
    try {
      const detail = await api.getPipelineRun(pipelineId, latest.pipelineRunId);
      const jobs =
        ((detail as Record<string, unknown>)?.pipelineRun as Record<string, unknown>)?.jobs ??
        (detail as Record<string, unknown>)?.jobs;
      const arr = (jobs as Record<string, unknown>)?.Job ?? (jobs as Record<string, unknown>)?.job ?? jobs;
      const first = Array.isArray(arr) ? (arr[0] as Record<string, unknown>) : null;
      const jobId = Number(first?.jobId ?? first?.id ?? 0);
      if (!jobId) throw new Error('未在运行详情中找到 job，无法取日志');
      void openLogs(pipelineId, latest.pipelineRunId, jobId, `${pipelineName} #${latest.pipelineRunId}`);
    } catch (e) {
      errorLog('pipeline.openLogs', e);
      setToast({ text: `日志查询失败：${humanizeError(e, '未能读取该运行的日志，请稍后重试')}`, kind: 'fail' });
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-2">
        <StatusBadge status={latest?.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-foreground">{pipelineName}</span>
        <WriteOpButton
          label="运行"
          title={`触发 ${pipelineName}`}
          onAction={async () => {
            try {
              await api.startPipelineRun(pipelineId);
              setToast({ text: `${pipelineName} 已触发`, kind: 'ok' });
              setTimeout(() => void loadRuns(pipelineId), 2500);
            } catch (e) {
              errorLog('pipeline.trigger', e);
              setToast({ text: `触发失败：${humanizeError(e, `${pipelineName} 触发失败，请稍后重试`)}`, kind: 'fail' });
            }
          }}
        />
        <Button variant="ghost" size="sm" disabled={!latest} onClick={() => void openLatestLogs()}>
          日志
        </Button>
      </div>
      {latest && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5">
            #{latest.pipelineRunId}
            <CopyButton text={String(latest.pipelineRunId)} label="复制运行号" />
          </span>
          <StatusBadge status={latest.status} size="sm" />
          <span>· {TRIGGER[latest.triggerMode ?? 0] ?? '—'}</span>
          {latest.endTime && (
            <span>· {formatDateTime(latest.endTime)}</span>
          )}
        </div>
      )}
    </div>
  );
}
