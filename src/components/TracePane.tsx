import { useApp } from '../store/app';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PipelineCard } from './PipelineCard';
import { StatusDot } from './StatusDot';

function PanelCard({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3 rounded-none border-0 border-b border-line bg-transparent py-2.5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 border-b border-line pb-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-2">
          {title}
          {count !== undefined && <Badge variant="secondary" className="font-mono">{count}</Badge>}
          {action && <span className="flex-1" />}
          {action}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3">{children}</CardContent>
    </Card>
  );
}

export function TracePane() {
  const { trace, traceLoading, pipelines, runsByPipeline, loadTrace } = useApp();

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <PanelCard
        title="追溯链路"
        action={
          <>
            {traceLoading && <span className="font-mono text-xs font-normal text-ink-1">扫描中…</span>}
            <Button variant="outline" size="sm" onClick={() => void loadTrace()}>重扫</Button>
          </>
        }
      >
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-2">
            分支 <span className="font-mono font-normal text-ink-1">{trace?.branches.length ?? 0}</span>
          </div>
          {(trace?.branches ?? []).map((b) => (
            <div key={b.name} className="mx-2 flex items-center gap-2 border-l-2 border-line bg-bg-1 px-2.5 py-1.5 font-mono text-[11.5px]">
              <span className="text-sig-run">⑂</span>
              <span className="min-w-0 flex-1 truncate text-ink-1">{b.name}</span>
            </div>
          ))}
          {trace && !trace.branches.length && <div className="p-2 text-center font-mono text-xs text-ink-2">无关联分支</div>}
        </div>

        <div className="mt-1 flex flex-col gap-1">
          <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-2">
            提交 <span className="font-mono font-normal text-ink-1">{trace?.commits.length ?? 0}</span>
          </div>
          {(trace?.commits ?? []).map((c) => (
            <div
              key={c.sha}
              className="mx-2 flex items-center gap-2 border-l-2 border-line bg-bg-1 px-2.5 py-1.5 font-mono text-[11.5px]"
              title={`${c.authorName ?? ''} ${c.committedDate ?? ''}`}
            >
              <span className="text-ink-2">{c.sha.slice(0, 7)}</span>
              <span className="min-w-0 flex-1 truncate text-ink-1">{c.message.split('\n')[0]}</span>
            </div>
          ))}
          {trace && !trace.commits.length && <div className="p-2 text-center font-mono text-xs text-ink-2">无关联提交</div>}
        </div>

        <div className="mt-1 flex flex-col gap-1">
          <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-2">
            合并请求 <span className="font-mono font-normal text-ink-1">{trace?.mergeRequests.length ?? 0}</span>
          </div>
          {(trace?.mergeRequests ?? []).map((m) => (
            <div key={`${m.localId}-${m.title}`} className="mx-2 flex items-center gap-2 border-l-2 border-line bg-bg-1 px-2.5 py-1.5 font-mono text-[11.5px]">
              <StatusDot status={m.state.includes('merged') || m.state.includes('MERGED') ? 'SUCCESS' : m.state.includes('open') || m.state.includes('OPEN') ? 'RUNNING' : 'OTHER'} />
              <span className="min-w-0 flex-1 truncate text-ink-1" title={`${m.sourceBranch} → ${m.targetBranch}`}>
                !{m.localId} {m.title}
              </span>
            </div>
          ))}
          {trace && !trace.mergeRequests.length && <div className="p-2 text-center font-mono text-xs text-ink-2">无关联 MR</div>}
        </div>
      </PanelCard>

      <PanelCard title="流水线" count={pipelines.length}>
        <div className="flex flex-col gap-1.5">
          {pipelines.map((p) => (
            <PipelineCard
              key={p.pipelineId}
              pipelineId={p.pipelineId}
              pipelineName={p.pipelineName}
              runs={runsByPipeline[p.pipelineId] ?? []}
            />
          ))}
          {!pipelines.length && <div className="p-2 text-center font-mono text-xs text-ink-2">无流水线</div>}
        </div>
      </PanelCard>
    </div>
  );
}
