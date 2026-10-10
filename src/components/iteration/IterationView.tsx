import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCwIcon,
  LoaderCircleIcon,
  XIcon,
  ChevronRightIcon,
  SearchXIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApp } from '@/store/app';
import {
  useUi, iterationsOrFallback, scopedItems, applyWorkitemFilters,
} from '@/store/ui';
import { CATEGORY_LABELS, type Category, type RepoSummary } from '@/types';
import { ciProviderLabel, ciStatusText } from '@/lib/ci';
import { formatTime } from '@/lib/format';
import { SearchableSelect } from '../searchable-select';
import { PageHeader } from '../page-header';
import { AppBreadcrumb } from '../nav/app-breadcrumb';
import { EmptyHint } from '../empty-hint';
import { StatusBadge } from '../StatusBadge';
import { InfoItem } from '../info-item';
import { CiSummaryButton } from '../ci-summary-button';
import { TableEmptyRow } from '../table-empty-row';
import { SectionHeader } from '../section-header';
import { IterationBranches } from './IterationBranches';
import { RepositoryCiDetails } from './RepositoryCiDetails';

/** 仓库行：按仓库实际绑定的 CI 提供方（Flow / Jenkins）展示状态与运行数，各入口口径一致 */
function RepositoryRow({ repo }: { repo: RepoSummary }) {
  const { repoCiByRepo, settings } = useApp();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const binding = settings?.repoCiBindings?.[String(repo.id)];
  const providerLabel = ciProviderLabel(binding);
  const status = binding
    ? ciStatusText(snapshot?.status, entry)
    : '未配置 CI';
  const runCount = (snapshot?.runs ?? []).length;

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <div className="flex flex-col">
            <span>{repo.pathWithNamespace || repo.name}</span>
            <span className="text-xs text-muted-foreground">#{repo.id} · {providerLabel}</span>
          </div>
        </TableCell>
        <TableCell>
          <CiSummaryButton
            status={status}
            runCount={binding && runCount ? runCount : 0}
            error={entry?.error}
            tooltip="点击查看 CI 运行记录、日志与构建操作"
            onOpen={() => setDetailsOpen(true)}
          />
        </TableCell>
      </TableRow>
      <RepositoryCiDetails repo={repo} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </>
  );
}

/**
 * 迭代视图（高频优先）：迭代摘要 → 迭代工作项（搜索/筛选前置）→ 涉及仓库 → 分支规则模板（低频配置，默认折叠）。
 * CI 时间戳只在快照成功刷新时更新（app.ciRefreshedAt），避免"发起请求即更新"的错误信心。
 */
export function IterationView() {
  const { iterationKey, setIteration, openWorkitem, filters, clearFilters, listSearch, setListSearch, searchFocusAt } = useUi();
  const {
    items, repositories, category, setCategory, loadingList, loadList, nextToken, loadRepoCi,
    iterations: realIterations, loadingIterations, loadIterations,
    ciRefreshedAt, repoCiByRepo, settings,
  } = useApp();

  const ciHasError = Object.values(repoCiByRepo).some((entry) => Boolean(entry.error));
  const templateCount = settings?.branchRuleTemplates?.length ?? 0;

  // 侧栏搜索框 / ⌘K：聚焦主区搜索框（视图切换在 focusGlobalSearch 内完成）
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchFocusAt) searchInputRef.current?.focus();
  }, [searchFocusAt]);

  // CI 轮询：覆盖所有已绑定仓库（Flow + Jenkins），与仓库表/CI 详情同一数据源
  const refreshCi = () => {
    if (document.visibilityState !== 'visible') return;
    const state = useApp.getState();
    for (const repo of repositories) {
      if (state.settings?.repoCiBindings?.[String(repo.id)]
        && !state.repoCiByRepo[repo.id]?.loading) {
        void loadRepoCi(repo.id);
      }
    }
  };

  // 首次进入立即查询；页面可见时每 15 秒刷新，切回窗口时立即刷新。
  useEffect(() => {
    refreshCi();
    const timer = window.setInterval(refreshCi, 15_000);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refreshCi(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositories, loadRepoCi]);

  const iterations = iterationsOrFallback(realIterations);
  const iteration = iterations.find((it) => it.name === iterationKey) ?? iterations[0];
  const usingFallback = !realIterations.length;
  const activeFilterCount = filters.assignees.length + filters.related.length + filters.statuses.length;

  // 列表按当前迭代收窄（真实迭代命中时），再套用侧栏筛选与关键字
  const scoped = useMemo(
    () => scopedItems(items, iterationKey, realIterations),
    [items, iterationKey, realIterations],
  );
  const filtered = useMemo(() => {
    const k = listSearch.trim().toLowerCase();
    return applyWorkitemFilters(scoped, filters).filter((it) => {
      if (!k) return true;
      return it.subject.toLowerCase().includes(k) || it.identifier.toLowerCase().includes(k);
    });
  }, [scoped, filters, listSearch]);

  // 滚动加载哨兵：进入视口（提前 240px）自动拉取下一页；加载完成即重挂观察器，列表仍短则继续拉取
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextToken || loadingList) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadList(true);
      },
      { rootMargin: '240px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [nextToken, loadingList, loadList, items.length]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        breadcrumb={<AppBreadcrumb />}
        title={iteration.name}
        titleBadge={<StatusBadge status={iteration.state || undefined} />}
        description={usingFallback
          ? `占位数据 · 迭代接口不可用${loadingIterations ? '，获取中…' : ''}`
          : `${iteration.title || '云效项目迭代'}${iteration.startDate && iteration.endDate ? ` · ${iteration.startDate} ~ ${iteration.endDate}` : ''}`}
        actions={
          <>
            <SearchableSelect
              className="w-56 text-xs"
              ariaLabel="切换迭代"
              value={iteration.name}
              onValueChange={(v) => { if (v) setIteration(v); }}
              items={iterations.map((it) => ({
                label: `${it.name} · ${it.state}`,
                value: it.name,
              }))}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // 手动刷新覆盖本页全部数据源：工作项 + 迭代 + 各仓库 CI
                void loadList(false);
                void loadIterations();
                refreshCi();
              }}
            >
              <RefreshCwIcon data-icon="inline-start" />
              刷新
            </Button>
          </>
        }
        className="sticky top-0 z-10 border-b border-border bg-background pb-4"
      />

      {/* Notion 式：页头贴左全宽，正文居中限宽 */}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      {/* 迭代属性行（Notion properties 形态，无卡片壳） */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoItem
          label="工作项（当前类别）"
          value={usingFallback ? String(scoped.length) : `${scoped.length} / 已加载 ${items.length}`}
        />
        <InfoItem label="关联仓库" value={`${repositories.length} 个`} />
        <InfoItem
          label="CI 上次成功刷新"
          value={ciRefreshedAt
            ? formatTime(ciRefreshedAt) + (ciHasError ? '（有失败）' : '')
            : ciHasError ? '刷新失败' : '尚未刷新'}
        />
      </div>

      {/* 高频区前置：每天找需求从这里开始（搜索词入导航快照，后退可恢复） */}
      <section className="flex flex-col gap-3 border-b border-border/70 pb-6">
        <SectionHeader
          title="迭代工作项"
          hint={`${CATEGORY_LABELS[category]} · 迭代内 ${scoped.length} 项 · 筛选后 ${filtered.length} 项（已加载 ${items.length}）${loadingList ? ' · 加载中…' : ''}`}
          action={<>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <XIcon data-icon="inline-start" />
                清除筛选（{activeFilterCount}）
              </Button>
            )}
            <Input
              ref={searchInputRef}
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="搜索编号 / 标题"
              className="h-8 w-56"
            />
          </>}
        />
        <Tabs value={category} onValueChange={(v) => void setCategory(v as Category)}>
            <TabsList>
              {(['Req', 'Bug', 'Task'] as Category[]).map((c) => (
                <TabsTrigger key={c} value={c}>{CATEGORY_LABELS[c]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((item) => (
              <Button
                key={item.workitemId || item.identifier}
                type="button"
                variant="outline"
                className="flex h-auto w-full items-start justify-between gap-3 rounded-lg border-border bg-card p-4 text-left font-normal hover:bg-accent"
                onClick={() => {
                  openWorkitem(item.workitemId, {
                    workitemId: item.workitemId,
                    identifier: item.identifier,
                    subject: item.subject,
                  });
                }}
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs font-normal text-muted-foreground">{item.identifier}</p>
                  <p className="mt-1 text-sm font-medium">{item.subject}</p>
                  <p className="mt-1 truncate text-xs font-normal text-muted-foreground">
                    {item.assignedTo}
                    {item.relatedTo?.length ? ` · 关联 ${item.relatedTo.join('、')}` : ''}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </Button>
            ))}
            {!filtered.length && !loadingList && (
              <EmptyHint
                icon={SearchXIcon}
                className="col-span-full"
                title="无匹配工作项"
                description={items.length && !usingFallback && activeFilterCount
                  ? '当前迭代无匹配工作项（可清除侧栏筛选或滚动加载更多）'
                  : nextToken
                    ? '当前迭代暂无已加载的工作项（向下滚动继续拉取）'
                    : undefined}
              />
            )}
            {/* 滚动加载哨兵：进入视口即自动拉取下一页 */}
            <div ref={sentinelRef} className="col-span-full h-px" aria-hidden />
            {nextToken && (
              <div className="col-span-full flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                {loadingList
                  ? (<><LoaderCircleIcon className="size-3.5 animate-spin" />加载中…</>)
                  : '向下滚动加载更多'}
              </div>
            )}
            {!nextToken && items.length > 0 && !loadingList && (
              <div className="col-span-full py-2 text-center text-xs text-muted-foreground">
                已加载全部 · 共 {items.length} 项
              </div>
            )}
          </div>
      </section>

      <section className="flex flex-col gap-3 border-b border-border/70 pb-6">
        <SectionHeader
          title="涉及仓库"
          count={repositories.length}
          hint="点击 CI 概要查看运行记录、日志与构建操作；需求详情中为各关联仓库选择分支模板"
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>仓库</TableHead>
              <TableHead>CI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {repositories.map((repo) => <RepositoryRow key={repo.id} repo={repo} />)}
            {!repositories.length && (
              <TableEmptyRow
                colSpan={2}
                title="仓库列表为空"
                description="请先在「设置 → 追溯与云效仓库」配置云效连接并选择默认云效仓库"
              />
            )}
          </TableBody>
        </Table>
      </section>

      {/* 低频配置区：默认折叠，不占首屏（Notion toggle 块形态：轻容器 + 分割线） */}
      <Collapsible defaultOpen={false} render={<div className="rounded-lg border border-border/70" />}>
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">分支规则模板{templateCount ? `（${templateCount}）` : ''}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              低频配置：模板保存在本机，需求仓库单独选用。基准模板支持 {'{iteration}'}、{'{template}'}，需求分支支持 {'{identifier}'}。
            </p>
          </div>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            <ChevronRightIcon className="transition-transform duration-200 group-data-panel-open/collapsible:rotate-90" />
            展开 / 收起
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border/70 p-4">
            <IterationBranches />
          </div>
        </CollapsibleContent>
      </Collapsible>
      </div>
    </div>
  );
}
