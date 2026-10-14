import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCwIcon,
  LoaderCircleIcon,
  XIcon,
  ChevronRightIcon,
  SearchXIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import {
  useUi, iterationsOrFallback, scopedItems, applyWorkitemFilters,
} from '@/store/ui';
import { CATEGORY_LABELS, type Category, type RepoSummary } from '@/types';
import { ciProviderLabel, ciStatusText } from '@/lib/ci';
import { SearchableSelect } from '../searchable-select';
import { STICKY_PAGE_HEADER_CLASS } from '../page-header';
import { AppBreadcrumb } from '../nav/app-breadcrumb';
import { EmptyHint } from '../empty-hint';
import { statusMeta } from '../StatusBadge';
import { CiSummaryButton } from '../ci-summary-button';
import { TableEmptyRow } from '../table-empty-row';
import { SectionHeader } from '../section-header';
import { StatusIcon, STATUS_TONE_ORDER } from '../status-icon';
import { IterationBranches } from './IterationBranches';
import { RepositoryCiDetails } from './RepositoryCiDetails';

/** 工作项行类型：直接从 app store 的 items 元素推导，避免再引一层 lib/api */
type WorkitemItem = ReturnType<typeof useApp.getState>['items'][number];

/** 行唯一键：workitemId 优先（UUID），缺省回退编号 */
const rowKeyOf = (it: WorkitemItem) => it.workitemId || it.identifier;

/** 状态分组（Linear 列表形态）：按原始 status 字符串分组、按 tone 排序（run → fail → idle → ok），组内保持原顺序 */
interface StatusGroup {
  status: string;
  items: WorkitemItem[];
}

function groupByStatus(items: WorkitemItem[]): StatusGroup[] {
  const groups = new Map<string, WorkitemItem[]>();
  for (const it of items) {
    const bucket = groups.get(it.status);
    if (bucket) bucket.push(it);
    else groups.set(it.status, [it]);
  }
  return [...groups.entries()]
    .map(([status, groupItems]) => ({ status, items: groupItems }))
    .sort((a, b) => STATUS_TONE_ORDER.indexOf(statusMeta(a.status).tone)
      - STATUS_TONE_ORDER.indexOf(statusMeta(b.status).tone));
}

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

/** 列表行骨架：首屏与翻页加载态共用，尺寸对齐真实数据行（h-11 / rounded-lg），避免布局跳动 */
function WorkitemSkeletonRows() {
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((key) => (
        <Skeleton key={key} className="h-11 w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * 迭代视图（高频优先）：sticky 页头（面包屑 + 迭代切换/刷新 + 类别 Tabs/计数/筛选，Linear 无大标题形态）
 * → 迭代工作项（Linear 式状态分组列表 + j/k 键盘导航）→ 涉及仓库 → 分支规则模板（低频配置，默认折叠）。
 * 列表区不再有卡片边框容器：全宽裸行 + 状态分组折叠，操作逻辑对齐 Linear（j/k/Enter 与悬停跟随光标）。
 */
export function IterationView() {
  const { iterationKey, setIteration, openWorkitem, filters, clearFilters, listSearch, setListSearch } = useUi();
  const {
    items, repositories, category, setCategory, loadingList, loadList, nextToken, loadRepoCi,
    iterations: realIterations, loadingIterations, loadIterations,
    settings,
  } = useApp();

  const templateCount = settings?.branchRuleTemplates?.length ?? 0;

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

  // 回退到首个迭代时同步 store：面包屑（iterationKey）= 页面标题 = 切换器
  useEffect(() => {
    if (iteration && iteration.name !== iterationKey) setIteration(iteration.name);
  }, [iteration, iterationKey, setIteration]);

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

  // 计数口径（工具行尾部 + 列表底部共用）：全部已加载 y 项（当前迭代 x 项在工具行单独拼）
  const countSummary = `全部已加载 ${items.length} 项`;

  // 工具行计数（Linear 无大标题形态）：类别 · 当前迭代 x 项 · 迭代周期 · 全部已加载 ·（回退时）占位提示
  const toolSummary = `${CATEGORY_LABELS[category]} · ${scoped.length} 项`
    + (iteration.startDate && iteration.endDate ? ` · ${iteration.startDate} ~ ${iteration.endDate}` : '')
    + ` · ${countSummary}`
    + (usingFallback ? ` · 占位数据 · 迭代接口不可用${loadingIterations ? '，获取中…' : ''}` : '');

  // 状态分组：组顺序按 tone（进行中 → 失败 → 待处理 → 已完成），组内保持原顺序
  const groups = useMemo(() => groupByStatus(filtered), [filtered]);

  // 折叠状态：status 原文集合（折叠的组不渲染数据行）
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleGroup = useCallback((status: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  // 扁平可见行序 = 分组渲染顺序拼接（折叠组不占行）；id → 扁平索引供 data-active / 悬停换算
  const flatIds = useMemo(
    () => groups.flatMap((g) => (collapsed.has(g.status) ? [] : g.items.map(rowKeyOf))),
    [groups, collapsed],
  );
  const flatIndexById = useMemo(() => new Map(flatIds.map((id, index) => [id, index])), [flatIds]);
  const itemById = useMemo(() => new Map(filtered.map((it) => [rowKeyOf(it), it])), [filtered]);

  /** 打开工作项详情：行点击 / Enter / 右键菜单共用同一入口与面包屑形态 */
  const openDetail = useCallback((item: WorkitemItem) => {
    openWorkitem(item.workitemId, {
      workitemId: item.workitemId,
      identifier: item.identifier,
      subject: item.subject,
    });
  }, [openWorkitem]);

  /** 复制文本到剪贴板并 toast 反馈（insecure context 下 clipboard API 可能缺失） */
  const copyWithToast = useCallback((text: string, okText: string) => {
    const clip = navigator.clipboard;
    const fail = () => useApp.getState().setToast({ text: '复制失败', kind: 'fail' });
    if (!clip?.writeText) { fail(); return; }
    clip.writeText(text)
      .then(() => useApp.getState().setToast({ text: okText, kind: 'ok' }))
      .catch(fail);
  }, []);

  // 行右键上下文菜单：{行数据, 视口坐标}；受控 DropdownMenu 以隐藏零尺寸 trigger 锚定到该坐标
  const [ctxMenu, setCtxMenu] = useState<{ item: WorkitemItem; x: number; y: number } | null>(null);
  // '/' 聚焦筛选输入框（Linear 全局快捷键）：ref 供 window keydown 分支使用
  const filterInputRef = useRef<HTMLInputElement>(null);

  // 键盘光标：扁平可见行索引；ref 镜像供 keydown 闭包读取（避免逐键重绑监听器）
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  /** 统一光标写入：state 与 ref 同步更新（键盘 handler 经 ref 读取） */
  const applyCursor = useCallback((next: number | ((prev: number) => number)) => {
    setCursor((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      cursorRef.current = value;
      return value;
    });
  }, []);

  // 过滤结果（搜索词 / 筛选 / 类别 / 折叠）变化时，光标收敛到合法区间
  useEffect(() => {
    applyCursor((prev) => (flatIds.length ? Math.min(prev, flatIds.length - 1) : 0));
  }, [flatIds, applyCursor]);

  // 光标变化（含悬停写入）时滚动跟随：只在必要时滚动，不打断阅读位置
  useEffect(() => {
    const id = flatIds[cursor];
    if (id) rowRefs.current.get(id)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, flatIds]);

  // 键盘导航（Linear 操作逻辑核心）：j/↓ k/↑ 循环移动光标，Enter 打开光标行，/ 聚焦筛选输入框。
  // 焦点在文本输入控件 / 命令面板打开时让路；右键菜单打开时按键归菜单（防弹层后方的幽灵光标移动与 Enter 双重动作）；
  // 焦点在按钮/链接上时 Enter 交还原生激活，避免一次按键双重动作。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (useUi.getState().commandOpen) return;
      if (ctxMenu) return;

      // / 聚焦筛选输入框（Linear 行为）：光标移到末尾，续接输入而不是插到开头
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const input = filterInputRef.current;
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
        return;
      }

      if (e.key === 'j' || e.key === 'ArrowDown' || e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'k' || e.key === 'ArrowUp' ? -1 : 1;
        applyCursor((prev) => (flatIds.length ? (prev + delta + flatIds.length) % flatIds.length : 0));
        return;
      }
      if (e.key === 'Enter') {
        if (target?.closest('button, a, [role="button"]')) return;
        const item = itemById.get(flatIds[cursorRef.current]);
        if (!item) return;
        openDetail(item);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flatIds, itemById, openDetail, applyCursor, ctxMenu]);

  // 滚动加载哨兵：进入视口（提前 240px）自动拉取下一页；加载完成即重挂观察器，列表仍短则继续拉取
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextToken || loadingList) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadList(true);
      },
      { rootMargin: '240px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [nextToken, loadingList, loadList, items.length]);

  return (
    <div className="flex flex-col gap-5">
      {/* sticky 页头（Linear 无大标题形态）：行1 = 面包屑 + 迭代切换/刷新；行2 = 类别 Tabs + 计数 + 清除筛选/筛选输入 */}
      <header className={STICKY_PAGE_HEADER_CLASS}>
        <div className="flex min-h-9 items-center justify-between gap-3">
          <AppBreadcrumb />
          <div className="flex shrink-0 items-center gap-2">
            <SearchableSelect
              className="w-44 text-xs"
              ariaLabel="切换迭代"
              value={iteration.name}
              onValueChange={(v) => { if (v) setIteration(v); }}
              items={iterations.map((it) => ({
                label: `${it.name} · ${it.state}`,
                value: it.name,
              }))}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="刷新"
              onClick={() => {
                // 手动刷新覆盖本页全部数据源：工作项 + 迭代 + 各仓库 CI
                void loadList(false);
                void loadIterations();
                refreshCi();
              }}
            >
              <RefreshCwIcon />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Tabs value={category} onValueChange={(v) => void setCategory(v as Category)}>
            <TabsList>
              {(['Req', 'Bug', 'Task'] as Category[]).map((c) => (
                <TabsTrigger key={c} value={c}>{CATEGORY_LABELS[c]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{toolSummary}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <XIcon data-icon="inline-start" />
                清除筛选（{activeFilterCount}）
              </Button>
            )}
            <Input
              ref={filterInputRef}
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="筛选列表…"
              className="h-8 w-48"
            />
          </div>
        </div>
      </header>

      {/* 页头贴左全宽，正文居中限宽 */}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      {/* 高频区前置：状态分组裸行列表（j/k 导航），工具行已上移 sticky 页头 */}
      <section aria-label="迭代工作项" className="flex flex-col gap-3 border-b border-border/70 pb-6">

        {/* 状态分组列表：组顺序 = run → fail → idle → ok，组内保持原顺序 */}
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.status);
            return (
              <div key={group.status} className="flex flex-col gap-0.5">
                {/* 组头：可折叠按钮行（浅灰横带，Linear 组头形态；组名 = status 原文，计数 tabular-nums） */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.status)}
                  aria-expanded={!isCollapsed}
                  className="flex h-8 w-full items-center gap-2 rounded-md bg-muted/70 px-3 text-left hover:bg-muted"
                >
                  <ChevronRightIcon
                    className={cn(
                      'size-3.5 text-muted-foreground transition-transform',
                      !isCollapsed && 'rotate-90',
                    )}
                  />
                  <StatusIcon status={group.status} />
                  <span className="min-w-0 truncate text-[13px] font-medium">{group.status || '未知'}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{group.items.length}</span>
                </button>
                {!isCollapsed && group.items.map((item) => {
                  const rowId = rowKeyOf(item);
                  // 云效空处理人返回 '—'：与「未分配」同义，不渲染头像
                  const assignee = item.assignedTo && item.assignedTo !== '—' ? item.assignedTo : '';
                  return (
                    <button
                      key={rowId}
                      type="button"
                      ref={(el) => {
                        // 行 ref 登记 / 注销：键盘光标滚动跟随按行 id 查找
                        if (el) rowRefs.current.set(rowId, el);
                        else rowRefs.current.delete(rowId);
                      }}
                      data-active={flatIndexById.get(rowId) === cursor}
                      onClick={() => openDetail(item)}
                      onContextMenu={(e) => {
                        // Linear 行为：右键即选中该行，并在指针位置打开上下文菜单
                        e.preventDefault();
                        applyCursor(flatIndexById.get(rowId) ?? 0);
                        setCtxMenu({ item, x: e.clientX, y: e.clientY });
                      }}
                      onMouseEnter={() => applyCursor(flatIndexById.get(rowId) ?? 0)}
                      className="group flex h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-left transition-colors hover:bg-muted/60 data-[active=true]:bg-accent"
                    >
                      {/* Linear 列序：ID 在状态图标前 */}
                      <span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground">{item.identifier}</span>
                      <StatusIcon status={item.status} className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{item.subject}</span>
                      {/* 右侧：更新日期（md+）→ 处理人头像 + 姓名（姓名 lg+）；空处理人显示「未分配」不加头像 */}
                      <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <span className="hidden tabular-nums md:block">{item.updatedAt?.slice(5, 10) || '—'}</span>
                        {assignee ? (
                          <>
                            <Avatar className="size-5">
                              <AvatarFallback className="text-[10px]">{assignee.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="hidden max-w-24 truncate lg:inline">{assignee}</span>
                          </>
                        ) : '未分配'}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* 首屏加载（尚无已加载数据）：以行骨架代替纯文字 */}
          {loadingList && !items.length && <WorkitemSkeletonRows />}
          {!filtered.length && !loadingList && (
            <EmptyHint
              icon={SearchXIcon}
              title="无匹配工作项"
              description={items.length && !usingFallback && activeFilterCount
                ? '当前迭代无匹配工作项（可清除侧栏筛选或点击「加载更多」）'
                : nextToken
                  ? '当前迭代暂无已加载的工作项（向下滚动或点击「加载更多」继续拉取）'
                  : undefined}
            />
          )}
          {/* 滚动加载哨兵：进入视口即自动拉取下一页；常驻按钮保证键盘/触屏可达 */}
          <div ref={sentinelRef} className="h-px" aria-hidden />
          {nextToken && (
            <>
              {loadingList && items.length > 0 && <WorkitemSkeletonRows />}
              <div className="flex items-center justify-center py-2">
                <Button variant="outline" size="sm" disabled={loadingList} onClick={() => void loadList(true)}>
                  {loadingList && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
                  加载更多
                </Button>
              </div>
            </>
          )}
          {!nextToken && items.length > 0 && !loadingList && (
            <div className="py-2 text-center text-xs text-muted-foreground">
              已加载全部 · {countSummary}
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

      {/* 低频配置区：默认折叠，不占首屏（可折叠区块形态：轻容器 + 分割线） */}
      <Collapsible defaultOpen={false} render={<div className="rounded-lg border border-border/70" />}>
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">分支规则模板{templateCount ? `（${templateCount}）` : ''}</p>
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

      {/* 行右键上下文菜单（Linear 形态）：受控 DropdownMenu，open 随 ctxMenu。
          项目版 DropdownMenuContent 不透传 Positioner 的 anchor（无法挂虚拟坐标锚点），
          故以隐藏零尺寸 trigger 锚定到右键坐标，实现指针处弹出（仅作定位，不参与交互与焦点序） */}
      <DropdownMenu
        open={ctxMenu !== null}
        onOpenChange={(open) => { if (!open) setCtxMenu(null); }}
      >
        <DropdownMenuTrigger
          render={(
            <span
              aria-hidden
              tabIndex={-1}
              className="fixed size-0"
              style={{ left: ctxMenu?.x ?? 0, top: ctxMenu?.y ?? 0 }}
            />
          )}
        />
        {/* 零尺寸锚点下 --anchor-width=0，显式给定菜单宽度（Linear 右键菜单 ≈176px） */}
        <DropdownMenuContent className="w-44">
          <DropdownMenuItem onClick={() => { if (ctxMenu) openDetail(ctxMenu.item); }}>
            打开详情
            <DropdownMenuShortcut>↵</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => { if (ctxMenu) copyWithToast(ctxMenu.item.identifier, '已复制编号'); }}
          >
            复制编号
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => { if (ctxMenu) copyWithToast(ctxMenu.item.subject, '已复制标题'); }}
          >
            复制标题
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </div>
  );
}
