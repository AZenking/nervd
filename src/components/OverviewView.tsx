import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/app';
import { useUi } from '../store/ui';
import type { RunStatus } from '../types';
import { CATEGORY_LABELS } from '../types';
import { DatabaseIcon, Link2Icon, RefreshCwIcon, WorkflowIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Stat, StatBand } from '@/components/ui/stat';
import { cn } from '@/lib/utils';
import { STICKY_PAGE_HEADER_CLASS } from './page-header';
import { EmptyHint } from './empty-hint';
import { SectionHeader } from './section-header';
import { PipelineCard } from './PipelineCard';
import { RepoCiCard } from './RepoCiCard';
import { StatusBadge, connectionStatus } from './StatusBadge';
import { StatusIcon } from './status-icon';
import { WorkitemPeekDrawer } from './workitem-peek-drawer';

/** 运行状态归一：与 StatusBadge 同一套语义分组 */
const runGroup = (status?: string): RunStatus => {
  const s = (status ?? '').toUpperCase();
  if (s === 'RUNNING' || s === 'WAITING') return 'RUNNING';
  if (s === 'SUCCESS') return 'SUCCESS';
  if (s === 'FAIL' || s === 'CANCELED') return 'FAIL';
  return 'OTHER';
};

/** 与 loadPipelines 保持一致：只为前 10 条流水线拉取运行记录 */
const PIPELINE_WALL_LIMIT = 10;

export function OverviewView() {
  const {
    settings, connection, category, items, pipelines, runsByPipeline,
    repositories, repoCiByRepo, loadList, loadPipelines, loadRepoCi,
    loadingList, loadingPipelines,
  } = useApp();
  const openWorkitem = useUi((s) => s.openWorkitem);
  const openSettings = useUi((s) => s.openSettings);
  const watched = settings?.watchedRepos ?? [];

  // 进入总览时刷新：工作项列表（当前类别）+ 流水线运行 + 默认云效仓库 CI
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

  const [drawerWorkitemId, setDrawerWorkitemId] = useState<string | null>(null);

  const openDetail = (it: (typeof recentItems)[number]) => {
    setDrawerWorkitemId(it.workitemId);
    void useApp.getState().select(it.workitemId);
  };

  const openInWorkbench = (id: string, identifier: string, subject: string) => {
    setDrawerWorkitemId(null);
    openWorkitem(id, { workitemId: id, identifier, subject });
  };

  const repoName = (repoId: number) =>
    repositories.find((r) => r.id === repoId)?.pathWithNamespace
    ?? repositories.find((r) => r.id === repoId)?.name
    ?? `仓库 #${repoId}`;

  return (
    <div className="flex flex-col gap-6">
      <header className={STICKY_PAGE_HEADER_CLASS}>
        <div className="flex min-h-9 items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">总览</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[category]}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="刷新"
              onClick={refresh}
            >
              <RefreshCwIcon />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 py-1">
        {/* 统计带：hairline 分隔的 4 格（StatBand 默认列数 xs:1 / sm:2 / lg:4） */}
        <StatBand>
          <Stat
            label="连接"
            value={connection === 'ok' ? '正常' : connection === 'fail' ? '失败' : '获取中'}
            sub={settings?.allowWriteOps ? '可写' : '只读'}
          >
            <StatusBadge status={connectionStatus(connection)} />
            <span className="truncate">{settings?.organizationId || '未配置组织'}</span>
          </Stat>
          <Stat
            label={`工作项 · ${CATEGORY_LABELS[category]}`}
            value={String(workitemStats.total)}
            sub={`${workitemStats.assignees} 人认领`}
          />
          <Stat
            label="流水线"
            value={String(pipelines.length)}
            sub={
              pipelineStats.passRate != null
                ? `通过率 ${pipelineStats.passRate}%`
                : '暂无运行记录'
            }
          >
            {pipelineStats.run > 0 && <><StatusBadge status="RUNNING" size="sm" /> {pipelineStats.run}</>}
            {pipelineStats.fail > 0 && <><StatusBadge status="FAIL" size="sm" /> {pipelineStats.fail}</>}
            {pipelineStats.run === 0 && pipelineStats.fail === 0 && pipelineStats.ok > 0 && (
              <StatusBadge status="SUCCESS" label="全部通过" size="sm" />
            )}
            {pipelineStats.ok + pipelineStats.fail + pipelineStats.run === 0 && <span>—</span>}
          </Stat>
          <Stat
            label="仓库 CI"
            value={`${ciStats.ok + ciStats.fail + ciStats.run}/${watched.length}`}
            sub="默认云效仓库有状态"
          >
            {ciStats.run > 0 && <><StatusBadge status="RUNNING" size="sm" /> {ciStats.run}</>}
            {ciStats.fail > 0 && <><StatusBadge status="FAIL" size="sm" /> {ciStats.fail}</>}
            {!watched.length && <span>未配置默认云效仓库</span>}
            {watched.length > 0 && ciStats.ok + ciStats.fail + ciStats.run === 0 && <span>暂无状态</span>}
          </Stat>
        </StatBand>

        {/* 流水线墙 */}
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="流水线"
            count={pipelines.length}
            hint={`最近 ${Math.min(pipelines.length, PIPELINE_WALL_LIMIT)} 条含运行记录`}
          />
          <div className="grid gap-3 md:grid-cols-2">
            {loadingPipelines && !pipelines.length ? (
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card px-5 py-4" aria-hidden>
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-3.5 rounded-full" />
                    <Skeleton className="h-4 w-40 rounded" />
                    <Skeleton className="ml-auto h-7 w-12 rounded" />
                    <Skeleton className="h-7 w-12 rounded" />
                  </div>
                  <div className="flex items-center gap-2 border-t border-border pt-2.5">
                    <Skeleton className="h-3.5 w-16 rounded" />
                    <Skeleton className="h-3.5 w-24 rounded" />
                  </div>
                </div>
              ))
            ) : (
              pipelines.slice(0, PIPELINE_WALL_LIMIT).map((p) => (
                <PipelineCard
                  key={p.pipelineId}
                  pipelineId={p.pipelineId}
                  pipelineName={p.pipelineName}
                  runs={runsByPipeline[p.pipelineId] ?? []}
                />
              ))
            )}
            {!loadingPipelines && !pipelines.length && (
              <EmptyHint
                icon={WorkflowIcon}
                title="无流水线"
                description="绑定云效 Flow 流水线或 Jenkins Job 后，构建状态会汇入这里"
                action={
                  <Button variant="outline" size="sm" onClick={() => openSettings('ci')}>
                    <Link2Icon data-icon="inline-start" />
                    去绑定 CI
                  </Button>
                }
                className="md:col-span-2"
              />
            )}
          </div>
        </section>

        {/* 默认云效仓库 CI */}
        <section className="flex flex-col gap-3">
          <SectionHeader title="仓库 CI" count={watched.length} hint="设置中的默认云效仓库" />
          <div className="grid gap-3 md:grid-cols-2">
            {watched.length > 0 && watched.every((repoId) => repoCiByRepo[repoId]?.loading && !repoCiByRepo[repoId]?.snapshot) ? (
              watched.map((repoId) => (
                <div key={repoId} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5" aria-hidden>
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-3.5 rounded-full" />
                    <Skeleton className="h-4 w-36 rounded" />
                    <Skeleton className="ml-auto h-4 w-16 rounded" />
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    <Skeleton className="h-4 w-3/4 rounded" />
                    <Skeleton className="h-3.5 w-1/2 rounded" />
                  </div>
                </div>
              ))
            ) : (
              watched.map((repoId) => (
                <RepoCiCard key={repoId} repoId={repoId} repoName={repoName(repoId)} />
              ))
            )}
            {!watched.length && (
              <EmptyHint
                icon={DatabaseIcon}
                title="未配置默认云效仓库"
                description="可在「设置 → 追溯与云效仓库」中选择"
                className="md:col-span-2"
              />
            )}
          </div>
        </section>

        {/* 工作项速览 */}
        <section className="flex flex-col gap-3">
          <SectionHeader title={`工作项速览 · ${CATEGORY_LABELS[category]}`} count={workitemStats.total} hint="点击进入工作台" />
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-lg border border-border bg-card p-5">
              <div className="text-[13px] font-medium text-muted-foreground">状态分布</div>
              {loadingList && !items.length ? (
                <div className="flex flex-col gap-3 py-1" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-3.5 rounded-full shrink-0" />
                      <Skeleton className="h-3.5 w-16 shrink-0" />
                      <Skeleton className="h-2 flex-1 rounded-full" />
                      <Skeleton className="h-3.5 w-6 shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                statusRows.map(([status, count]) => (
                  <div key={status} className="flex items-center gap-3 text-xs">
                    <StatusIcon status={status} className="size-3.5 shrink-0" />
                    <span className="w-20 shrink-0 truncate text-foreground">{status}</span>
                    <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(count / statusMax) * 100}%` }} />
                    </div>
                    <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">{count}</span>
                  </div>
                ))
              )}
              {!loadingList && !statusRows.length && <div className="py-4 text-center text-xs text-muted-foreground">暂无工作项</div>}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg border border-border bg-card p-5">
              <div className="text-[13px] font-medium text-muted-foreground">最近更新</div>
              {loadingList && !items.length ? (
                <div className="flex flex-col gap-1.5 py-1" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-2">
                      <Skeleton className="size-3.5 rounded-full shrink-0" />
                      <Skeleton className="h-3.5 w-16 shrink-0" />
                      <Skeleton className="h-3.5 flex-1 rounded" style={{ width: `${40 + ((i * 13) % 35)}%` }} />
                      <Skeleton className="h-3.5 w-20 shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                recentItems.map((it) => (
                  <Button
                    key={it.workitemId || it.identifier}
                    type="button"
                    variant="ghost"
                    className={cn(
                      'h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-xs font-normal transition-colors',
                      it.workitemId === drawerWorkitemId && 'bg-accent font-medium',
                    )}
                    onClick={() => openDetail(it)}
                  >
                    <StatusIcon status={it.status} className="size-3.5 shrink-0" />
                    <span className="shrink-0 font-mono text-muted-foreground">{it.identifier}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{it.subject}</span>
                    <span className="shrink-0 text-muted-foreground">{it.updatedAt?.slice(0, 10) ?? ''}</span>
                  </Button>
                ))
              )}
              {!loadingList && !recentItems.length && <div className="py-4 text-center text-xs text-muted-foreground">暂无工作项</div>}
            </div>
          </div>
        </section>
      </div>

      {/* 需求详情抽屉（Linear Peek View）：就地滑出，保留总览仪表盘上下文 */}
      <WorkitemPeekDrawer
        workitemId={drawerWorkitemId}
        onClose={() => setDrawerWorkitemId(null)}
        onOpenWorkbench={(id, identifier, subject) => {
          openInWorkbench(id, identifier ?? '', subject ?? '');
        }}
      />
    </div>
  );
}
