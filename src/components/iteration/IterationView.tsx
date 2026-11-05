import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCwIcon,
  SearchXIcon,
  Link2Icon,
} from 'lucide-react';
import { Accordion, Chip, ListBox } from '@heroui/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserAvatar } from '@/components/ui/avatar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { SINGLE_COLUMN_WORKSPACE_WIDTH } from '@/store/layout';
import { useShallow } from 'zustand/react/shallow';
import {
  useUi, iterationsOrFallback, scopedItems, applyWorkitemFilters, buildWorkitemFilterOptions, UNPLANNED_ITERATION,
} from '@/store/ui';
import { CATEGORY_LABELS, type Category } from '@/types';
import { PageHeader } from '../page-header';
import { EmptyHint } from '../empty-hint';
import { OverflowTooltip } from '../overflow-tooltip';
import { statusMeta } from '../StatusBadge';
import { StatusIcon, STATUS_TONE_ORDER } from '../status-icon';
import { WorkitemPeekDrawer } from '../workitem-peek-drawer';
import { useClipboard } from '@/hooks/use-clipboard';
import { useCiPolling } from '@/hooks/use-ci-polling';
import { useBatchSelection } from '@/hooks/use-batch-selection';
import { useElementWidth } from '@/hooks/use-element-width';
import type { WorkitemChild } from '@/lib/api';
import { WorkitemFilterBar } from './workitem-filter-menu';
import { IterationBranches } from './IterationBranches';
import { useFusedBranchTemplates } from '@/lib/iteration-templates';
import { openWorkitemInYunxiao } from '@/lib/yunxiao-link';
import { WorkitemStatusDropdown } from './workitem-status-dropdown';
import { FloatingBatchBar } from './floating-batch-bar';
import { KeyboardPagination } from './keyboard-pagination';
import { IterationRepoTab } from './iteration-repo-tab';
import { matchWorkitemUser } from '@/lib/workitem-highlight';
import { hasWorkspaceOverlay, isEditing, isWorkspacePeekDrawerOnly } from '@/lib/workspace-actions';

/** 每页渲染的分支行数：需求过多时全量渲染会卡，列表分页消化 */
const PAGE_SIZE = 30;
const ROW_PREVIEW_DELAY_MS = 140;

function getStatusGroupChipClass(status: string): string {
  const tone = statusMeta(status).tone;
  if (tone === 'run') {
    return 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold';
  }
  if (tone === 'fail') {
    return 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold';
  }
  if (tone === 'ok') {
    return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold';
  }
  return 'border-border/60 bg-muted/40 text-muted-foreground font-medium';
}

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


/** 列表行骨架：首屏与翻页加载态共用，尺寸与列布局对齐真实数据行，避免布局跳动 */
function WorkitemSkeletonRows() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {[0, 1].map((groupKey) => (
        <div key={groupKey} className="flex flex-col gap-1.5">
          {/* 模拟分组头骨架 */}
          <div className="flex items-center gap-2 px-1">
            <Skeleton className="size-3.5 rounded shrink-0" />
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-3.5 w-6 rounded-full" />
          </div>
          {/* 组内工作项骨架行 */}
          <div className="flex flex-col gap-0.5 ml-2.5 pl-3 border-l border-border/40 py-0.5">
            {[0, 1, 2, 3, 4].map((key) => (
              <div
                key={key}
                className="flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 bg-muted-bg"
              >
                <Skeleton className="size-3.5 rounded-sm shrink-0" />
                <Skeleton className="h-5 w-14 rounded-full shrink-0" />
                <Skeleton className="h-3.5 w-16 shrink-0" />
                <Skeleton
                  className="h-3.5 rounded"
                  style={{ width: `${Math.floor(25 + (((groupKey * 5 + key) * 17) % 35))}%` }}
                />
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <Skeleton className="h-3.5 w-12 hidden md:block" />
                  <Skeleton className="size-5 rounded-full shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 行内状态流转下拉菜单（Linear 式 In-place Popover 原语） */
function RowStatusDropdown({ item }: { item: WorkitemItem }) {
  return <WorkitemStatusDropdown workitemId={item.workitemId} status={item.status} statusId={item.statusId} variant="icon" />;
}

/**
 * 迭代视图（高频优先）：sticky 页头（面包屑 + 迭代切换/刷新 + 类别 Tabs/计数/筛选，Linear 无大标题形态）
 * → 迭代工作项（Linear 式状态分组列表 + j/k 键盘导航）→ 涉及仓库 → 分支规则模板（低频配置，默认折叠）。
 * 列表区不再有卡片边框容器：全宽裸行 + 状态分组折叠，操作逻辑对齐 Linear（j/k/Enter 与悬停跟随光标）。
 * 详情检视统一为 Linear Peek 抽屉：点击行 / Enter / 右键「查看详情」就地从右侧滑出详情抽屉，
 * 列表现场（滚动 / 筛选 / 分页 / 多选 / 光标）完整保留；抽屉开启时 j/k 仍可连续检视联动刷新。
 */
export function IterationView() {
  const {
    iterationKey,
    setIteration,
    openWorkitem,
    filters,
    listContext,
    updateListContext,
    restoreScroll,
  } = useUi();
  const {
    items, repositories, category, setCategory, loadingList, listFetchedAt, loadList, nextToken,
    iterations: realIterations, loadingIterations, loadIterations,
    settings,
    currentUser, workitemHighlight,
    revalidateList, revalidatingList,
  } = useApp(
    useShallow((s) => ({
      items: s.items,
      repositories: s.repositories,
      category: s.category,
      setCategory: s.setCategory,
      loadingList: s.loadingList,
      listFetchedAt: s.listFetchedAt,
      loadList: s.loadList,
      nextToken: s.nextToken,
      iterations: s.iterations,
      loadingIterations: s.loadingIterations,
      loadIterations: s.loadIterations,
      settings: s.settings,
      currentUser: s.currentUser,
      workitemHighlight: s.workitemHighlight,
      revalidateList: s.revalidateList,
      revalidatingList: s.revalidatingList,
    })),
  );

  // CI 轮询：覆盖所有已绑定仓库（Flow + Jenkins），与仓库表/CI 详情同一数据源
  const { refreshCi } = useCiPolling({ repositories });

  const iterations = iterationsOrFallback(realIterations);
  const iteration = iterations.find((it) => it.name === iterationKey) ?? iterations[0];
  const isUnplanned = iteration.name === UNPLANNED_ITERATION.name;
  const usingFallback = !realIterations.length;
  const activeFilterCount = filters.assignees.length + filters.related.length + filters.statuses.length;

  const fusedTemplates = useFusedBranchTemplates(iteration?.id);
  const templateCount = fusedTemplates.length;

  // 回退到首个迭代时同步 store：面包屑（iterationKey）= 页面标题 = 切换器
  useEffect(() => {
    if (iteration && iteration.name !== iterationKey) setIteration(iteration.name);
  }, [iteration, iterationKey, setIteration]);

  // 列表按当前迭代收窄（真实迭代命中时），再套用侧栏筛选与关键字
  const scoped = useMemo(
    () => scopedItems(items, iterationKey, realIterations),
    [items, iterationKey, realIterations],
  );
  const filtered = useMemo(
    () => applyWorkitemFilters(scoped, filters),
    [scoped, filters],
  );

  // 筛选选项（含计数）：处理人 / 关联人 / 状态三个多选菜单共用
  const filterOptions = useMemo(() => buildWorkitemFilterOptions(scoped), [scoped]);

  // 本迭代实际涉及仓库数统计：按本迭代工作项关联动态聚合
  const scopedRepoCount = useMemo(() => {
    const repoIds = new Set<number>();
    for (const it of scoped) {
      const hasOverride = it.workitemId != null && Object.prototype.hasOwnProperty.call(settings?.workitemRepos ?? {}, it.workitemId);
      const rIds = hasOverride
        ? (settings?.workitemRepos[it.workitemId] ?? [])
        : (settings?.watchedRepos ?? []);
      for (const rId of rIds) repoIds.add(rId);
    }
    return repositories.filter((r) => repoIds.has(r.id)).length;
  }, [scoped, settings, repositories]);

  // 分页（需求过多时全量渲染会卡）：每页 30 条，状态分组按当前页切片计算
  const [pageIndex, setPageIndex] = useState(() => listContext.pageIndex);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => filtered.slice((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE),
    [filtered, pageIndex],
  );

  useEffect(() => {
    updateListContext({ pageIndex });
  }, [pageIndex, updateListContext]);

  useEffect(() => {
    if (listFetchedAt != null && !loadingList && !nextToken && pageIndex > totalPages) {
      setPageIndex(totalPages);
    }
  }, [listFetchedAt, loadingList, nextToken, pageIndex, totalPages]);

  // 补拉防护：限制连续自动补拉深度，防止需求少的小迭代把全空间成百上千条工作项瀑布式抽干
  const backfillRoundRef = useRef(0);
  const prevScopedCountRef = useRef(scoped.length);
  const zeroYieldStreakRef = useRef(0);

  // 类别 / 迭代 / 筛选真正变化时回到第一页；首次挂载保留导航恢复的页码。
  const filterScopeKey = JSON.stringify(filters);
  const previousListScopeRef = useRef({ category, iterationKey, filterScopeKey });
  useEffect(() => {
    const previous = previousListScopeRef.current;
    if (previous.category === category
      && previous.iterationKey === iterationKey
      && previous.filterScopeKey === filterScopeKey) return;
    previousListScopeRef.current = { category, iterationKey, filterScopeKey };
    setPageIndex(1);
    backfillRoundRef.current = 0;
    zeroYieldStreakRef.current = 0;
    prevScopedCountRef.current = scoped.length;
  }, [category, filterScopeKey, iterationKey, scoped.length]);

  // 当用户主动翻页时，也给当前新页重置补拉轮数
  useEffect(() => {
    backfillRoundRef.current = 0;
    zeroYieldStreakRef.current = 0;
    prevScopedCountRef.current = scoped.length;
  }, [pageIndex]);

  // 当前页未填满且云端还有数据 → 适度自动补拉下一接口页（最多尝试 3 轮，或连续 2 轮无本迭代新增则熔断）
  useEffect(() => {
    if (pageItems.length >= PAGE_SIZE || !nextToken || loadingList) return;

    if (scoped.length > prevScopedCountRef.current) {
      zeroYieldStreakRef.current = 0;
    } else if (backfillRoundRef.current > 0) {
      zeroYieldStreakRef.current += 1;
    }
    prevScopedCountRef.current = scoped.length;

    // 熔断条件：已达最大连续补拉轮数 (3次) 或 连续2次补拉全无本迭代数据
    if (backfillRoundRef.current >= 3 || zeroYieldStreakRef.current >= 2) {
      return;
    }

    backfillRoundRef.current += 1;
    void loadList(true);
  }, [pageItems.length, nextToken, loadingList, loadList, scoped.length]);

  // 计数口径（工具行尾部 + 列表底部共用）：全部已加载 y 项（当前迭代 x 项在工具行单独拼）
  const countSummary = `全部已加载 ${items.length} 项`;

  // 工具行计数（Linear 无大标题形态）：类别 · 当前迭代 x 项 · 迭代周期 · 全部已加载 ·（回退时）占位提示
  const toolSummary = `${CATEGORY_LABELS[category]} · ${scoped.length} 项`
    + (iteration.startDate && iteration.endDate ? ` · ${iteration.startDate} ~ ${iteration.endDate}` : '')
    + ` · ${countSummary}`
    + (usingFallback ? ` · 占位数据 · 迭代接口不可用${loadingIterations ? '，获取中…' : ''}` : '');

  // 状态分组：组顺序 = run → fail → idle → ok，组内保持原顺序（按当前页切片）
  const groups = useMemo(() => groupByStatus(pageItems), [pageItems]);

  // 折叠状态：status 原文集合（折叠的组不渲染数据行）
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(listContext.collapsedStatuses));

  const expandedKeys = useMemo(
    () => new Set(groups.filter((g) => !collapsed.has(g.status)).map((g) => g.status)),
    [groups, collapsed],
  );

  const onExpandedChange = useCallback((keys: any) => {
    const expandedSet = new Set(Array.from(keys as Iterable<React.Key>).map(String));
    const nextCollapsed = new Set<string>();
    for (const g of groups) {
      if (!expandedSet.has(g.status)) nextCollapsed.add(g.status);
    }
    setCollapsed(nextCollapsed);
  }, [groups]);

  useEffect(() => {
    updateListContext({ collapsedStatuses: [...collapsed] });
  }, [collapsed, updateListContext]);

  // 扁平可见行序 = 分组渲染顺序拼接（折叠组不占行）；id → 扁平索引供 data-active / 悬停换算
  const flatIds = useMemo(
    () => groups.flatMap((g) => (collapsed.has(g.status) ? [] : g.items.map(rowKeyOf))),
    [groups, collapsed],
  );
  const flatIndexById = useMemo(() => new Map(flatIds.map((id, index) => [id, index])), [flatIds]);
  const itemById = useMemo(() => new Map(filtered.map((it) => [rowKeyOf(it), it])), [filtered]);

  // Peek 抽屉选中的工作项 ID；null 表示抽屉收起（全宽列表形态）。
  // listContext 持久化键沿用 splitWorkitemId / splitParentWorkitemId（导航快照兼容，不迁移）。
  const [peekWorkitemId, setPeekWorkitemId] = useState<string | null>(() => listContext.splitWorkitemId);
  const [peekParentWorkitemId, setPeekParentWorkitemId] = useState<string | null>(() => listContext.splitParentWorkitemId);

  // 顶层视图 Tab：工作项（默认）/ 关联仓库与 CI / 分支模板
  const [viewTab, setViewTab] = useState<'workitems' | 'repos' | 'branches'>(() => listContext.viewTab);
  useEffect(() => {
    updateListContext({ splitWorkitemId: peekWorkitemId, splitParentWorkitemId: peekParentWorkitemId, viewTab });
  }, [peekWorkitemId, peekParentWorkitemId, updateListContext, viewTab]);
  // 未规划虚拟迭代无分支模板（保存静默失败），强制回落工作项 tab
  const shownTab = isUnplanned && viewTab === 'branches' ? 'workitems' : viewTab;

  // ---- 布局自适应（窄窗口 compact 化）----
  // 测量的是本视图根容器（= 扣除侧栏后的工作区宽度），测量节点常驻；
  // 宽度仅用于窄窗口 PageHeader compact 密度判定（详情检视已统一为 Peek 抽屉，不再有分栏/单栏切换）。
  const [measureRef, workspaceWidth] = useElementWidth<HTMLDivElement>();
  /** 工作区宽度低于 760 → compact 形态（首帧未测量完成时不触发，避免挂载闪烁） */
  const singleColumn = workspaceWidth > 0 && workspaceWidth < SINGLE_COLUMN_WORKSPACE_WIDTH;

  const previewClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPreviewClick = useCallback(() => {
    if (previewClickTimer.current !== null) {
      clearTimeout(previewClickTimer.current);
      previewClickTimer.current = null;
    }
  }, []);
  useEffect(() => cancelPreviewClick, [cancelPreviewClick]);

  /** 打开工作项 Peek 抽屉详情：行点击 / Enter / 右键菜单就地从右侧滑出，列表现场完整保留 */
  const openDetail = useCallback((item: WorkitemItem) => {
    cancelPreviewClick();
    setPeekWorkitemId(item.workitemId);
    setPeekParentWorkitemId(null);
    void useApp.getState().select(item.workitemId);
  }, [cancelPreviewClick]);

  /** 在独立工作台全屏打开（转入完整页面并收起抽屉） */
  const openInWorkbench = useCallback((item: WorkitemItem) => {
    cancelPreviewClick();
    setPeekWorkitemId(null);
    setPeekParentWorkitemId(null);
    openWorkitem(item.workitemId, {
      workitemId: item.workitemId,
      identifier: item.identifier,
      subject: item.subject,
    });
  }, [openWorkitem, cancelPreviewClick]);

  /** 复制文本到剪贴板并 toast 反馈 */
  const { copy: copyWithToast } = useClipboard();

  // 多选集合（Linear 式 Checkbox 与批量操作）
  const {
    selectedIds,
    toggle: toggleSelect,
    selectOnly,
    setAnchor: setSelectionAnchor,
    selectRange,
    selectAll,
    clear: clearSelection,
    hasSelected,
  } = useBatchSelection(listContext.selectedWorkitemIds);

  useEffect(() => {
    updateListContext({ selectedWorkitemIds: [...selectedIds] });
  }, [selectedIds, updateListContext]);

  // 行右键上下文菜单：{行数据, 视口坐标}；受控 DropdownMenu 以隐藏零尺寸 trigger 锚定到该坐标
  const [ctxMenu, setCtxMenu] = useState<{ item: WorkitemItem; x: number; y: number } | null>(null);

  // 键盘光标：扁平可见行索引；ref 镜像供 keydown 闭包读取（避免逐键重绑监听器）
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  const cursorInitializedRef = useRef(false);
  const pendingCursorIndexRef = useRef<number | null>(null);
  const isKeyboardNavRef = useRef(false);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingRestoreScrollRef = useRef(restoreScroll);
  const didRestoreScrollRef = useRef(false);

  // ---- 列表现场滚动的本地保存 / 恢复（单栏详情态与跨阈值切换共用）----
  // 保存走 onScroll（用户/程序真实滚动时即时记录）：ref cleanup 时机太晚——分支切换当帧容器内容已被
  // 换成（更矮的）详情骨架，浏览器先一步把 scrollTop 钳到新 maxScroll，存到的就是被钳后的值。
  // 列表重挂载且数据就绪后一次性恢复（pendingLocal… 消费即清零，绝不与用户后续滚动打架）。
  const savedListScrollTopRef = useRef<number | null>(null);
  const pendingLocalScrollRestoreRef = useRef<number | null>(null);
  const [listMountEpoch, setListMountEpoch] = useState(0);
  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    savedListScrollTopRef.current = e.currentTarget.scrollTop;
  }, []);
  const attachListScroll = useCallback((el: HTMLDivElement | null) => {
    if (!el) return undefined;
    listScrollRef.current = el;
    if (savedListScrollTopRef.current != null) {
      pendingLocalScrollRestoreRef.current = savedListScrollTopRef.current;
    }
    setListMountEpoch((epoch) => epoch + 1);
    return () => {
      listScrollRef.current = null;
    };
  }, []);

  /** 局限在直接父滚动容器内平稳使目标行可见，彻底规避原生 scrollIntoView 引起的祖先容器全局跳动 */
  const scrollRowIntoView = useCallback((rowId: string) => {
    const rowEl = rowRefs.current.get(rowId);
    const container = listScrollRef.current;
    if (!rowEl) return;

    if (container) {
      const rowRect = rowEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const safetyTop = 44;
      const safetyBottom = 16;

      if (rowRect.top < containerRect.top + safetyTop) {
        container.scrollTop -= (containerRect.top + safetyTop - rowRect.top);
      } else if (rowRect.bottom > containerRect.bottom - safetyBottom) {
        container.scrollTop += (rowRect.bottom - (containerRect.bottom - safetyBottom));
      }
    } else {
      rowEl.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  /** 统一光标写入：state 与 ref 同步更新（键盘 handler 经 ref 读取） */
  const applyCursor = useCallback((next: number | ((prev: number) => number)) => {
    setCursor((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      cursorRef.current = value;
      return value;
    });
  }, []);

  // 初次取得数据时按稳定工作项 ID 恢复光标；之后只随当前可见行收敛，不反复读取旧 ID。
  useEffect(() => {
    if (!cursorInitializedRef.current && (listFetchedAt == null || loadingList)) return;
    const restoredIndex = !cursorInitializedRef.current && listContext.cursorWorkitemId
      ? flatIds.indexOf(listContext.cursorWorkitemId)
      : -1;
    const nextCursor = restoredIndex >= 0
      ? restoredIndex
      : (flatIds.length ? Math.min(cursorRef.current, flatIds.length - 1) : 0);
    cursorInitializedRef.current = true;
    if (nextCursor !== cursor) {
      pendingCursorIndexRef.current = nextCursor;
      applyCursor(nextCursor);
    } else {
      pendingCursorIndexRef.current = null;
    }
  }, [cursor, flatIds, applyCursor, listContext.cursorWorkitemId, listFetchedAt, loadingList]);

  useEffect(() => {
    if (!cursorInitializedRef.current || listFetchedAt == null || (!flatIds.length && loadingList)) return;
    if (pendingCursorIndexRef.current !== null && cursor !== pendingCursorIndexRef.current) return;
    pendingCursorIndexRef.current = null;
    const focusedItem = itemById.get(flatIds[cursor]);
    updateListContext({ cursorWorkitemId: focusedItem?.workitemId ?? null });
  }, [cursor, flatIds, itemById, listFetchedAt, loadingList, updateListContext]);

  // Shell 对迭代页保留 restoreScroll；等恢复页已有可见数据后再应用并消费。
  useEffect(() => {
    const pendingScrollTop = pendingRestoreScrollRef.current;
    const container = listScrollRef.current;
    if (pendingScrollTop == null || didRestoreScrollRef.current || !container || listFetchedAt == null || loadingList) return;
    if (pageIndex > totalPages || (!pageItems.length && nextToken)) return;

    container.scrollTop = pendingScrollTop;
    pendingRestoreScrollRef.current = null;
    didRestoreScrollRef.current = true;
    if (useUi.getState().restoreScroll === pendingScrollTop) {
      useUi.setState({ restoreScroll: null });
    }
  }, [listFetchedAt, loadingList, nextToken, pageIndex, pageItems.length, totalPages]);

  // 列表容器重挂载（单栏返回列表 / 跨越 760 阈值 / 全宽↔分栏切换）后恢复卸载前滚动位置：
  // 数据未就绪时挂起等待，恢复成功即消费，一次性生效。恢复后短时间内（≤24 帧 ≈ 400ms）粘性重申
  // 目标偏移：重挂载瞬间字体加载/布局收敛会触发浏览器滚动锚定，把刚恢复的偏移再拽偏几个像素。
  useEffect(() => {
    const target = pendingLocalScrollRestoreRef.current;
    const container = listScrollRef.current;
    if (target == null || !container || listFetchedAt == null || loadingList) return;
    if (pageIndex > totalPages || (!pageItems.length && nextToken)) return;
    pendingLocalScrollRestoreRef.current = null;
    container.scrollTop = target;
    let frames = 0;
    const reassert = () => {
      if (listScrollRef.current !== container) return;
      frames += 1;
      if (container.scrollTop !== target) container.scrollTop = target;
      if (frames < 24) requestAnimationFrame(reassert);
    };
    requestAnimationFrame(reassert);
  }, [listMountEpoch, listFetchedAt, loadingList, nextToken, pageIndex, pageItems.length, totalPages]);

  // 仅在用户键盘按键主动切换光标时跟随滚动；数据加载、补拉追加、筛选收敛绝对不触发滚动
  useEffect(() => {
    if (!isKeyboardNavRef.current) return;
    isKeyboardNavRef.current = false;
    const id = flatIds[cursor];
    if (id) scrollRowIntoView(id);
  }, [cursor, flatIds, scrollRowIntoView]);

  // 抽屉开启状态下，键盘光标移动联动更新抽屉详情内容（Linear 核心交互：j/k 快速连续检视）
  // 仅在 cursor 变化且当前未在钻取子工作项时，联动切换工作项
  const prevCursorRef = useRef(cursor);
  useEffect(() => {
    const cursorChanged = prevCursorRef.current !== cursor;
    prevCursorRef.current = cursor;
    if (!cursorChanged) return;
    if (!peekWorkitemId) return;
    // 钻取子任务/缺陷期间，若用户明确按 j/k 移动主列表光标，先清空钻取层级回到主列表项联动
    const currentItem = itemById.get(flatIds[cursor]);
    if (currentItem && currentItem.workitemId !== peekWorkitemId) {
      setPeekParentWorkitemId(null);
      setPeekWorkitemId(currentItem.workitemId);
      void useApp.getState().select(currentItem.workitemId);
    }
  }, [cursor, flatIds, itemById, peekWorkitemId]);

  // 阶梯式 Esc（钻取优先于关抽屉）：抽屉内已钻取子工作项时，Esc 先退回父需求而非整个关抽屉。
  // 用捕获阶段监听先于 React Aria 的 document 级 Esc dismiss；抽屉之上有其他浮层（菜单/弹窗/Tooltip）
  // 或焦点在文本编辑中时不接管，交由对应浮层原生处理。
  useEffect(() => {
    if (!peekWorkitemId || !peekParentWorkitemId) return;
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (isEditing(e.target)) return;
      if (!isWorkspacePeekDrawerOnly()) return;
      if (document.querySelector('[role="tooltip"]:not([data-closed]):not([hidden])')) return;
      e.preventDefault();
      e.stopPropagation();
      const parentId = peekParentWorkitemId;
      setPeekWorkitemId(parentId);
      setPeekParentWorkitemId(null);
      void useApp.getState().select(parentId);
    };
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [peekWorkitemId, peekParentWorkitemId]);

  // 键盘导航（Linear 操作逻辑核心）：j/↓ k/↑ 循环移动光标，Enter 打开光标行，/ 聚焦筛选输入框。
  // 焦点在文本输入控件 / 命令面板打开时让路；右键菜单打开时按键归菜单（防弹层后方的幽灵光标移动与 Enter 双重动作）；
  // 焦点在按钮/链接上时 Enter 交还原生激活，避免一次按键双重动作。
  // Peek 抽屉开启时：若可见浮层仅有抽屉本身，放行 j/k 连续检视；Esc（关抽屉 / 钻取退回）
  // 与 x / Enter / 翻页一律让路给抽屉与捕获层，避免与 React Aria 原生 dismiss 双重处理。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.isComposing) return;
      if (isEditing(e.target)) return;
      if (useUi.getState().commandOpen) return;
      if (ctxMenu) return;

      const peekOnly = peekWorkitemId != null && isWorkspacePeekDrawerOnly();
      if (peekOnly) {
        if (e.key !== 'j' && e.key !== 'ArrowDown' && e.key !== 'k' && e.key !== 'ArrowUp') return;
      } else if (hasWorkspaceOverlay()) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll(flatIds, flatIds[cursorRef.current]);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Escape') {
        if (hasSelected) {
          e.preventDefault();
          clearSelection();
          return;
        }
      }

      if (e.key === 'x') {
        const item = itemById.get(flatIds[cursorRef.current]);
        if (item) {
          e.preventDefault();
          toggleSelect(item.workitemId);
          return;
        }
      }

      if (e.key === 'j' || e.key === 'ArrowDown' || e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'k' || e.key === 'ArrowUp' ? -1 : 1;
        isKeyboardNavRef.current = true;
        applyCursor((prev) => (flatIds.length ? (prev + delta + flatIds.length) % flatIds.length : 0));
        return;
      }
      if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        setPageIndex((p) => (e.key === '[' ? Math.max(1, p - 1) : Math.min(totalPages, p + 1)));
        return;
      }
      if (e.key === 'Enter') {
        if (target?.closest('button, a, [role="button"]')) return;
        const item = itemById.get(flatIds[cursorRef.current]);
        if (!item) return;
        e.preventDefault();
        openDetail(item);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flatIds, itemById, openDetail, applyCursor, ctxMenu, totalPages, peekWorkitemId, hasSelected, clearSelection, toggleSelect, selectAll]);

  // 工作项列表区块（全宽列表形态；详情检视统一走 Peek 抽屉，不再有分栏 master 形态）
  const renderWorkitemList = () => (
    <section aria-label="迭代工作项" className="flex flex-col gap-3 border-b border-border/70 pb-6">
      <Accordion
        allowsMultipleExpanded
        expandedKeys={expandedKeys}
        onExpandedChange={onExpandedChange}
        className="flex flex-col gap-4 p-0 w-full"
      >
        {groups.map((group) => {
          return (
            <Accordion.Item key={group.status} id={group.status} className="border-none">
              {/* 组头：Linear 组头形态；微弱字距，清晰层级，可折叠 */}
              <Accordion.Heading>
                <Accordion.Trigger className="group/group-header -ml-1 flex h-7 w-full cursor-pointer items-center gap-2 rounded px-2 text-left transition-colors hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40">
                  <StatusIcon status={group.status} className="size-3.5 shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground/90">{group.status || '未知'}</span>
                  <Chip
                    size="sm"
                    variant="soft"
                    className={cn(
                      "h-4.5 min-w-5 px-1.5 text-[10.5px] font-mono tabular-nums border rounded-full transition-colors",
                      getStatusGroupChipClass(group.status)
                    )}
                  >
                    {group.items.length}
                  </Chip>
                  <Accordion.Indicator className="ms-auto" />
                </Accordion.Trigger>
              </Accordion.Heading>

              {/* 组内工作项：左缩进 + 1px 导引线，明确体现父子层级关系 */}
              <Accordion.Panel>
                <Accordion.Body className="p-0 pt-1">
                  <ListBox
                    aria-label={group.status || '工作项列表'}
                    className="flex flex-col gap-0.5 ml-2.5 pl-3 border-l border-border/50 py-0.5 w-full p-0"
                    selectionMode="none"
                  >
                  {group.items.map((item) => {
                    const rowId = rowKeyOf(item);
                    const assignee = item.assignedTo && item.assignedTo !== '—' ? item.assignedTo : '';
                    const isActive = flatIndexById.get(rowId) === cursor || item.workitemId === peekWorkitemId;
                    const match = matchWorkitemUser(item, currentUser, workitemHighlight);
                    return (
                      <ListBox.Item
                        key={rowId}
                        id={rowId}
                        textValue={item.subject}
                        ref={(el: HTMLElement | null) => {
                          if (el) rowRefs.current.set(rowId, el);
                          else rowRefs.current.delete(rowId);
                        }}
                        data-active={isActive}
                        data-testid="workitem-row"
                        data-identifier={item.identifier ?? ''}
                        onAction={() => {
                          applyCursor(flatIndexById.get(rowId) ?? 0);
                          clearSelection();
                          setSelectionAnchor(item.workitemId);
                          openDetail(item);
                        }}
                        onClick={(e) => {
                          cancelPreviewClick();
                          applyCursor(flatIndexById.get(rowId) ?? 0);
                          const isMultiSelectClick = e.metaKey || e.ctrlKey;
                          if (e.shiftKey) {
                            selectRange(flatIds, item.workitemId, isMultiSelectClick);
                            return;
                          }
                          if (isMultiSelectClick) {
                            toggleSelect(item.workitemId);
                            return;
                          }
                          clearSelection();
                          setSelectionAnchor(item.workitemId);
                          // Keep the row mounted long enough for a native double-click.
                          previewClickTimer.current = setTimeout(() => openDetail(item), ROW_PREVIEW_DELAY_MS);
                        }}
                        onDoubleClick={() => {
                          openInWorkbench(item);
                        }}
                        onKeyDown={(e) => {
                          if (e.defaultPrevented || e.nativeEvent.isComposing) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            applyCursor(flatIndexById.get(rowId) ?? 0);
                            openDetail(item);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          applyCursor(flatIndexById.get(rowId) ?? 0);
                          if (!selectedIds.has(item.workitemId)) selectOnly(item.workitemId);
                          setCtxMenu({ item, x: e.clientX, y: e.clientY });
                        }}
                        className={cn(
                          'group relative flex w-full cursor-pointer items-center gap-2.5 rounded-md text-left transition-colors min-h-0',
                          'hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50',
                          'data-[active=true]:bg-neutral-100 dark:data-[active=true]:bg-neutral-800/80 data-[active=true]:shadow-2xs',
                          'h-10 px-2.5 pl-3',
                        )}
                      >
                        {/* 检视光标 / 参与人 / 处理人左侧精致标识线 */}
                        {match.isAssigned ? (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />
                        ) : match.isRelated ? (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-amber-500" />
                        ) : isActive ? (
                          <span className="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r-full bg-primary/70" />
                        ) : null}

                        {/* 多选 Checkbox（Linear 风格：悬停滑出，已选常驻） */}
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(item.workitemId);
                          }}
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center cursor-pointer transition-opacity',
                            selectedIds.has(item.workitemId) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                          )}
                        >
                          <Checkbox checked={selectedIds.has(item.workitemId)} />
                        </span>

                        {/* 原地流转状态下拉 Popover */}
                        <RowStatusDropdown item={item} />

                        {/* 编号 */}
                        <span className={cn(
                          'shrink-0 font-mono text-xs transition-colors',
                          isActive ? 'text-foreground font-semibold' : 'text-muted-foreground'
                        )}>
                          {item.identifier}
                        </span>

                        {/* 身份匹配高亮徽标（HeroUI Chip 规范） */}
                        {match.isAssigned ? (
                          <Chip
                            size="sm"
                            variant="soft"
                            color="accent"
                            className="h-5 shrink-0 px-2 text-[10.5px] font-medium border border-primary/30 bg-primary/15 text-primary rounded-full select-none"
                          >
                            我负责
                          </Chip>
                        ) : match.isRelated ? (
                          <Chip
                            size="sm"
                            variant="soft"
                            color="warning"
                            className="h-5 shrink-0 px-2 text-[10.5px] font-medium border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-full select-none"
                          >
                            我参与
                          </Chip>
                        ) : null}

                        {/* 标题 */}
                        <OverflowTooltip
                          text={item.subject}
                          className={cn(
                            'min-w-0 flex-1 truncate text-[13px] transition-colors',
                            isActive ? 'text-foreground font-semibold' : 'text-foreground/90 font-medium'
                          )}
                        />

                        {/* 右侧信息 */}
                        <span className={cn(
                          'ml-auto flex shrink-0 items-center gap-2 text-xs transition-colors',
                          isActive ? 'text-foreground/80' : 'text-muted-foreground'
                        )}>
                          <span className="hidden tabular-nums md:block">
                            {item.updatedAt?.slice(5, 10) || '—'}
                          </span>
                          <UserAvatar
                            name={assignee}
                            isAssigned={match.isAssigned}
                            size="sm"
                            showName={false}
                          />
                        </span>
                      </ListBox.Item>
                    );
                  })}
                </ListBox>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>

        {/* 首屏加载（尚无已加载数据）：以行骨架代替纯文字 */}
        {loadingList && !items.length && <WorkitemSkeletonRows />}
        {!filtered.length && !loadingList && (
          <EmptyHint
            icon={SearchXIcon}
            title="无匹配工作项"
            description={items.length && !usingFallback && activeFilterCount
              ? '当前迭代无匹配工作项（可清除筛选试试）'
              : nextToken
                ? '当前迭代暂无已加载的工作项（翻到下一页会继续拉取）'
                : undefined}
          />
        )}
        {/* 底部数量统计与分页器 */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-xs text-muted-foreground">
            <span data-testid="pagination-info" className="text-[11px] text-muted-foreground">
              共 {filtered.length} 项
              {totalPages > 1 && `（第 ${(pageIndex - 1) * PAGE_SIZE + 1} - ${Math.min(pageIndex * PAGE_SIZE, filtered.length)} 项）`}
            </span>

            {/* 多于一页时展示分页控制 */}
            <KeyboardPagination
              pageIndex={pageIndex}
              totalPages={totalPages}
              onPageChange={setPageIndex}
            />
          </div>
        )}
      </section>
    );

  // 本迭代涉及仓库与 CI 独立视图（按当前迭代动态聚合）
  const reposView = (
    <IterationRepoTab
      iterationKey={iteration.name}
      scopedItems={scoped}
      onOpenDetail={openDetail}
    />
  );

  // 分支规则模板独立视图（无边框画布，不套外层 Card）
  const branchesView = (
    <IterationBranches
      iterationId={iteration?.id}
      iterationName={iteration?.name ?? iterationKey}
    />
  );

  const copyContextSelection = (field: 'identifier' | 'subject', singleItemMessage: string) => {
    if (!ctxMenu) return;
    const targets = selectedIds.has(ctxMenu.item.workitemId)
      ? items.filter((item) => selectedIds.has(item.workitemId))
      : [ctxMenu.item];
    const copiedText = targets.map((item) => item[field]).filter(Boolean).join('\n');
    const successMessage = targets.length > 1 ? `已复制 ${targets.length} 项` : singleItemMessage;
    void copyWithToast(copiedText, successMessage);
  };

  // 右键上下文菜单
  const contextMenuNode = (
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
      <DropdownMenuContent className="w-44">
        <DropdownMenuItem onClick={() => { if (ctxMenu) openDetail(ctxMenu.item); }}>
          查看详情
          <DropdownMenuShortcut>↵</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { if (ctxMenu) openInWorkbench(ctxMenu.item); }}>
          全屏打开
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (ctxMenu) {
              void openWorkitemInYunxiao({
                workitemId: ctxMenu.item.workitemId,
                spaceIdentifier: settings?.defaultSpaceIdentifier,
                category: ctxMenu.item.category,
                organizationId: settings?.organizationId,
              });
            }
          }}
        >
          在云效中打开
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => copyContextSelection('identifier', '已复制编号')}
        >
          复制编号
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => copyContextSelection('subject', '已复制标题')}
        >
          复制标题
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // 底部浮动批量操作条（Linear 式 Floating Batch Bar）
  const batchBarNode = <FloatingBatchBar selectedIds={selectedIds} onClear={clearSelection} />;

  /** 收起 Peek 抽屉回到全宽列表（Esc / 关闭按钮 / 全屏打开共用）：只清抽屉选择，列表其余现场不动 */
  const closePeekDrawer = useCallback(() => {
    setPeekWorkitemId(null);
    setPeekParentWorkitemId(null);
  }, []);

  /** 钻取子工作项：抽屉内容切换为子项并记录父级（Esc / 面包屑逐层退回） */
  const handleSelectChild = useCallback((child: WorkitemChild) => {
    setPeekParentWorkitemId(peekWorkitemId);
    setPeekWorkitemId(child.workitemId);
    void useApp.getState().select(child.workitemId);
  }, [peekWorkitemId]);

  /** 从子项详情退回父需求 */
  const handleSelectParent = useCallback((parentId: string) => {
    setPeekWorkitemId(parentId);
    setPeekParentWorkitemId(null);
    void useApp.getState().select(parentId);
  }, []);

  /** 抽屉内「全屏打开」：转入独立工作台并收起抽屉（钻取的子项不在主列表时按面包屑参数兜底） */
  const handlePeekOpenWorkbench = useCallback((id: string, identifier?: string, subject?: string) => {
    const item = itemById.get(id);
    setPeekParentWorkitemId(null);
    if (item) {
      openInWorkbench(item);
      return;
    }
    setPeekWorkitemId(null);
    openWorkitem(id, { workitemId: id, identifier: identifier ?? '', subject });
  }, [itemById, openInWorkbench, openWorkitem]);

  // 全宽模式：居中单栏浏览形态（单栏窄窗下页头 compact 化）；详情检视统一为右侧 Peek 抽屉
  const fullWidthView = (
    <div
      ref={attachListScroll}
      onScroll={handleListScroll}
      className="workspace-scroll min-h-0 flex-1 h-full overflow-y-auto overflow-x-hidden px-5 pb-14 sm:px-8 lg:px-10"
    >
      {/* 页头（PageHeader v2 sticky）：navigation=侧栏开关｜title=迭代｜actions=视图 Tabs + 刷新。
          类别 Tabs + 计数摘要 + 筛选（或仓库/模板行提示）下放正文，随页面滚动。单栏窄窗 density compact 收紧留白。 */}
      <PageHeader
        sticky
        density={singleColumn ? 'compact' : 'regular'}
        navigation={<SidebarTrigger aria-label="折叠/展开侧栏" />}
        title="迭代"
        titleClassName="text-sm font-semibold tracking-tight text-foreground"
        actions={(
          <div className="flex shrink-0 items-center gap-2">
            <Tabs
              value={shownTab}
              onValueChange={(v) => {
                setViewTab(v as 'workitems' | 'repos' | 'branches');
                if (v !== 'workitems') closePeekDrawer();
              }}
            >
              <TabsList size="sm">
                <TabsTrigger value="workitems" className="gap-1.5">
                  <span>工作项</span>
                  <Chip
                    size="sm"
                    variant="soft"
                    className="h-4 min-w-4 px-1 text-[10px] font-mono tabular-nums border border-border/40 bg-muted/30 text-muted-foreground"
                  >
                    {filtered.length}
                  </Chip>
                </TabsTrigger>
                <TabsTrigger value="repos" className="gap-1.5">
                  <span>涉及仓库</span>
                  {scopedRepoCount > 0 && (
                    <Chip
                      size="sm"
                      variant="soft"
                      className="h-4 min-w-4 px-1 text-[10px] font-mono tabular-nums border border-border/40 bg-muted/30 text-muted-foreground"
                    >
                      {scopedRepoCount}
                    </Chip>
                  )}
                </TabsTrigger>
                {!isUnplanned && (
                  <TabsTrigger value="branches" className="gap-1.5">
                    <span>分支模板</span>
                    {templateCount > 0 && (
                      <Chip
                        size="sm"
                        variant="soft"
                        className="h-4 min-w-4 px-1 text-[10px] font-mono tabular-nums border border-border/40 bg-muted/30 text-muted-foreground"
                      >
                        {templateCount}
                      </Chip>
                    )}
                  </TabsTrigger>
                )}
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="刷新"
              data-workspace-refresh
              disabled={loadingList || revalidatingList}
              onClick={() => {
                // 手动刷新覆盖本页全部数据源：工作项 + 迭代 + 各仓库 CI（双缓冲平滑更新，杜绝列表坍塌与闪烁）
                void (items.length ? revalidateList() : loadList(false));
                void loadIterations();
                refreshCi();
              }}
            >
              <RefreshCwIcon className={cn('size-4', (loadingList || revalidatingList) && 'animate-spin')} />
            </Button>
          </div>
        )}
      />

      {/* 页头贴左全宽，正文居中限宽；工具行已下放正文、随页面滚动 */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 pt-4">
        {/* 工具行（自吸顶页头下放正文）：随内容滚动 */}
        {viewTab === 'workitems' && (
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <Tabs value={category} onValueChange={(v) => void setCategory(v as Category)}>
              <TabsList size="sm">
                {(['Req', 'Bug', 'Task'] as Category[]).map((c) => (
                  <TabsTrigger key={c} value={c}>{CATEGORY_LABELS[c]}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{toolSummary}</span>
            {/* 筛选组（自侧栏迁入）：处理人 / 关联人 / 状态多选，命中时给清除入口 */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <WorkitemFilterBar options={filterOptions} activeFilterCount={activeFilterCount} />
            </div>
          </div>
        )}
        {viewTab === 'repos' && (
          <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">本迭代工作项实际涉及的代码仓库，可手动选择分支与环境触发验证，并实时监控构建 Job</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => useUi.getState().openSettings('ci')}
              className="gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link2Icon className="size-3" />
              <span>配置 CI 绑定</span>
            </Button>
          </div>
        )}
        {shownTab === 'branches' && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            针对各仓库定义的分支生成规则模板，保存在本机供需求仓库选用
          </span>
        )}

        {shownTab === 'workitems' && renderWorkitemList()}
        {shownTab === 'repos' && reposView}
        {shownTab === 'branches' && branchesView}
      </div>

      {contextMenuNode}
      {batchBarNode}
    </div>
  );

  // 根容器：常驻测量节点；列表常驻全宽渲染，详情统一经右侧 Peek 抽屉就地滑出（列表现场永不卸载），
  // 跨越 760 阈值只影响页头 compact 密度，绝不 reset 状态、不重建数据请求。
  return (
    <div ref={measureRef} className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      {fullWidthView}
      <WorkitemPeekDrawer
        workitemId={peekWorkitemId}
        parentWorkitem={peekParentWorkitemId ? itemById.get(peekParentWorkitemId) ?? null : null}
        onClose={closePeekDrawer}
        onOpenWorkbench={handlePeekOpenWorkbench}
        onSelectChild={handleSelectChild}
        onSelectParent={handleSelectParent}
      />
    </div>
  );
}
