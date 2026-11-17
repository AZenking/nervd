import type { PipelineRunSummary } from '../types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
        {/* 禁用态用 aria-disabled 而非原生 disabled：保留 hover/focus，Tooltip 才能解释「为什么不可点」 */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-disabled={!latest || undefined}
                className={latest ? undefined : 'text-muted-foreground opacity-70'}
                onPress={() => latest && void openPipelineRunLogs(pipelineId, latest.pipelineRunId, pipelineName)}
              >
                日志
              </Button>
            }
          />
          <TooltipContent>{latest ? '查看最近一次运行日志' : '暂无运行记录，无法查看日志'}</TooltipContent>
        </Tooltip>
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
