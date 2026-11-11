import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, ProgressBar } from '@heroui/react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCwIcon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useApp } from '../store/app';
import { useUi, UNPLANNED_ITERATION, visibleIterations } from '../store/ui';
import type { Category } from '../types';
import { CATEGORY_LABELS } from '../types';
import { cn } from '@/lib/utils';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { PageHeader } from './page-header';
import { StatusBadge, connectionStatus, statusMeta } from './StatusBadge';
import { StatusIcon } from './status-icon';
import { WorkitemPeekDrawer } from './workitem-peek-drawer';
import { ciStatusInfo } from '@/lib/ci';
import { calculateSprintRemaining } from '@/lib/iteration-period';
import { scopeOverviewItems, sortRecentOverviewItems } from '@/lib/overview-metrics';
import { CycleHeaderBanner } from './overview/cycle-header-banner';
import { KpiCardsGrid } from './overview/kpi-cards-grid';
import { QuickBuildConsole } from './overview/quick-build-console';
import { WorkitemStatusChart } from './overview/workitem-status-chart';
import { WorkitemUpdateActivityChart } from './overview/workitem-update-activity-chart';
import { RepoCiSummary, FlowPipelineSummary } from './overview/delivery-status';
import { WorkitemsDataTable } from './overview/workitems-data-table';

const OVERVIEW_CATEGORIES: Category[] = ['Req', 'Bug', 'Task'];

function isFailure(status?: string | null): boolean {
  return ciStatusInfo(status).tone === 'fail';
}

export function OverviewView() {
  const {
    settings,
    connection,
    pipelines,
    runsByPipeline,
    repoCiByRepo,
    loadPipelines,
    loadRepoCi,
    overviewByCategory,
    overviewIterations,
    loadOverviewCategory,
    loadOverviewIterations,
  } = useApp(
    useShallow((state) => ({
      settings: state.settings,
      connection: state.connection,
      pipelines: state.pipelines,
      runsByPipeline: state.runsByPipeline,
      repoCiByRepo: state.repoCiByRepo,
      loadPipelines: state.loadPipelines,
      loadRepoCi: state.loadRepoCi,
      overviewByCategory: state.overviewByCategory,
      overviewIterations: state.overviewIterations,
      loadOverviewCategory: state.loadOverviewCategory,
      loadOverviewIterations: state.loadOverviewIterations,
    })),
  );

  const iterationKey = useUi((state) => state.iterationKey);
  const setIteration = useUi((state) => state.setIteration);
  const setIterationKey = useUi((state) => state.setIterationKey);
  const openWorkitem = useUi((state) => state.openWorkitem);
  const [activeCategory, setActiveCategory] = useState<Category>('Req');
  const [selectedIterationId, setSelectedIterationId] = useState<string | null>(null);
  const [drawerWorkitemId, setDrawerWorkitemId] = useState<string | null>(null);

  const watchedRepos = settings?.watchedRepos ?? [];
  const ciBoundRepos = useMemo(() => {
    if (!settings?.repoCiBindings) return [];
    return Object.keys(settings.repoCiBindings)
      .map(Number)
      .filter((id) => !isNaN(id) && id > 0);
  }, [settings?.repoCiBindings]);
  const overviewCiRepoIds = useMemo(() => {
    return Array.from(new Set([...watchedRepos, ...ciBoundRepos]));
  }, [watchedRepos, ciBoundRepos]);
  const overviewCiRepoIdsKey = overviewCiRepoIds.join(',');
  const dataContextKey = `${settings?.organizationId ?? ''}:${settings?.defaultSpaceIdentifier ?? ''}`;
  const activeCategoryState = overviewByCategory[activeCategory];

  // 进入总览时只加载默认类别；其他类别由 Tabs 首次激活时加载并复用缓存。
  useEffect(() => {
    void loadOverviewIterations();
    void loadOverviewCategory('Req');
    void loadPipelines();
    void Promise.all(overviewCiRepoIds.map((repoId) => loadRepoCi(repoId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataContextKey, overviewCiRepoIdsKey]);

  useEffect(() => {
    void loadOverviewCategory(activeCategory);
  }, [activeCategory, dataContextKey, loadOverviewCategory]);

  const availableIterations = useMemo(() => {
    if (overviewIterations.status !== 'success') return [];
    const visible = visibleIterations(overviewIterations.items);
    // 只有真实 list_iterations 成功后才允许追加「未规划」桶。
    return overviewIterations.items.length > 0 ? [...visible, UNPLANNED_ITERATION] : visible;
  }, [overviewIterations.items, overviewIterations.status]);

  const currentIteration = useMemo(() => {
    return (
      availableIterations.find((iteration) => iteration.id === selectedIterationId) ??
      availableIterations.find((iteration) => iteration.name === iterationKey) ??
      availableIterations.find((iteration) => iteration.state === '进行中') ??
      availableIterations[0] ??
      null
    );
  }, [availableIterations, iterationKey, selectedIterationId]);

  useEffect(() => {
    if (!currentIteration) return;
    if (selectedIterationId !== currentIteration.id) setSelectedIterationId(currentIteration.id);
    if (iterationKey !== currentIteration.name) setIterationKey(currentIteration.name);
  }, [currentIteration, iterationKey, selectedIterationId, setIterationKey]);

  const iterationItems = useMemo(() => {
    if (!currentIteration || overviewIterations.status !== 'success') return [];
    return scopeOverviewItems(activeCategoryState.items, currentIteration);
  }, [activeCategoryState.items, currentIteration, overviewIterations.status]);

  const recentItems = useMemo(
    () => sortRecentOverviewItems(iterationItems).slice(0, 8),
    [iterationItems],
  );

  const attention = useMemo(() => {
    const failedBuilds = [
      ...pipelines.map((pipeline) => runsByPipeline[pipeline.pipelineId]?.[0]?.status),
      ...watchedRepos.map((repoId) => {
        const entry = repoCiByRepo[repoId];
        return entry?.error ? 'FAIL' : entry?.snapshot?.status || entry?.snapshot?.runs?.[0]?.status;
      }),
    ].filter((status) => isFailure(status)).length;
    const ciErrors = watchedRepos.filter((repoId) => Boolean(repoCiByRepo[repoId]?.error)).length;
    const unboundCi = watchedRepos.filter((repoId) => !settings?.repoCiBindings?.[String(repoId)]).length;
    return { failedBuilds, ciErrors, unboundCi };
  }, [pipelines, repoCiByRepo, runsByPipeline, settings?.repoCiBindings, watchedRepos]);

  const refresh = () => {
    void loadOverviewIterations({ refresh: true });
    void loadOverviewCategory(activeCategory, { refresh: true });
    void loadPipelines();
    void Promise.all(overviewCiRepoIds.map((repoId) => loadRepoCi(repoId)));
  };

  const openDetail = (item: (typeof recentItems)[number]) => {
    setDrawerWorkitemId(item.workitemId);
    // 详情 API 仍走现有选择链路；把当前类别同步给共享详情层，但不触发旧列表加载。
    useApp.setState({ category: activeCategory });
    void useApp.getState().select(item.workitemId);
  };

  const openInWorkbench = (id: string, identifier: string, subject: string) => {
    setDrawerWorkitemId(null);
    openWorkitem(id, { workitemId: id, identifier, subject });
  };

  const iterationLoading = overviewIterations.status === 'loading';
  const categoryLoading = activeCategoryState.status === 'loading' || activeCategoryState.status === 'refreshing';
  const showWorkitemContent = overviewIterations.status === 'success' && Boolean(currentIteration);
  const remaining = calculateSprintRemaining(currentIteration?.endDate);

  const activeBuildCount = useMemo(() => {
    let count = 0;
    for (const entry of Object.values(repoCiByRepo)) {
      const status = entry?.snapshot?.status || entry?.snapshot?.runs?.[0]?.status;
      if (statusMeta(status).tone === 'run') count += 1;
    }
    for (const pipeline of pipelines) {
      const latest = runsByPipeline[pipeline.pipelineId]?.[0];
      if (latest && statusMeta(latest.status).tone === 'run') count += 1;
    }
    return count;
  }, [pipelines, repoCiByRepo, runsByPipeline]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        sticky
        contentClassName="w-full"
        navigation={<SidebarTrigger aria-label="折叠/展开侧栏" />}
        title="总览"
        titleClassName="text-sm font-semibold tracking-tight text-foreground"
        scope={
          // 状态项作为标题副信息（subtitle）：连接徽标 + 分页加载进度，随页头单行截断
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusBadge status={connectionStatus(connection)} size="sm" />
            <span className="font-mono text-[11px]">
              {activeCategoryState.complete
                ? `已加载 ${activeCategoryState.loadedCount} 项`
                : `已加载范围 ${activeCategoryState.loadedCount} 项`}
            </span>
            {!activeCategoryState.complete && activeCategoryState.status !== 'idle' && (
              <span className="font-mono text-[11px] text-sig-run">· 分页未完成</span>
            )}
          </div>
        }
        actions={
          // 右侧操作区：分类 Tabs + 刷新，永不换行（flex-nowrap）
          <div className="flex shrink-0 flex-nowrap items-center gap-2.5">
            <Tabs
              value={activeCategory}
              onValueChange={(key) => {
                if (OVERVIEW_CATEGORIES.includes(key as Category)) setActiveCategory(key as Category);
              }}
            >
              <TabsList size="sm">
                {OVERVIEW_CATEGORIES.map((category) => (
                  <TabsTrigger key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="刷新总览数据"
              onPress={refresh}
              className="size-7"
            >
              <RefreshCwIcon className={cn('size-3.5', (iterationLoading || categoryLoading) && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-1">
        {(iterationLoading || categoryLoading) && (
          <ProgressBar
            isIndeterminate
            aria-label="正在同步总览数据"
            size="sm"
            color="accent"
            className="w-full"
          />
        )}

        {overviewIterations.status === 'error' ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>迭代加载失败</Alert.Title>
              <Alert.Description className="flex flex-wrap items-center gap-2">
                <span>{overviewIterations.error || '无法取得真实迭代列表。'}</span>
                <Button size="sm" variant="secondary" onPress={() => void loadOverviewIterations({ refresh: true })}>
                  重试
                </Button>
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : overviewIterations.status === 'success' && !currentIteration ? (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>暂无可用迭代</Alert.Title>
              <Alert.Description>真实迭代列表为空或当前没有进行中、未开始的迭代。</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : currentIteration ? (
          <CycleHeaderBanner
            iteration={currentIteration}
            iterations={availableIterations}
            itemCount={iterationItems.length}
            dataComplete={activeCategoryState.complete}
            onOpenIterationWorkbench={(name) => setIteration(name)}
            onSelectIteration={(id) => {
              setSelectedIterationId(id);
              const selected = availableIterations.find((iteration) => iteration.id === id);
              if (selected) setIterationKey(selected.name);
            }}
          />
        ) : null}

        <KpiCardsGrid
          categoryLabel={CATEGORY_LABELS[activeCategory]}
          itemCount={iterationItems.length}
          dataComplete={activeCategoryState.complete}
          remainingLabel={remaining.label}
          remainingTone={remaining.tone}
          activeBuildCount={activeBuildCount}
          failedCount={attention.failedBuilds}
          ciErrorCount={attention.ciErrors}
          unboundCiCount={attention.unboundCi}
          repoCount={watchedRepos.length}
          pipelineCount={pipelines.length}
          connectionState={connection}
          loading={categoryLoading}
        />

        <QuickBuildConsole />

        {/* 需要关注卡片：Header=标题+说明；Content=三项异常细分（CI 配置类问题可直达设置处理） */}
        <Card>
          <Card.Header className="gap-1">
            <Card.Title className="text-[13px] font-semibold tracking-tight text-foreground">需要关注</Card.Title>
            <Card.Description className="text-xs text-muted-foreground">
              构建失败与 CI 配置异常的细分汇总，与上方「需要关注」KPI 联动
            </Card.Description>
          </Card.Header>
          <Card.Content className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2 text-xs">
              <StatusIcon status="FAIL" className="size-3.5" />
              <span className="text-muted-foreground">失败构建</span>
              <span
                className={cn(
                  'ml-auto font-mono tabular-nums',
                  attention.failedBuilds > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground/70',
                )}
              >
                {attention.failedBuilds}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <StatusIcon status={attention.ciErrors > 0 ? 'FAIL' : 'OTHER'} className="size-3.5" />
              <span className="text-muted-foreground">CI 查询失败</span>
              <span
                className={cn(
                  'ml-auto font-mono tabular-nums',
                  attention.ciErrors > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground/70',
                )}
              >
                {attention.ciErrors}
              </span>
              {attention.ciErrors > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => useUi.getState().openSettings('ci')}
                  className="h-6 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  前往设置
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <StatusIcon status={attention.unboundCi > 0 ? 'WAITING' : 'OTHER'} className="size-3.5" />
              <span className="text-muted-foreground">未绑定 CI</span>
              <span
                className={cn(
                  'ml-auto font-mono tabular-nums',
                  attention.unboundCi > 0 ? 'font-semibold text-warning' : 'text-muted-foreground/70',
                )}
              >
                {attention.unboundCi}
              </span>
              {attention.unboundCi > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => useUi.getState().openSettings('ci')}
                  className="h-6 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  前往设置
                </Button>
              )}
            </div>
          </Card.Content>
        </Card>

        {/* 交付状态：两张子卡内部 Header 已含标题与说明（重点仓库 CI / 组织级 Flow），不再外挂区块标题 */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]" aria-label="交付状态">
          <RepoCiSummary />
          <FlowPipelineSummary />
        </div>

        {showWorkitemContent && (
          <section className="flex flex-col gap-4" aria-label="工作项速览">
            {/* 区块标题已由 WorkitemsDataTable 卡片自身 Header（Card.Title + 计数 + Description）承载，不再外挂 */}
            {activeCategoryState.status === 'partial' && (
              <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>工作项只加载了部分页面</Alert.Title>
                  <Alert.Description className="flex flex-wrap items-center gap-2">
                    <span>
                      已加载 {activeCategoryState.loadedCount} 项；图表不会推断未加载数据。
                      {activeCategoryState.error ? ` ${activeCategoryState.error}` : ''}
                    </span>
                    <Button size="sm" variant="secondary" onPress={() => void loadOverviewCategory(activeCategory, { refresh: true })}>
                      重试分页
                    </Button>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            {activeCategoryState.status === 'error' && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>工作项加载失败</Alert.Title>
                  <Alert.Description className="flex flex-wrap items-center gap-2">
                    <span>{activeCategoryState.error || '无法取得当前类别的工作项。'}</span>
                    <Button size="sm" variant="secondary" onPress={() => void loadOverviewCategory(activeCategory, { refresh: true })}>
                      重试
                    </Button>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            <div className="flex flex-col gap-4 lg:flex-row">
              <WorkitemStatusChart
                items={iterationItems}
                complete={activeCategoryState.complete}
                loading={categoryLoading}
                title={currentIteration ? `状态分布 · ${currentIteration.name}` : '状态分布'}
              />
              <WorkitemUpdateActivityChart
                items={iterationItems}
                complete={activeCategoryState.complete}
                loading={categoryLoading}
              />
            </div>

            <WorkitemsDataTable
              categoryLabel={CATEGORY_LABELS[activeCategory]}
              items={recentItems}
              complete={activeCategoryState.complete}
              loading={categoryLoading}
              selectedWorkitemId={drawerWorkitemId}
              onOpenDetail={openDetail}
              onOpenWorkbench={(id, identifier, subject) => openInWorkbench(id, identifier, subject)}
            />
          </section>
        )}
      </div>

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
