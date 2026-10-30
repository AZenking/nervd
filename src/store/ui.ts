// 工作区视图状态（nervd-new-ui 基准的信息架构）：
// iteration=迭代总览 / requirement=需求详情 / full-settings=完整设置
// 与 store/app.ts 的业务状态分离；不持久化——每次启动回到当前迭代。
// 导航历史与层级链（UX 评审 A2）：面包屑可点、⌘← 后退、子任务可回父需求。
// 设置页互切/离开时若设置草稿有未保存修改，则拦截为 pendingView 由 Shell 弹确认（UX A1）。
import { flushSync } from 'react-dom';
import { create } from 'zustand';
import type { Category, IterationSummary } from '../types';
import { useApp } from './app';
import { useSettingsDraft } from './settings-draft';

/** 演示迭代：sprints OpenAPI 不可用（未配置 / 接口失败）时的回退壳 */
export const PLACEHOLDER_ITERATIONS: IterationSummary[] = [
  { id: 'placeholder-benz', name: 'Benz-20261016', title: '前端优化迭代', state: '进行中', startDate: '', endDate: '' },
];
/** 虚拟「未规划」迭代：云效 OpenAPI 不返回该桶（实测 sprints 仅 TODO/DOING/ARCHIVED），用 sprintId 为空的工作项聚合呈现 */
export const UNPLANNED_ITERATION: IterationSummary = {
  id: '', name: '未规划', title: '', state: '未开始', startDate: '', endDate: '',
};

/** 需要展示的迭代状态：正在执行中 / 未开始；归档（含已完成、已结束）等不展示 */
const VISIBLE_ITERATION_STATES = new Set(['进行中', '未开始']);

/** 过滤出需要展示的迭代（进行中 / 未开始） */
export function visibleIterations(list: IterationSummary[]): IterationSummary[] {
  return list.filter((it) => VISIBLE_ITERATION_STATES.has(it.state));
}

/** 真实迭代列表为空时回退占位壳（与 PLACEHOLDER_ITERATIONS 同形态），并过滤掉归档等不可见迭代；真实迭代可用时追加虚拟「未规划」桶 */
export function iterationsOrFallback(real: IterationSummary[]): IterationSummary[] {
  const base = real.length ? real : PLACEHOLDER_ITERATIONS;
  const visible = visibleIterations(base);
  // 极端情况：全部迭代都已归档 → 仍展示原列表，避免迭代壳空掉
  const list = visible.length ? visible : base;
  return real.length ? [...list, UNPLANNED_ITERATION] : list;
}

// ---- 工作项筛选（侧栏迭代内的筛选控件与主区工作项网格共享同一份选中状态） ----

export interface WorkitemFilters {
  assignees: string[]; // 处理人（'未分配' 聚合空值）
  related: string[]; // 关联人（'未关联' 聚合空数组）
  statuses: string[]; // 工作项状态名
}

/** 可筛选行最小字段（WorkitemRow / 侧栏条目均满足） */
export interface FilterableRow {
  assignedTo?: string;
  relatedTo?: string[];
  status: string;
  sprintId?: string;
}

/** 筛选选中值 → 归一化展示值 */
const assigneeOf = (it: FilterableRow) => (it.assignedTo && it.assignedTo !== '—' ? it.assignedTo : '未分配');
const relatedOf = (it: FilterableRow) => (it.relatedTo?.length ? it.relatedTo : ['未关联']);

/** 按当前迭代收窄工作项：真实迭代命中时只留 sprint 匹配的行（真实迭代存在但未命中时返回空；占位壳/未加载真实迭代时回退全量） */
export function scopedItems<T extends FilterableRow>(
  items: T[],
  iterationKey: string,
  realIterations: IterationSummary[],
): T[] {
  if (!realIterations.length) return items;
  const current = realIterations.find((it) => it.name === iterationKey);
  if (current) return items.filter((it) => it.sprintId === current.id);
  if (iterationKey === UNPLANNED_ITERATION.name) return items.filter((it) => !it.sprintId);
  return [];
}

/** 筛选选项（含计数，按计数降序） */
export function buildWorkitemFilterOptions(items: FilterableRow[]): {
  assignees: [string, number][];
  related: [string, number][];
  statuses: [string, number][];
} {
  const assignees = new Map<string, number>();
  const related = new Map<string, number>();
  const statuses = new Map<string, number>();
  for (const it of items) {
    const a = assigneeOf(it);
    assignees.set(a, (assignees.get(a) ?? 0) + 1);
    for (const r of relatedOf(it)) related.set(r, (related.get(r) ?? 0) + 1);
    statuses.set(it.status, (statuses.get(it.status) ?? 0) + 1);
  }
  const sorted = (m: Map<string, number>) =>
    [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  return { assignees: sorted(assignees), related: sorted(related), statuses: sorted(statuses) };
}

/** 应用筛选（全空 = 不筛选） */
export function applyWorkitemFilters<T extends FilterableRow>(items: T[], f: WorkitemFilters): T[] {
  if (!f.assignees.length && !f.related.length && !f.statuses.length) return items;
  return items.filter((it) => {
    if (f.assignees.length && !f.assignees.includes(assigneeOf(it))) return false;
    if (f.related.length && !f.related.some((r) => relatedOf(it).includes(r))) return false;
    if (f.statuses.length && !f.statuses.includes(it.status)) return false;
    return true;
  });
}

export type WorkspaceView = 'iteration' | 'requirement' | 'integration' | 'overview' | 'recents' | 'full-settings' | 'schedules' | 'local-tasks';
export type SettingsSection = 'connection' | 'trace' | 'ci' | 'security' | 'ai' | 'about';
export type IterationViewTab = 'workitems' | 'repos' | 'branches';

/** 迭代列表的可恢复交互上下文，由 IterationView 同步当前本地状态。 */
export interface IterationListContext {
  pageIndex: number;
  cursorWorkitemId: string | null;
  collapsedStatuses: string[];
  selectedWorkitemIds: string[];
  splitWorkitemId: string | null;
  splitParentWorkitemId: string | null;
  viewTab: IterationViewTab;
}

const DEFAULT_ITERATION_LIST_CONTEXT: IterationListContext = {
  pageIndex: 1,
  cursorWorkitemId: null,
  collapsedStatuses: [],
  selectedWorkitemIds: [],
  splitWorkitemId: null,
  splitParentWorkitemId: null,
  viewTab: 'workitems',
};

/** 主题偏好模式：跟随系统 / 深色 / 浅色 */
export type ThemeMode = 'system' | 'dark' | 'light';
/** 实际渲染生效的主题：深色 / 浅色 */
export type ResolvedTheme = 'dark' | 'light';

/** 获取系统当前明暗偏好（默认回退深色以契合客户端基准视觉） */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

/** 将用户主题模式解析为当前实际明暗模式 */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return getSystemTheme();
  }
  return mode;
}

/** 读取本地持久化的主题偏好（未配置时默认跟随系统） */
export function getStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const val = localStorage.getItem('nervd-theme');
  if (val === 'light' || val === 'dark' || val === 'system') return val;
  return 'system';
}

/** 构建工作台的内部页面；具体参数草稿由工作台 hook 持有。 */
export type BuildWorkbenchPage = 'runs' | 'parameters' | 'logs';
export type BuildWorkbenchTarget =
  | { kind: 'repo'; repoId: number; title: string; defaultBranch?: string; runId?: string }
  | { kind: 'pipeline'; pipelineId: number; jobId?: number; title: string; runId?: number };

/** 面包屑上的工作项（父 › 子层级链的节点） */
export interface WorkitemCrumb {
  workitemId: string;
  identifier: string;
  subject?: string;
}

/** 导航历史快照——包含返回/前进及应用重启所需的可恢复上下文。 */
interface NavSnapshot {
  view: WorkspaceView;
  settingsSection: SettingsSection;
  iterationKey: string;
  category: Category;
  filters: WorkitemFilters;
  selectedId: string | null;
  chain: WorkitemCrumb[];
  listSearch: string;
  listContext: IterationListContext;
  scrollTop: number;
}

const HISTORY_LIMIT = 30;
const NAVIGATION_STORAGE_KEY = 'nervd-navigation';
const NAVIGATION_STORAGE_VERSION = 1;
const isSettingsView = (v: WorkspaceView) => v === 'full-settings';

interface PersistedNavigation {
  version: typeof NAVIGATION_STORAGE_VERSION;
  current: NavSnapshot;
  history: NavSnapshot[];
  forwardHistory: NavSnapshot[];
}

export type NavigationRecordParseResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; value: PersistedNavigation };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const isNullableId = (value: unknown): value is string | null =>
  value === null || isNonEmptyString(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const SETTINGS_SECTIONS: SettingsSection[] = ['connection', 'trace', 'ci', 'security', 'ai', 'about'];
const WORKSPACE_VIEWS: WorkspaceView[] = [
  'iteration', 'requirement', 'integration', 'overview', 'recents', 'full-settings', 'schedules', 'local-tasks',
];
const ITERATION_VIEW_TABS: IterationViewTab[] = ['workitems', 'repos', 'branches'];
const CATEGORIES: Category[] = ['Req', 'Bug', 'Task'];

function parseFilters(value: unknown): WorkitemFilters | null {
  if (!isRecord(value) || !isStringArray(value.assignees) || !isStringArray(value.related) || !isStringArray(value.statuses)) {
    return null;
  }
  return {
    assignees: [...value.assignees],
    related: [...value.related],
    statuses: [...value.statuses],
  };
}

function parseListContext(value: unknown): IterationListContext | null {
  if (!isRecord(value)) return null;
  if (!Number.isInteger(value.pageIndex) || (value.pageIndex as number) < 1) return null;
  if (!isNullableId(value.cursorWorkitemId) || !isStringArray(value.collapsedStatuses)) return null;
  if (!isStringArray(value.selectedWorkitemIds)) return null;
  if (!isNullableId(value.splitWorkitemId) || !isNullableId(value.splitParentWorkitemId)) return null;
  if (!ITERATION_VIEW_TABS.includes(value.viewTab as IterationViewTab)) return null;
  return {
    pageIndex: value.pageIndex as number,
    cursorWorkitemId: value.cursorWorkitemId,
    collapsedStatuses: [...new Set(value.collapsedStatuses)],
    selectedWorkitemIds: [...new Set(value.selectedWorkitemIds)],
    splitWorkitemId: value.splitWorkitemId,
    splitParentWorkitemId: value.splitParentWorkitemId,
    viewTab: value.viewTab as IterationViewTab,
  };
}

function parseSnapshot(value: unknown): NavSnapshot | null {
  if (!isRecord(value)) return null;
  if (!WORKSPACE_VIEWS.includes(value.view as WorkspaceView)) return null;
  if (!SETTINGS_SECTIONS.includes(value.settingsSection as SettingsSection)) return null;
  if (!isNonEmptyString(value.iterationKey) || !isNullableId(value.selectedId)) return null;
  if (!CATEGORIES.includes(value.category as Category)) return null;
  if (!Array.isArray(value.chain) || !value.chain.every((item) =>
    isRecord(item) && isNonEmptyString(item.workitemId) && isNonEmptyString(item.identifier) &&
    (item.subject === undefined || typeof item.subject === 'string'),
  )) return null;
  if (!Array.isArray(value.chain) || value.chain.length > 50 || typeof value.listSearch !== 'string') return null;
  if (typeof value.scrollTop !== 'number' || !Number.isFinite(value.scrollTop) || value.scrollTop < 0) return null;
  const filters = parseFilters(value.filters);
  const listContext = parseListContext(value.listContext);
  if (!filters || !listContext) return null;
  return {
    view: value.view as WorkspaceView,
    settingsSection: value.settingsSection as SettingsSection,
    iterationKey: value.iterationKey,
    category: value.category as Category,
    filters,
    selectedId: value.selectedId,
    chain: value.chain.map((item) => ({
      workitemId: item.workitemId as string,
      identifier: item.identifier as string,
      ...(typeof item.subject === 'string' ? { subject: item.subject } : {}),
    })),
    listSearch: value.listSearch,
    listContext,
    scrollTop: value.scrollTop,
  };
}

/** 校验已持久化导航记录；数据 ID 不与当前尚未加载的远端列表比对。 */
export function parseNavigationRecord(serialized: string | null): NavigationRecordParseResult {
  if (serialized === null) return { status: 'missing' };
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.version !== NAVIGATION_STORAGE_VERSION) return { status: 'invalid' };
    const current = parseSnapshot(value.current);
    if (!current || !Array.isArray(value.history) || !Array.isArray(value.forwardHistory)) return { status: 'invalid' };
    if (value.history.length > HISTORY_LIMIT || value.forwardHistory.length > HISTORY_LIMIT) return { status: 'invalid' };
    const history = value.history.map(parseSnapshot);
    const forwardHistory = value.forwardHistory.map(parseSnapshot);
    if (history.some((snapshot) => snapshot === null) || forwardHistory.some((snapshot) => snapshot === null)) {
      return { status: 'invalid' };
    }
    return {
      status: 'valid',
      value: {
        version: NAVIGATION_STORAGE_VERSION,
        current,
        history: history as NavSnapshot[],
        forwardHistory: forwardHistory as NavSnapshot[],
      },
    };
  } catch {
    return { status: 'invalid' };
  }
}

interface UiStore {
  view: WorkspaceView;
  settingsSection: SettingsSection;
  iterationKey: string;
  filters: WorkitemFilters;
  /** 迭代列表恢复上下文；IterationView 通过 updateListContext 同步本地交互状态。 */
  listContext: IterationListContext;
  updateListContext(patch: Partial<IterationListContext>): void;
  /** 迭代页工作项搜索词（入导航快照，后退可恢复） */
  listSearch: string;
  setListSearch(value: string): void;
  /** 导航后退栈 */
  history: NavSnapshot[];
  /** 导航前进栈 */
  forwardHistory: NavSnapshot[];
  /** 待恢复的工作区滚动位置（Shell 应用后清空） */
  restoreScroll: number | null;
  /** App 完成 booting 后调用；从本地记录恢复详情数据，并且每个运行实例只执行一次。 */
  restoreNavigation(): Promise<void>;
  /** 需求详情的层级链（末位 = 当前详情）；从子任务进入时为 [父, 子] */
  chain: WorkitemCrumb[];
  setView(view: WorkspaceView): void;
  setSettingsSection(section: SettingsSection): void;
  openSettings(section?: SettingsSection): void;
  setIteration(key: string): void;
  setIterationKey(key: string): void;
  toggleFilter(kind: keyof WorkitemFilters, value: string): void;
  clearFilters(): void;
  /** 打开工作项详情：记录历史与层级链（parent 传入时形成 父 › 子 面包屑） */
  openWorkitem(workitemId: string, crumb: WorkitemCrumb, parent?: WorkitemCrumb): void;
  /** 后退一步（⌘←）；无历史时不动 */
  back(): Promise<void>;
  /** 前进一步（⌘]）；无前进记录时不动 */
  forward(): Promise<void>;
  /** ⌘K 命令面板开关（Linear 式全局入口：导航 / 迭代 / 工作项 / 操作） */
  commandOpen: boolean;
  setCommandOpen(open: boolean): void;
  toggleCommandMenu(): void;
  /** ? 键盘快捷键面板开关（全局 `?` 触发；仅新增字段，向后兼容） */
  shortcutsOpen: boolean;
  /** 快捷键面板开合（Base UI Dialog 受控） */
  setShortcutsOpen(open: boolean): void;
  /** 关于 nervd 弹窗开关 */
  aboutOpen: boolean;
  setAboutOpen(open: boolean): void;
  /** 全局 ⌘B 快速构建弹窗开关 */
  quickBuildOpen: boolean;
  setQuickBuildOpen(open: boolean): void;
  toggleQuickBuild(): void;
  /** 主题模式：跟随系统 system、深色 dark 与浅色 light */
  theme: ThemeMode;
  /** 当前实际渲染的明暗模式：'dark' | 'light' */
  resolvedTheme: ResolvedTheme;
  setTheme(theme: ThemeMode, event?: { clientX: number; clientY: number } | null): void;
  setResolvedTheme(resolvedTheme: ResolvedTheme): void;
  toggleTheme(event?: { clientX: number; clientY: number } | null): void;
  /** 单一构建工作台导航状态；只保存目标与页面，不保存表单草稿。 */
  buildWorkbenchOpen: boolean;
  buildWorkbenchTarget: BuildWorkbenchTarget | null;
  buildWorkbenchPage: BuildWorkbenchPage;
  buildWorkbenchHistory: BuildWorkbenchPage[];
  openBuildWorkbench(target: BuildWorkbenchTarget, page?: BuildWorkbenchPage): void;
  navigateBuildWorkbench(page: BuildWorkbenchPage): void;
  backBuildWorkbench(): void;
  closeBuildWorkbench(): void;
}

function cloneFilters(filters: WorkitemFilters): WorkitemFilters {
  return {
    assignees: [...filters.assignees],
    related: [...filters.related],
    statuses: [...filters.statuses],
  };
}

function cloneListContext(context: IterationListContext): IterationListContext {
  return {
    ...context,
    collapsedStatuses: [...context.collapsedStatuses],
    selectedWorkitemIds: [...context.selectedWorkitemIds],
  };
}

function normalizeListContext(context: IterationListContext): IterationListContext {
  return {
    pageIndex: Number.isInteger(context.pageIndex) && context.pageIndex >= 1 ? context.pageIndex : 1,
    cursorWorkitemId: isNonEmptyString(context.cursorWorkitemId) ? context.cursorWorkitemId : null,
    collapsedStatuses: [...new Set(context.collapsedStatuses.filter(isNonEmptyString))],
    selectedWorkitemIds: [...new Set(context.selectedWorkitemIds.filter(isNonEmptyString))],
    splitWorkitemId: isNonEmptyString(context.splitWorkitemId) ? context.splitWorkitemId : null,
    splitParentWorkitemId: isNonEmptyString(context.splitParentWorkitemId) ? context.splitParentWorkitemId : null,
    viewTab: ITERATION_VIEW_TABS.includes(context.viewTab) ? context.viewTab : 'workitems',
  };
}

function workspaceScrollTop(): number {
  if (typeof document === 'undefined') return 0;
  const value = document.querySelector<HTMLElement>('.workspace-scroll')?.scrollTop ?? 0;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function captureSnapshot(state: UiStore, scrollTop = workspaceScrollTop()): NavSnapshot {
  return {
    view: state.view,
    settingsSection: state.settingsSection,
    iterationKey: state.iterationKey,
    category: useApp.getState().category,
    filters: cloneFilters(state.filters),
    selectedId: useApp.getState().selectedId,
    chain: state.chain.map((crumb) => ({ ...crumb })),
    listSearch: state.listSearch,
    listContext: cloneListContext(state.listContext),
    scrollTop,
  };
}

function copySnapshot(snapshot: NavSnapshot): NavSnapshot {
  return {
    ...snapshot,
    filters: cloneFilters(snapshot.filters),
    chain: snapshot.chain.map((crumb) => ({ ...crumb })),
    listContext: cloneListContext(snapshot.listContext),
  };
}

function readStoredNavigation(): NavigationRecordParseResult {
  try {
    if (typeof localStorage === 'undefined') return { status: 'missing' };
    return parseNavigationRecord(localStorage.getItem(NAVIGATION_STORAGE_KEY));
  } catch {
    // 存储不可用时继续以本次运行的内存导航工作。
    return { status: 'missing' };
  }
}

function persistNavigation(state: UiStore, currentScrollTop?: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const record: PersistedNavigation = {
      version: NAVIGATION_STORAGE_VERSION,
      current: captureSnapshot(state, currentScrollTop ?? workspaceScrollTop()),
      history: state.history.map(copySnapshot),
      forwardHistory: state.forwardHistory.map(copySnapshot),
    };
    localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // 配额 / 隐私模式限制不能中断前台导航。
  }
}

const storedNavigationAtStartup = readStoredNavigation();
const defaultNavigationSnapshot: NavSnapshot = {
  view: 'overview',
  settingsSection: 'connection',
  iterationKey: PLACEHOLDER_ITERATIONS[0].name,
  category: 'Req',
  filters: { assignees: [], related: [], statuses: [] },
  selectedId: null,
  chain: [],
  listSearch: '',
  listContext: cloneListContext(DEFAULT_ITERATION_LIST_CONTEXT),
  scrollTop: 0,
};
const startupSnapshot = storedNavigationAtStartup.status === 'valid'
  ? storedNavigationAtStartup.value.current
  : storedNavigationAtStartup.status === 'invalid'
    ? { ...defaultNavigationSnapshot, view: 'overview' as const }
    : defaultNavigationSnapshot;

/** 离开设置视图且草稿有未保存修改：无校验错误则静默保存放行，有阻断错误则弹窗确认 */
function guardSettingsDraft(current: WorkspaceView, next: WorkspaceView | 'back' | 'forward'): boolean {
  if (!isSettingsView(current)) return false;
  const draft = useSettingsDraft.getState();
  if (!draft.isDirty()) return false;
  // 若存在阻断保存的校验错误：无法静默保存，拦截并交给 Shell 的确认弹窗
  if (draft.hasBlockingErrors()) {
    draft.setPendingView(next);
    return true;
  }
  // 若无校验错误：静默异步持久化并直接放行，提供现代全自动保存的无感体验
  void draft.flushAutoSave();
  return false;
}

export const useUi = create<UiStore>((set, get) => {
  let startupRestoreComplete = false;
  let startupRestorePromise: Promise<void> | null = null;
  const pushHistory = (state: UiStore) => [
    ...state.history,
    captureSnapshot(state),
  ].slice(-HISTORY_LIMIT);
  const persistCurrent = (scrollTop?: number) => persistNavigation(get(), scrollTop);
  const restoreSnapshot = async (snapshot: NavSnapshot) => {
    const restored = copySnapshot(snapshot);
    set({
      view: restored.view,
      settingsSection: restored.settingsSection,
      iterationKey: restored.iterationKey,
      filters: restored.filters,
      chain: restored.chain,
      listSearch: restored.listSearch,
      listContext: restored.listContext,
      restoreScroll: restored.scrollTop,
    });
    let app = useApp.getState();
    if (app.category !== restored.category) {
      await app.setCategory(restored.category);
      app = useApp.getState();
    }
    const targetId = restored.view === 'requirement'
      ? restored.chain[restored.chain.length - 1]?.workitemId ?? restored.selectedId
      : restored.view === 'iteration'
        ? restored.listContext.splitWorkitemId ?? null
        : null;
    if (targetId && (app.selectedId !== targetId || !app.detail)) {
      await app.select(targetId);
    } else if (!targetId && app.selectedId !== restored.selectedId) {
      useApp.setState({ selectedId: restored.selectedId });
    }
  };

  return {
    view: startupSnapshot.view,
    settingsSection: startupSnapshot.settingsSection,
    iterationKey: startupSnapshot.iterationKey,
    filters: cloneFilters(startupSnapshot.filters),
    listContext: cloneListContext(startupSnapshot.listContext),
    updateListContext: (patch) => {
      const current = get().listContext;
      const next = normalizeListContext({ ...current, ...patch });
      set({ listContext: next });
      persistCurrent();
    },
    listSearch: startupSnapshot.listSearch,
    setListSearch: (value) => {
      set({ listSearch: value });
      persistCurrent();
    },
    history: storedNavigationAtStartup.status === 'valid'
      ? storedNavigationAtStartup.value.history.map(copySnapshot)
      : [],
    forwardHistory: storedNavigationAtStartup.status === 'valid'
      ? storedNavigationAtStartup.value.forwardHistory.map(copySnapshot)
      : [],
    restoreScroll: storedNavigationAtStartup.status === 'valid' ? startupSnapshot.scrollTop : null,
    chain: startupSnapshot.chain.map((crumb) => ({ ...crumb })),
    commandOpen: false,
    setCommandOpen: (commandOpen) => set({ commandOpen }),
    toggleCommandMenu: () => set((st) => ({ commandOpen: !st.commandOpen })),
    shortcutsOpen: false,
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    aboutOpen: false,
    setAboutOpen: (aboutOpen) => set({ aboutOpen }),
    quickBuildOpen: false,
    setQuickBuildOpen: (quickBuildOpen) => set({ quickBuildOpen }),
    toggleQuickBuild: () => set((st) => ({ quickBuildOpen: !st.quickBuildOpen })),
    buildWorkbenchOpen: false,
    buildWorkbenchTarget: null,
    buildWorkbenchPage: 'runs',
    buildWorkbenchHistory: [],
    openBuildWorkbench: (target, page = 'runs') =>
      set({
        buildWorkbenchOpen: true,
        buildWorkbenchTarget: target,
        buildWorkbenchPage: page,
        // 页面直接进入参数 / 日志时，返回到该目标的运行记录，而不是直接关闭工作台。
        buildWorkbenchHistory: page === 'runs' ? [] : ['runs'],
      }),
    navigateBuildWorkbench: (page) =>
      set((st) => ({
        buildWorkbenchOpen: true,
        buildWorkbenchPage: page,
        buildWorkbenchHistory: st.buildWorkbenchPage === page
          ? st.buildWorkbenchHistory
          : [...st.buildWorkbenchHistory, st.buildWorkbenchPage],
      })),
    backBuildWorkbench: () =>
      set((st) => {
        const previous = st.buildWorkbenchHistory[st.buildWorkbenchHistory.length - 1];
        if (!previous) return { buildWorkbenchOpen: false, buildWorkbenchTarget: null };
        return {
          buildWorkbenchPage: previous,
          buildWorkbenchHistory: st.buildWorkbenchHistory.slice(0, -1),
        };
      }),
    closeBuildWorkbench: () =>
      set({
        buildWorkbenchOpen: false,
        buildWorkbenchTarget: null,
        buildWorkbenchPage: 'runs',
        buildWorkbenchHistory: [],
      }),
    theme: getStoredTheme(),
    resolvedTheme: resolveTheme(getStoredTheme()),
    setTheme: (theme, event) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem('nervd-theme', theme);
      const nextResolved = resolveTheme(theme);
      const currentResolved = get().resolvedTheme;

      const applyTheme = () => {
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', nextResolved === 'dark');
        }
        set({ theme, resolvedTheme: nextResolved });
      };

      if (nextResolved === currentResolved) {
        applyTheme();
        return;
      }

      // 降级判定：检查环境支持与系统减弱动态效果偏好
      const isReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const doc = typeof document !== 'undefined' ? (document as Document & {
        startViewTransition?: (callback: () => void | Promise<void>) => { ready: Promise<void> };
      }) : null;
      const isAppearanceTransition = Boolean(
        doc && typeof doc.startViewTransition === 'function' && !isReducedMotion,
      );

      if (!isAppearanceTransition || !doc?.startViewTransition) {
        applyTheme();
        return;
      }

      const x = event?.clientX ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
      const y = event?.clientY ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 0);
      const endRadius = Math.hypot(
        Math.max(x, (typeof window !== 'undefined' ? window.innerWidth : 0) - x),
        Math.max(y, (typeof window !== 'undefined' ? window.innerHeight : 0) - y),
      );

      const transition = doc.startViewTransition(() => {
        flushSync(() => {
          applyTheme();
        });
      });

      if (!transition) return;

      void transition.ready.then(() => {
        const isDark = nextResolved === 'dark';
        const clipPath = [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ];

        try {
          document.documentElement.animate(
            {
              clipPath: isDark ? [...clipPath].reverse() : clipPath,
            },
            {
              duration: 400,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              pseudoElement: isDark ? '::view-transition-old(root)' : '::view-transition-new(root)',
            } as KeyframeAnimationOptions,
          );
        } catch {
          // 在不支持伪元素 Web Animations 的早期 WebKit 中静默回退
        }
      });
    },
    setResolvedTheme: (resolvedTheme) => {
      const currentResolved = get().resolvedTheme;
      if (currentResolved === resolvedTheme) return;
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
      }
      set({ resolvedTheme });
    },
    toggleTheme: (event) => {
      const currentTheme = get().theme;
      const currentResolved = get().resolvedTheme;
      const systemTheme = getSystemTheme();

      let next: ThemeMode;
      if (currentTheme === 'system') {
        // 跟随系统状态下点击，切换到与当前视觉相反的显式模式
        next = currentResolved === 'dark' ? 'light' : 'dark';
      } else if (currentTheme !== systemTheme) {
        // 当前为与系统相反的模式，切换到与系统相同的显式模式
        next = systemTheme;
      } else {
        // 当前显式模式与系统一致，切换回跟随系统
        next = 'system';
      }

      get().setTheme(next, event);
    },
    setView: (view) => {
      const st = get();
      if (view === st.view) return;
      if (guardSettingsDraft(st.view, view)) return;
      set({ view, history: pushHistory(st), forwardHistory: [], restoreScroll: null });
      persistCurrent();
    },
    setSettingsSection: (settingsSection) => {
      set({ settingsSection });
      persistCurrent();
    },
    openSettings: (settingsSection = 'connection') => {
      const st = get();
      if (isSettingsView(st.view)) {
        set({ settingsSection });
        persistCurrent();
        return;
      }
      set({
        view: 'full-settings',
        settingsSection,
        history: pushHistory(st),
        forwardHistory: [],
        restoreScroll: null,
      });
      persistCurrent();
    },
    setIteration: (iterationKey) => {
      const st = get();
      if (iterationKey === st.iterationKey && st.view === 'iteration') return;
      if (guardSettingsDraft(st.view, 'iteration')) return;
      set({
        iterationKey,
        view: 'iteration',
        history: pushHistory(st),
        forwardHistory: [],
        restoreScroll: null,
      });
      persistCurrent();
    },
    setIterationKey: (iterationKey) => {
      set({ iterationKey });
      persistCurrent();
    },
    toggleFilter: (kind, value) => {
      set((st) => {
        const values = st.filters[kind];
        const next = values.includes(value)
          ? values.filter((v) => v !== value)
          : [...values, value];
        return { filters: { ...st.filters, [kind]: next } };
      });
      persistCurrent();
    },
    clearFilters: () => {
      set({ filters: { assignees: [], related: [], statuses: [] } });
      persistCurrent();
    },
    openWorkitem: (workitemId, crumb, parent) => {
      const st = get();
      const blocked = guardSettingsDraft(st.view, 'requirement');
      const chain = parent ? [parent, crumb] : [crumb];
      // 选择与层级链先落地（只读操作）；被拦截时确认后将 setView 到详情。
      set(blocked
        ? { chain }
        : {
            chain,
            view: 'requirement',
            history: pushHistory(st),
            forwardHistory: [],
            restoreScroll: null,
          });
      void useApp.getState().select(workitemId);
      persistCurrent();
    },
    back: async () => {
      const st = get();
      if (guardSettingsDraft(st.view, 'back')) return;
      const prev = st.history[st.history.length - 1];
      if (!prev) return;
      set({
        history: st.history.slice(0, -1),
        forwardHistory: [...st.forwardHistory, captureSnapshot(st)].slice(-HISTORY_LIMIT),
      });
      await restoreSnapshot(prev);
      persistCurrent(prev.scrollTop);
    },
    forward: async () => {
      const st = get();
      if (guardSettingsDraft(st.view, 'forward')) return;
      const next = st.forwardHistory[st.forwardHistory.length - 1];
      if (!next) return;
      set({
        history: [...st.history, captureSnapshot(st)].slice(-HISTORY_LIMIT),
        forwardHistory: st.forwardHistory.slice(0, -1),
      });
      await restoreSnapshot(next);
      persistCurrent(next.scrollTop);
    },
    restoreNavigation: () => {
      if (startupRestoreComplete || useApp.getState().booting) return Promise.resolve();
      if (startupRestorePromise) return startupRestorePromise;
      const restore = async () => {
        const stored = readStoredNavigation();
        if (stored.status === 'valid') {
          set({
            history: stored.value.history.map(copySnapshot),
            forwardHistory: stored.value.forwardHistory.map(copySnapshot),
          });
          await restoreSnapshot(stored.value.current);
          persistCurrent(stored.value.current.scrollTop);
          startupRestoreComplete = true;
          return;
        }

        const fallback = { ...defaultNavigationSnapshot, view: 'overview' as const };
        set({
          view: fallback.view,
          settingsSection: fallback.settingsSection,
          iterationKey: fallback.iterationKey,
          chain: [],
          filters: cloneFilters(fallback.filters),
          listSearch: '',
          listContext: cloneListContext(DEFAULT_ITERATION_LIST_CONTEXT),
          history: [],
          forwardHistory: [],
          restoreScroll: null,
        });
        const app = useApp.getState();
        if (app.category !== fallback.category) await app.setCategory(fallback.category);
        useApp.setState({ selectedId: null });
        persistCurrent(0);
        startupRestoreComplete = true;
      };
      startupRestorePromise = restore().catch((error: unknown) => {
        startupRestorePromise = null;
        throw error;
      });
      return startupRestorePromise;
    },
  };
});

/** App booting 完成后调用；恢复导航并在需要时加载已打开的需求详情。 */
export function restoreNavigation(): Promise<void> {
  return useUi.getState().restoreNavigation();
}

let scrollPersistTimer: ReturnType<typeof setTimeout> | null = null;
const flushNavigationScroll = () => {
  if (scrollPersistTimer) {
    clearTimeout(scrollPersistTimer);
    scrollPersistTimer = null;
  }
  persistNavigation(useUi.getState());
};

if (typeof document !== 'undefined') {
  document.addEventListener('scroll', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('workspace-scroll')) return;
    if (scrollPersistTimer) clearTimeout(scrollPersistTimer);
    scrollPersistTimer = setTimeout(() => {
      scrollPersistTimer = null;
      persistNavigation(useUi.getState());
    }, 150);
  }, true);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushNavigationScroll);
  window.addEventListener('beforeunload', flushNavigationScroll);
}

/**
 * 初始化系统明暗外观监听器：
 * 1. 监听系统 prefers-color-scheme 媒体查询；
 * 2. 在 Tauri 环境中同步监听窗口级 onThemeChanged 事件；
 * 3. 当处于 'system' 模式时，自动动态同步并应用主题。
 * 返回取消监听函数供组件卸载时调用。
 */
export function initThemeListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
  const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
    const isDark = e.matches;
    const currentTheme = useUi.getState().theme;
    if (currentTheme === 'system') {
      useUi.getState().setResolvedTheme(isDark ? 'dark' : 'light');
    }
  };

  if (mediaQuery) {
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else if (typeof (mediaQuery as any).addListener === 'function') {
      (mediaQuery as any).addListener(handleMediaChange);
    }
  }

  let unlistenTauri: (() => void) | undefined;
  if ('__TAURI_INTERNALS__' in window) {
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        try {
          const appWindow = getCurrentWindow();
          if (typeof appWindow.onThemeChanged === 'function') {
            void appWindow
              .onThemeChanged(({ payload: newTheme }) => {
                const currentTheme = useUi.getState().theme;
                if (currentTheme === 'system') {
                  const isDark = newTheme === 'dark';
                  useUi.getState().setResolvedTheme(isDark ? 'dark' : 'light');
                }
              })
              .then((unlisten) => {
                unlistenTauri = unlisten;
              });
          }
        } catch {
          // 静默处理非真实 Tauri 运行时环境
        }
      })
      .catch(() => {});
  }

  return () => {
    if (mediaQuery) {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else if (typeof (mediaQuery as any).removeListener === 'function') {
        (mediaQuery as any).removeListener(handleMediaChange);
      }
    }
    if (unlistenTauri) unlistenTauri();
  };
}

