import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/app';
import { useShallow } from 'zustand/react/shallow';
import { useUi, iterationsOrFallback, visibleIterations, scopedItems } from '../store/ui';
import type { RunStatus } from '../types';
import { CATEGORY_LABELS } from '../types';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Stat, StatBand } from '@/components/ui/stat';
import { cn } from '@/lib/utils';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { PageHeader } from './page-header';
import { SectionHeader } from './section-header';
import { StatusBadge, connectionStatus } from './StatusBadge';
import { StatusIcon } from './status-icon';
import { OverflowTooltip } from './overflow-tooltip';
import { WorkitemPeekDrawer } from './workitem-peek-drawer';
import { ciStatusInfo } from '@/lib/ci';
import { calculateIterationProgress } from '@/lib/iteration-period';
import { CycleHeaderBanner } from './overview/cycle-header-banner';
import { ActiveBuildsBar } from './overview/active-builds-bar';
import { QuickBuildConsole } from './overview/quick-build-console';
import { HealthDistributionCard } from './overview/health-distribution';

/** 运行状态归一：与 StatusBadge 同一套语义分组 */
const runGroup = (status?: string): RunStatus => {
  const tone = ciStatusInfo(status).tone;
  if (tone === 'run') return 'RUNNING';
  if (tone === 'ok') return 'SUCCESS';
  if (tone === 'fail') return 'FAIL';
  return 'OTHER';
};

export function OverviewView() {
  const {
    settings,
    connection,
    category,
    items,
    pipelines,
    runsByPipeline,
    repoCiByRepo,
    iterations,
    loadingList,
    loadList,
    loadPipelines,
    loadRepoCi,
    loadIterations,
  } = useApp(
    useShallow((s) => ({
      settings: s.settings,
      connection: s.connection,
      category: s.category,
      items: s.items,
      pipelines: s.pipelines,
      runsByPipeline: s.runsByPipeline,
      repoCiByRepo: s.repoCiByRepo,
      iterations: s.iterations,
      loadingList: s.loadingList,
      loadList: s.loadList,
      loadPipelines: s.loadPipelines,
      loadRepoCi: s.loadRepoCi,
      loadIterations: s.loadIterations,
    })),
  );

  const iterationKey = useUi((s) => s.iterationKey);
  const setIteration = useUi((s) => s.setIteration);
  const setIterationKey = useUi((s) => s.setIterationKey);
  const openWorkitem = useUi((s) => s.openWorkitem);
  const watched = settings?.watchedRepos ?? [];

  // 进入总览时并发刷新：工作项列表 + 迭代列表 + 流水线 + 监控仓库 CI
  useEffect(() => {
    void loadList();
    void loadIterations();
    void loadPipelines();
    void Promise.all(watched.map((repoId) => loadRepoCi(repoId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.watchedRepos]);

  // 计算可用迭代与当前迭代
  const visible = useMemo(
    () => visibleIterations(iterationsOrFallback(iterations)),
    [iterations],
  );

  const currentIteration = useMemo(() => {
    return (
      visible.find((it) => it.name === iterationKey) ||
      visible.find((it) => it.state === '进行中') ||
      visible[0] ||
      null
    );
  }, [visible, iterationKey]);

  // 当前迭代的工作项与完成度分析
  const iterationItems = useMemo(() => {
    if (!currentIteration) return items;
    return scopedItems(items, currentIteration.name, iterations);
  }, [items, currentIteration, iterations]);

  const iterationBreakdown = useMemo(
    () => calculateIterationProgress(iterationItems),
    [iterationItems],
  );

  // ---- 全局统计 ----
  const workitemStats = useMemo(() => {
    const assignees = new Set(
      items.map((i) => i.assignedTo).filter((a): a is string => !!a && a !== '—'),
    );
    return { total: items.length, assignees: assignees.size };
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
    let ok = 0,
      fail = 0,
      run = 0;
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

  const refresh = () => {
    void loadList();
    void loadIterations();
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        sticky
        navigation={<SidebarTrigger aria-label="折叠/展开侧栏" />}
        title="总览"
        titleClassName="text-sm font-semibold tracking-tight text-foreground"
        scope={<span className="text-xs text-muted-foreground">{CATEGORY_LABELS[category]}</span>}
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="刷新总览数据"
            onClick={refresh}
          >
            <RefreshCwIcon />
          </Button>
        }
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-1">
        {/* 1. Linear 标志性 Cycle Header 迭代周期横幅 */}
        <CycleHeaderBanner
          iteration={currentIteration}
          iterations={visible}
          breakdown={iterationBreakdown}
          onOpenIterationWorkbench={(name) => setIteration(name)}
          onSelectIteration={(name) => setIterationKey(name)}
        />

        {/* 2. 动态活跃构建监控带（仅当有 Jenkins 或 Flow 任务正在执行时滑出） */}
        <ActiveBuildsBar />

        {/* 3. 页面内嵌快速构建控制台（零弹窗：最近执行平铺 + 就地自定义参数配置与触发） */}
        <QuickBuildConsole />

        {/* 4. 精炼核心指标带：hairline 分隔的 4 格 */}
        <StatBand>
          <Stat
            label="连接"
            value={connection === 'ok' ? '正常' : connection === 'fail' ? '失败' : '获取中'}
            sub={settings?.allowWriteOps ? '可写' : '只读'}
          >
            <StatusBadge status={connectionStatus(connection)} />
            <OverflowTooltip
              text={settings?.organizationId || '未配置组织'}
              className="min-w-0 truncate"
            />
          </Stat>
          <Stat
            label={currentIteration ? `当前迭代 · ${currentIteration.name}` : `工作项 · ${CATEGORY_LABELS[category]}`}
            value={String(iterationBreakdown.total)}
            sub={`${iterationBreakdown.completed} 已完成 · ${iterationBreakdown.percent}%`}
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
            sub="默认监控仓库状态"
          >
            {ciStats.run > 0 && <><StatusBadge status="RUNNING" size="sm" /> {ciStats.run}</>}
            {ciStats.fail > 0 && <><StatusBadge status="FAIL" size="sm" /> {ciStats.fail}</>}
            {!watched.length && <span>未配置默认仓库</span>}
            {watched.length > 0 && ciStats.ok + ciStats.fail + ciStats.run === 0 && <span>暂无状态</span>}
          </Stat>
        </StatBand>

        {/* 4. 工作项速览双栏：健康度语义柱状图 + 最近更新无边框裸行 */}
        <section className="flex flex-col gap-3">
          <SectionHeader
            title={`工作项速览 · ${CATEGORY_LABELS[category]}`}
            count={workitemStats.total}
            hint="点击右侧条目就地滑出详情抽屉"
          />
          <div className="flex flex-col gap-4 lg:flex-row">
            {/* 左栏：生命周期语义排序的状态分布图谱 */}
            <HealthDistributionCard
              items={iterationItems}
              loading={loadingList}
              title={currentIteration ? `状态分布 · ${currentIteration.name}` : '状态分布'}
            />

            {/* 右栏：最近更新裸行（Border-less Raw Rows） */}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between text-[13px] font-medium">
                <span className="font-semibold tracking-tight text-foreground">最近更新</span>
                <span className="text-xs text-muted-foreground">共 {items.length} 项</span>
              </div>

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
              ) : recentItems.length > 0 ? (
                <div className="flex flex-col gap-0.5 pt-1">
                  {recentItems.map((it) => (
                    <Button
                      key={it.workitemId || it.identifier}
                      type="button"
                      variant="ghost"
                      className={cn(
                        'h-auto w-full justify-start gap-2.5 rounded px-2.5 py-2 text-xs font-normal transition-colors hover:bg-muted/60',
                        it.workitemId === drawerWorkitemId && 'bg-accent font-medium',
                      )}
                      onClick={() => openDetail(it)}
                    >
                      <StatusIcon status={it.status} className="size-3.5 shrink-0" />
                      <span className="shrink-0 font-mono text-muted-foreground">{it.identifier}</span>
                      <OverflowTooltip text={it.subject} className="min-w-0 flex-1 truncate text-foreground" />
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{it.updatedAt?.slice(0, 10) ?? ''}</span>
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">暂无工作项</div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Linear Peek View 抽屉：点击最近更新条目就地滑出，保留总览大盘底层上下文 */}
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
