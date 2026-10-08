import { useApp } from '../store/app';
import type { TracePipelineRun } from '../lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PipelineCard } from './PipelineCard';
import { RepoCiCard } from './RepoCiCard';
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
    <section className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {count !== undefined && <Badge variant="secondary">{count}</Badge>}
        {action && <span className="flex-1" />}
        {action}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
      <Separator />
    </section>
  );
}

export function TracePane() {
  const { category, trace, traceLoading, repositories, pipelines, runsByPipeline, loadTrace } = useApp();
  // runs 为 types.ts PipelineRunSummary 的超集（api.ts TracePipelineRun），追溯链路已增补分支/流水线信息
  const relatedRuns = (trace?.runs ?? []) as TracePipelineRun[];

  if (category === 'Req') {
    const repoTraces = trace?.repositories ?? [];
    return (
      <div className="h-full min-h-0 overflow-y-auto">
        <PanelCard
          title="需求关联仓库"
          count={repoTraces.length}
          action={
            <>
              {traceLoading && <span className="text-xs text-muted-foreground">扫描中…</span>}
              <Button variant="ghost" size="sm" onClick={() => void loadTrace()}>重扫</Button>
            </>
          }
        >
          {!repoTraces.length && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {traceLoading ? '正在读取需求关联…' : '此需求未关联仓库。可在需求详情中选择仓库。'}
            </div>
          )}
          {repoTraces.map((repoTrace) => {
            const repo = repositories.find((item) => item.id === repoTrace.repoId);
            const name = repo?.pathWithNamespace || repo?.name || `仓库 #${repoTrace.repoId}`;
            return (
              <article key={repoTrace.repoId} className="rounded-md border border-border bg-muted/20 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="min-w-0 truncate font-mono text-xs font-semibold text-foreground">{name}</h3>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {repoTrace.branches.length} 分支 · {repoTrace.commits.length} 提交 · {repoTrace.mergeRequests.length} MR
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] font-medium text-muted-foreground">分支</div>
                    {repoTrace.branches.map((branch) => (
                      <div key={branch.name} className="rounded bg-background/70 px-2 py-1.5 font-mono text-[11px] text-foreground">{branch.name}</div>
                    ))}
                    {!repoTrace.branches.length && <span className="px-2 text-[11px] text-muted-foreground">无关联分支</span>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] font-medium text-muted-foreground">提交</div>
                    {repoTrace.commits.map((commit) => (
                      <div key={commit.sha} className="flex min-w-0 items-center gap-2 rounded bg-background/70 px-2 py-1.5 text-[11px]" title={`${commit.authorName ?? ''} ${commit.committedDate ?? ''}`}>
                        <span className="shrink-0 font-mono text-muted-foreground">{commit.sha.slice(0, 7)}</span>
                        <span className="min-w-0 truncate text-foreground">{commit.message.split('\n')[0]}</span>
                      </div>
                    ))}
                    {!repoTrace.commits.length && <span className="px-2 text-[11px] text-muted-foreground">无关联提交</span>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] font-medium text-muted-foreground">合并请求</div>
                    {repoTrace.mergeRequests.map((request) => (
                      <div key={`${request.localId}-${request.title}`} className="flex min-w-0 items-center gap-2 rounded bg-background/70 px-2 py-1.5 text-[11px]">
                        <StatusDot status={request.state.includes('merged') || request.state.includes('MERGED') ? 'SUCCESS' : request.state.includes('open') || request.state.includes('OPEN') ? 'RUNNING' : 'OTHER'} />
                        <span className="min-w-0 truncate text-foreground" title={`${request.sourceBranch} → ${request.targetBranch}`}>
                          !{request.localId} {request.title}
                        </span>
                      </div>
                    ))}
                    {!repoTrace.mergeRequests.length && <span className="px-2 text-[11px] text-muted-foreground">无关联 MR</span>}
                  </div>
                  <RepoCiCard repoId={repoTrace.repoId} repoName={name} />
                </div>
              </article>
            );
          })}
        </PanelCard>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <PanelCard
        title="追溯链路"
        action={
          <>
            {traceLoading && <span className="text-xs text-muted-foreground">扫描中…</span>}
            <Button variant="ghost" size="sm" onClick={() => void loadTrace()}>重扫</Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            分支 <span className="ml-1 text-foreground">{trace?.branches.length ?? 0}</span>
          </div>
          {(trace?.branches ?? []).map((b) => (
            <div key={b.name} className="flex items-center gap-2 rounded-md bg-background/70 px-2.5 py-2 text-xs">
              <span className="text-muted-foreground">⑂</span>
              <span className="min-w-0 flex-1 truncate font-mono text-foreground">{b.name}</span>
            </div>
          ))}
          {trace && !trace.branches.length && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">无关联分支</div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            提交 <span className="ml-1 text-foreground">{trace?.commits.length ?? 0}</span>
          </div>
          {(trace?.commits ?? []).map((c) => (
            <div
              key={c.sha}
              className="flex items-center gap-2 rounded-md bg-background/70 px-2.5 py-2 text-xs"
              title={`${c.authorName ?? ''} ${c.committedDate ?? ''}`}
            >
              <span className="shrink-0 font-mono text-muted-foreground">{c.sha.slice(0, 7)}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{c.message.split('\n')[0]}</span>
            </div>
          ))}
          {trace && !trace.commits.length && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">无关联提交</div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            合并请求 <span className="ml-1 text-foreground">{trace?.mergeRequests.length ?? 0}</span>
          </div>
          {(trace?.mergeRequests ?? []).map((m) => (
            <div
              key={`${m.localId}-$${m.title}`}
              className="flex items-center gap-2 rounded-md bg-background/70 px-2.5 py-2 text-xs"
            >
              <StatusDot status={m.state.includes('merged') || m.state.includes('MERGED') ? 'SUCCESS' : m.state.includes('open') || m.state.includes('OPEN') ? 'RUNNING' : 'OTHER'} />
              <span className="min-w-0 flex-1 truncate text-foreground" title={`${m.sourceBranch} → ${m.targetBranch}`}>
                !{m.localId} {m.title}
              </span>
            </div>
          ))}
          {trace && !trace.mergeRequests.length && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">无关联 MR</div>
          )}
        </div>
      </PanelCard>

      <PanelCard title="关联运行" count={relatedRuns.length}>
        <div className="flex flex-col gap-1.5">
          {(trace?.runs ?? []).length > 0 && (
            <div className="text-xs font-medium text-muted-foreground">
              按分支匹配 <span className="ml-1 text-foreground">{relatedRuns.length}</span> 条运行
            </div>
          )}
          {relatedRuns.map((run) => (
            <div
              key={`${run.pipelineId ?? 0}-${run.pipelineRunId}`}
              className="flex min-w-0 items-center gap-2 rounded-md bg-background/70 px-2.5 py-2 text-xs"
              title={`${(run.branches ?? []).join('，')} · ${run.status}`}
            >
              <StatusDot status={run.status} />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {run.pipelineName ?? `流水线 #${run.pipelineId ?? '—'}`} <span className="text-muted-foreground">#{run.pipelineRunId}</span>
              </span>
              {(run.branches ?? []).length > 0 && (
                <span className="max-w-[40%] shrink-0 truncate font-mono text-muted-foreground">{run.branches!.join(', ')}</span>
              )}
              {(run.endTime ?? run.startTime) != null && (
                <span className="shrink-0 text-muted-foreground">
                  {new Date(run.endTime ?? run.startTime!).toLocaleString('zh-CN', { hour12: false })}
                </span>
              )}
            </div>
          ))}
          {trace && !relatedRuns.length && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              无关联运行（按工作项匹配分支 × 仓库绑定流水线近 20 条运行交叉）
            </div>
          )}
        </div>
      </PanelCard>

      <PanelCard title="流水线" count={pipelines.length}>
        <div className="flex flex-col gap-2">
          {pipelines.map((p) => (
            <PipelineCard
              key={p.pipelineId}
              pipelineId={p.pipelineId}
              pipelineName={p.pipelineName}
              runs={runsByPipeline[p.pipelineId] ?? []}
            />
          ))}
          {!pipelines.length && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">无流水线</div>
          )}
        </div>
      </PanelCard>
    </div>
  );
}
