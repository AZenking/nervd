import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCwIcon,
  DatabaseIcon,
  LoaderCircleIcon,
  XIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { SearchableSelect } from '../searchable-select';
import { StatusDot } from '../StatusDot';
import { IterationBranches } from './IterationBranches';
import { RepositoryCiDetails } from './RepositoryCiDetails';

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-sm font-semibold" title={value}>{value}</p>
    </div>
  );
}

/** 仓库行：CI 状态真实（repoCiByRepo），基准分支关系在上方按迭代配置 */
function RepositoryRow({ repo }: { repo: RepoSummary }) {
  const { repoCiByRepo, settings } = useApp();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const binding = settings?.repoCiBindings?.[String(repo.id)];
  const jenkinsBinding = binding?.provider === 'jenkins' ? binding : undefined;
  const isJenkins = Boolean(jenkinsBinding);
  const providerLabel = isJenkins ? 'Jenkins' : 'Jenkins 未配置';
  const status = isJenkins ? snapshot?.status ?? (entry?.loading ? '加载中' : entry?.error ? '查询失败' : '—') : '未配置 Jenkins';

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <div className="flex flex-col">
            <span>{repo.pathWithNamespace || repo.name}</span>
            <span className="text-xs text-muted-foreground">#{repo.id} · {providerLabel}</span>
          </div>
        </TableCell>
        <TableCell><code className="text-xs text-muted-foreground">—</code></TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-1.5 py-1 font-normal"
            title={entry?.error ?? '点击查看 CI Job、构建分支和环境详情'}
            onClick={() => setDetailsOpen(true)}
          >
            <span className="inline-flex items-center gap-1.5 text-sm">
              <StatusDot status={status} />
              {status}
            </span>
          </Button>
        </TableCell>
        <TableCell><Badge variant="outline">—</Badge></TableCell>
        <TableCell><Badge variant="outline">—</Badge></TableCell>
        <TableCell className="text-right">
          <Button variant="outline" size="sm" onClick={() => setDetailsOpen(true)}>CI 详情</Button>
        </TableCell>
      </TableRow>
      <RepositoryCiDetails repo={repo} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </>
  );
}

/** 迭代视图（nervd-new-ui 基准）：迭代信息（真实 sprints）+ 分支关系 + 仓库 + 需求列表（真实，按迭代过滤，滚动加载） */
export function IterationView() {
  const { iterationKey, setIteration, openRequirement, filters, clearFilters } = useUi();
  const {
    items, repositories, category, setCategory, loadingList, loadList, nextToken, select, loadRepoCi,
    iterations: realIterations, loadingIterations, loadIterations,
  } = useApp();
  const [kw, setKw] = useState('');

  // 首次进入立即查询；页面可见时每 15 秒刷新，切回窗口时立即刷新。
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const state = useApp.getState();
      for (const repo of repositories) {
        if (state.settings?.repoCiBindings?.[String(repo.id)]?.provider === 'jenkins'
          && !state.repoCiByRepo[repo.id]?.loading) void loadRepoCi(repo.id);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
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
    const k = kw.trim().toLowerCase();
    return applyWorkitemFilters(scoped, filters).filter((it) => {
      if (!k) return true;
      return it.subject.toLowerCase().includes(k) || it.identifier.toLowerCase().includes(k);
    });
  }, [scoped, filters, kw]);

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
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <CardDescription>
                {usingFallback
                  ? `当前迭代（占位数据 · 迭代接口不可用${loadingIterations ? '，获取中…' : ''}）`
                  : '当前迭代 · 云效项目迭代'}
              </CardDescription>
              <CardTitle className="mt-1 flex flex-wrap items-center gap-2">
                {iteration.name}
                <Badge variant="secondary">{iteration.state || '未知状态'}</Badge>
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                  void loadList(false);
                  void loadIterations();
                }}
              >
                <RefreshCwIcon className="size-4" />
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {iteration.title && <p className="text-sm text-muted-foreground">{iteration.title}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem
              label="工作项（当前类别）"
              value={usingFallback ? String(scoped.length) : `${scoped.length} / 已加载 ${items.length}`}
            />
            <InfoItem label="关联仓库" value={`${repositories.length} 个`} />
            <InfoItem
              label="迭代周期"
              value={iteration.startDate && iteration.endDate ? `${iteration.startDate} ~ ${iteration.endDate}` : '—'}
            />
            <InfoItem label="基准分支规则" value="按需求所选模板生成" />
          </div>
        </CardContent>
      </Card>

      <IterationBranches />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DatabaseIcon className="size-4" />涉及仓库</CardTitle>
          <CardDescription>点击仓库查看 CI 运行记录、日志与构建操作；需求详情中为各关联仓库选择分支模板</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>仓库</TableHead>
                <TableHead>当前分支</TableHead>
                <TableHead>CI 状态</TableHead>
                <TableHead>相对迭代分支</TableHead>
                <TableHead>相对 dev</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repositories.map((repo) => <RepositoryRow key={repo.id} repo={repo} />)}
              {!repositories.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                    仓库列表为空，请先在设置中配置云效连接并选择关注仓库
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>迭代工作项</CardTitle>
              <CardDescription>
                {CATEGORY_LABELS[category]}
                {!usingFallback && ` · 迭代内 ${scoped.length} 项`}
                {` · 筛选后 ${filtered.length} 项（已加载 ${items.length}）`}
                {loadingList ? ' · 加载中…' : ''}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <XIcon className="size-4" />
                  清除筛选（{activeFilterCount}）
                </Button>
              )}
              <Input
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                placeholder="搜索编号 / 标题"
                className="w-56"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
                className="flex h-auto w-full items-start justify-between gap-3 rounded-lg p-3 text-left font-normal hover:bg-accent"
                onClick={() => {
                  void select(item.workitemId);
                  openRequirement();
                }}
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs font-normal text-muted-foreground">{item.identifier}</p>
                  <p className="mt-1 text-sm font-medium">{item.subject}</p>
                  <p className="mt-1 truncate text-xs font-normal text-muted-foreground">
                    {item.status} · {item.assignedTo}
                    {item.relatedTo?.length ? ` · 关联 ${item.relatedTo.join('、')}` : ''}
                  </p>
                </div>
                <StatusDot status={item.status} />
              </Button>
            ))}
            {!filtered.length && !loadingList && (
              <div className="col-span-full rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                {items.length
                  ? usingFallback
                    ? '无匹配工作项'
                    : activeFilterCount
                      ? '当前迭代无匹配工作项（可清除侧栏筛选或滚动加载更多）'
                      : nextToken
                        ? '当前迭代暂无已加载的工作项（向下滚动继续拉取）'
                        : '当前迭代在全部工作项中均无匹配'
                  : '无匹配工作项'}
              </div>
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
        </CardContent>
      </Card>
    </div>
  );
}
