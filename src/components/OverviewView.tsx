import { useEffect, useMemo } from 'react';
import { useApp } from '../store/app';
import { useUi } from '../store/ui';
import type { RunStatus } from '../types';
import { CATEGORY_LABELS } from '../types';
import { Button } from '@/components/ui/button';
import { PipelineCard } from './PipelineCard';
import { RepoCiCard } from './RepoCiCard';
import { StatusDot } from './StatusDot';

/** 运行状态归一：与 StatusDot 同一套语义分组 */
const runGroup = (status?: string): RunStatus => {
  const s = (status ?? '').toUpperCase();
  if (s === 'RUNNING' || s === 'WAITING') return 'RUNNING';
  if (s === 'SUCCESS') return 'SUCCESS';
  if (s === 'FAIL' || s === 'CANCELED') return 'FAIL';
  return 'OTHER';
};

/** 与 loadPipelines 保持一致：只为前 10 条流水线拉取运行记录 */
const PIPELINE_WALL_LIMIT = 10;

function StatCell({
  label,
  value,
  sub,
  dot,
}: {
  label: string;
  value: string;
  sub?: string;
  dot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-background px-4 py-3.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-xl font-medium text-foreground">{value}</span>
        {sub && <span className="min-w-0 truncate text-xs text-muted-foreground">{sub}</span>}
      </div>
      {dot && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{dot}</div>}
    </div>
  );
}

function SectionHead({ title, count, hint }: { title: string; count?: number; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {count !== undefined && (
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      )}
      {hint && (
        <>
          <span className="text-border">·</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </>
      )}
    </div>
  );
}

export function OverviewView() {
  const {
    settings, connection, category, items, pipelines, runsByPipeline,
    repositories, repoCiByRepo, loadList, loadPipelines, loadRepoCi, select,
  } = useApp();
  const openRequirement = useUi((s) => s.openRequirement);
  const watched = settings?.watchedRepos ?? [];

  // 进入总览时刷新：工作项列表（当前类别）+ 流水线运行 + 监控仓库 CI
  useEffect(() => {
    void loadList();
    void loadPipelines();
    void Promise.all(watched.map((repoId) => loadRepoCi(repoId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.watchedRepos]);

  // ---- 统计 ----
  const workitemStats = useMemo(() => {
    const assignees = new Set(items.map((i) => i.assignedTo).filter((a): a is string => !!a && a !== '—'));
    const byStatus = new Map<string, number>();
    for (const it of items) byStatus.set(it.status || '—', (byStatus.get(it.status || '—') ?? 0) + 1);
    return { total: items.length, assignees: assignees.size, byStatus };
  }, [items]);

  const pipelineStats = useMemo(() => {
    const latest = pipelines
      .map((p) => (runsByPipeline[p.pipelineId] ?? [])[0])
      .filter((r): r is NonNullable<typeof r> => !!r);
    const ok = latest.filter((r) => runGroup(r.status) === 'SUCCESS').length;
    const fail = latest.filter((r) => runGroup(r.status) === 'FAIL').length;
    const run = latest.filter((r) => runGroup(r.status) === 'RUNNING').length;
    const passRate = ok + fail > 0 ? Math.round((ok / (ok + fail)) * 100) : null;
    return { ok, fail, run, passRate };
  }, [pipelines, runsByPipeline]);

  const ciStats = useMemo(() => {
    let ok = 0, fail = 0, run = 0;
    for (const repoId of watched) {
      const g = runGroup(repoCiByRepo[repoId]?.snapshot?.status);
      if (g === 'SUCCESS') ok += 1;
      else if (g === 'FAIL') fail += 1;
      else if (g === 'RUNNING') run += 1;
    }
    return { ok, fail, run };
  }, [watched, repoCiByRepo]);

  const recentItems = useMemo(
    () =>
      [...items]
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
        .slice(0, 8),
    [items],
  );

  const statusRows = useMemo(
    () => [...workitemStats.byStatus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    [workitemStats.byStatus],
  );
  const statusMax = statusRows[0]?.[1] ?? 1;

  const refresh = () => {
    void loadList();
    void loadPipelines();
    void Promise.all(watched.map((repoId) => loadRepoCi(repoId)));
  };

  const openInWorkbench = (id: string) => {
    void select(id);
    openRequirement();
  };

  const repoName = (repoId: number) =>
    repositories.find((r) => r.id === repoId)?.pathWithNamespace
    ?? repositories.find((r) => r.id === repoId)?.name
    ?? `仓库 #${repoId}`;

  return (
    <div className="flex flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2">
        {/* 页头 */}
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold tracking-tight text-foreground">总览</h1>
          <span className="text-xs text-muted-foreground">
            {CATEGORY_LABELS[category]} · {settings?.defaultSpaceIdentifier ?? ''}
          </span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={refresh}>
            刷新
          </Button>
        </div>

        {/* 统计带：hairline 分隔的 4 格 */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
          <StatCell
            label="连接"
            value={connection === 'ok' ? '正常' : connection === 'fail' ? '失败' : '…'}
            sub={settings?.allowWriteOps ? '可写' : '只读'}
            dot={
              <>
                <StatusDot status={connection === 'ok' ? 'SUCCESS' : connection === 'fail' ? 'FAIL' : 'OTHER'} />
                <span className="truncate">{settings?.organizationId || '未配置组织'}</span>
              </>
            }
          />
          <StatCell
            label={`工作项 · ${CATEGORY_LABELS[category]}`}
            value={String(workitemStats.total)}
            sub={`${workitemStats.assignees} 人认领`}
          />
          <StatCell
            label="流水线"
            value={String(pipelines.length)}
            sub={
              pipelineStats.passRate != null
                ? `通过率 ${pipelineStats.passRate}%`
                : '暂无运行记录'
            }
            dot={
              <>
                {pipelineStats.run > 0 && <><StatusDot status="RUNNING" /> {pipelineStats.run} 运行中</>}
                {pipelineStats.fail > 0 && <><StatusDot status="FAIL" /> {pipelineStats.fail} 失败</>}
                {pipelineStats.run === 0 && pipelineStats.fail === 0 && pipelineStats.ok > 0 && (
                  <><StatusDot status="SUCCESS" /> 全部通过</>
                )}
                {pipelineStats.ok + pipelineStats.fail + pipelineStats.run === 0 && <span>—</span>}
              </>
            }
          />
          <StatCell
            label="仓库 CI"
            value={`${ciStats.ok + ciStats.fail + ciStats.run}/${watched.length}`}
            sub="监控仓库有状态"
            dot={
              <>
                {ciStats.run > 0 && <><StatusDot status="RUNNING" /> {ciStats.run}</>}
                {ciStats.fail > 0 && <><StatusDot status="FAIL" /> {ciStats.fail}</>}
                {!watched.length && <span>设置中未配置监控仓库</span>}
                {watched.length > 0 && ciStats.ok + ciStats.fail + ciStats.run === 0 && <span>暂无状态</span>}
              </>
            }
          />
        </section>

        {/* 流水线墙 */}
        <section>
          <SectionHead
            title="流水线"
            count={pipelines.length}
            hint={`最近 ${Math.min(pipelines.length, PIPELINE_WALL_LIMIT)} 条含运行记录`}
          />
          <div className="grid gap-3 md:grid-cols-2">
            {pipelines.slice(0, PIPELINE_WALL_LIMIT).map((p) => (
              <PipelineCard
                key={p.pipelineId}
                pipelineId={p.pipelineId}
                pipelineName={p.pipelineName}
                runs={runsByPipeline[p.pipelineId] ?? []}
              />
            ))}
            {!pipelines.length && (
              <div className="rounded-md border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                无流水线
              </div>
            )}
          </div>
        </section>

        {/* 监控仓库 CI */}
        <section>
          <SectionHead title="仓库 CI" count={watched.length} hint="设置中的监控仓库" />
          <div className="grid gap-3 md:grid-cols-2">
            {watched.map((repoId) => (
              <RepoCiCard key={repoId} repoId={repoId} repoName={repoName(repoId)} />
            ))}
            {!watched.length && (
              <div className="rounded-md border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                尚未配置监控仓库，可在设置中选择
              </div>
            )}
          </div>
        </section>

        {/* 工作项速览 */}
        <section>
          <SectionHead title={`工作项速览 · ${CATEGORY_LABELS[category]}`} count={workitemStats.total} hint="点击进入工作台" />
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-md border border-border bg-background p-4">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">状态分布</div>
              {statusRows.map(([status, count]) => (
                <div key={status} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 truncate text-foreground">{status}</span>
                  <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(count / statusMax) * 100}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">{count}</span>
                </div>
              ))}
              {!statusRows.length && <div className="py-4 text-center text-xs text-muted-foreground">暂无工作项</div>}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md border border-border bg-background p-4">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">最近更新</div>
              {recentItems.map((it) => (
                <Button
                  key={it.workitemId || it.identifier}
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-xs font-normal"
                  onClick={() => openInWorkbench(it.workitemId)}
                >
                  <span className="shrink-0 font-mono text-muted-foreground">{it.identifier}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{it.subject}</span>
                  <span className="shrink-0 text-muted-foreground">{it.updatedAt?.slice(0, 10) ?? ''}</span>
                </Button>
              ))}
              {!recentItems.length && <div className="py-4 text-center text-xs text-muted-foreground">暂无工作项</div>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
