import type { PipelineRunSummary } from '../types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { StatusBadge } from './StatusBadge';
import { formatDateTime } from '../lib/format';
import { BuildWorkbenchTrigger, openPipelineRunLogs } from './build-workbench';
import { OverflowTooltip } from './overflow-tooltip';

const TRIGGER: Record<number, string> = { 1: '手动', 2: '定时', 3: '代码', 5: '流水线', 6: 'WEBHOOK' };

export function PipelineCard({
  pipelineId, pipelineName, runs,
}: { pipelineId: number; pipelineName: string; runs: PipelineRunSummary[] }) {
  const latest = runs[0];

  return (
    <Card className="transition-colors">
      <div className="flex items-center gap-2">
        <StatusBadge status={latest?.status} />
        <OverflowTooltip
          text={pipelineName}
          className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-foreground"
        />
        <BuildWorkbenchTrigger
          target={{ kind: 'pipeline', pipelineId, title: pipelineName }}
          label="触发构建"
          title={`触发构建 ${pipelineName}`}
        />
        <Button variant="ghost" size="sm" disabled={!latest} onPress={() => latest && void openPipelineRunLogs(pipelineId, latest.pipelineRunId, pipelineName)}>
          日志
        </Button>
      </div>
      {latest && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5 font-mono tabular-nums">
            #{latest.pipelineRunId}
            <CopyButton text={String(latest.pipelineRunId)} label="复制运行号" />
          </span>
          <span>· {TRIGGER[latest.triggerMode ?? 0] ?? '—'}</span>
          {latest.endTime && (
            <span>· {formatDateTime(latest.endTime)}</span>
          )}
        </div>
      )}
    </Card>
  );
}
