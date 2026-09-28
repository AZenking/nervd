import { useApp } from '../store/app';
import type { PipelineRunSummary } from '../types';
import { StatusDot } from './StatusDot';
import { WriteOpButton } from './WriteOpButton';
import * as api from '../lib/api';

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
      setToast({ text: String(e), kind: 'fail' });
    }
  };

  return (
    <div className="trace-item" style={{ display: 'block', padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusDot status={latest?.status} />
        <span className="grow" style={{ color: 'var(--ink-0)' }}>{pipelineName}</span>
        <WriteOpButton
          label="运行"
          title={`触发 ${pipelineName}`}
          onAction={async () => {
            try {
              await api.startPipelineRun(pipelineId);
              setToast({ text: `${pipelineName} 已触发`, kind: 'ok' });
              setTimeout(() => void loadRuns(pipelineId), 2500);
            } catch (e) { setToast({ text: String(e), kind: 'fail' }); }
          }}
        />
        <button className="btn btn-sm" disabled={!latest} onClick={() => void openLatestLogs()}>日志</button>
      </div>
      {latest && (
        <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
          #{latest.pipelineRunId} · {latest.status} · {TRIGGER[latest.triggerMode ?? 0] ?? '—'}
          {latest.endTime ? ` · ${new Date(latest.endTime).toLocaleString('zh-CN', { hour12: false })}` : ''}
        </div>
      )}
    </div>
  );
}
