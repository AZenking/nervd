import type { PipelineRunSummary } from '../types';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { StatusBadge } from './StatusBadge';
import { formatDateTime } from '../lib/format';
import { BuildWorkbenchTrigger, openPipelineRunLogs } from './build-workbench';

const TRIGGER: Record<number, string> = { 1: '手动', 2: '定时', 3: '代码', 5: '流水线', 6: 'WEBHOOK' };

export function PipelineCard({
  pipelineId, pipelineName, runs,
}: { pipelineId: number; pipelineName: string; runs: PipelineRunSummary[] }) {
  const latest = runs[0];

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-2">
        <StatusBadge status={latest?.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-foreground">{pipelineName}</span>
        <BuildWorkbenchTrigger
          target={{ kind: 'pipeline', pipelineId, title: pipelineName }}
          label="运行"
          title={`触发 ${pipelineName}`}
        />
        <Button variant="ghost" size="sm" disabled={!latest} onClick={() => latest && void openPipelineRunLogs(pipelineId, latest.pipelineRunId, pipelineName)}>
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
