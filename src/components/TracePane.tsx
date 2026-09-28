import { useApp } from '../store/app';
import { PipelineCard } from './PipelineCard';
import { StatusDot } from './StatusDot';

export function TracePane() {
  const { trace, traceLoading, pipelines, runsByPipeline, loadTrace } = useApp();

  return (
    <div className="pane" style={{ overflowY: 'auto' }}>
      <div className="panel">
        <div className="panel-title">
          追溯链路
          {traceLoading && <span className="count">扫描中…</span>}
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => void loadTrace()}>重扫</button>
        </div>

        <div className="trace-sec">
          <div className="panel-title" style={{ border: 'none', paddingTop: 0 }}>
            分支 <span className="count">{trace?.branches.length ?? 0}</span>
          </div>
          {(trace?.branches ?? []).map((b) => (
            <div key={b.name} className="trace-item">
              <span style={{ color: 'var(--sig-run)' }}>⑂</span>
              <span className="grow">{b.name}</span>
            </div>
          ))}
          {trace && !trace.branches.length && <div className="empty" style={{ padding: 8 }}>无关联分支</div>}
        </div>

        <div className="trace-sec">
          <div className="panel-title" style={{ border: 'none' }}>
            提交 <span className="count">{trace?.commits.length ?? 0}</span>
          </div>
          {(trace?.commits ?? []).map((c) => (
            <div key={c.sha} className="trace-item" title={`${c.authorName ?? ''} ${c.committedDate ?? ''}`}>
              <span className="muted">{c.sha.slice(0, 7)}</span>
              <span className="grow">{c.message.split('\n')[0]}</span>
            </div>
          ))}
          {trace && !trace.commits.length && <div className="empty" style={{ padding: 8 }}>无关联提交</div>}
        </div>

        <div className="trace-sec">
          <div className="panel-title" style={{ border: 'none' }}>
            合并请求 <span className="count">{trace?.mergeRequests.length ?? 0}</span>
          </div>
          {(trace?.mergeRequests ?? []).map((m) => (
            <div key={`${m.localId}-${m.title}`} className="trace-item">
              <StatusDot status={m.state.includes('merged') || m.state.includes('MERGED') ? 'SUCCESS' : m.state.includes('open') || m.state.includes('OPEN') ? 'RUNNING' : 'OTHER'} />
              <span className="grow" title={`${m.sourceBranch} → ${m.targetBranch}`}>
                !{m.localId} {m.title}
              </span>
            </div>
          ))}
          {trace && !trace.mergeRequests.length && <div className="empty" style={{ padding: 8 }}>无关联 MR</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">流水线 <span className="count">{pipelines.length}</span></div>
        {pipelines.map((p) => (
          <PipelineCard
            key={p.pipelineId}
            pipelineId={p.pipelineId}
            pipelineName={p.pipelineName}
            runs={runsByPipeline[p.pipelineId] ?? []}
          />
        ))}
        {!pipelines.length && <div className="empty" style={{ padding: 8 }}>无流水线</div>}
      </div>
    </div>
  );
}
