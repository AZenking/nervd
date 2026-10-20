// 工作区视图状态（nervd-new-ui 基准的信息架构）：
// iteration=迭代总览 / requirement=需求详情 / full-settings=完整设置
// 与 store/app.ts 的业务状态分离；不持久化——每次启动回到当前迭代。
// 导航历史与层级链（UX 评审 A2）：面包屑可点、⌘← 后退、子任务可回父需求。
// 设置页互切/离开时若设置草稿有未保存修改，则拦截为 pendingView 由 Shell 弹确认（UX A1）。
import { flushSync } from 'react-dom';
import { create } from 'zustand';
import type { IterationSummary } from '../types';
import { useApp } from './app';
import { useSettingsDraft } from './settings-draft';

/** 演示迭代：sprints OpenAPI 不可用（未配置 / 接口失败）时的回退壳 */
export const PLACEHOLDER_ITERATIONS: IterationSummary[] = [
  { id: 'placeholder-benz', name: 'Benz-20261016', title: '前端优化迭代', state: '进行中', startDate: '', endDate: '' },
];

/** 需要展示的迭代状态：正在执行中 / 未开始；归档（含已完成、已结束）等不展示 */
const VISIBLE_ITERATION_STATES = new Set(['进行中', '未开始']);

/** 过滤出需要展示的迭代（进行中 / 未开始） */
export function visibleIterations(list: IterationSummary[]): IterationSummary[] {
  return list.filter((it) => VISIBLE_ITERATION_STATES.has(it.state));
}

/** 真实迭代列表为空时回退占位壳（与 PLACEHOLDER_ITERATIONS 同形态），并过滤掉归档等不可见迭代 */
export function iterationsOrFallback(real: IterationSummary[]): IterationSummary[] {
  const base = real.length ? real : PLACEHOLDER_ITERATIONS;
  const visible = visibleIterations(base);
  // 极端情况：全部迭代都已归档 → 仍展示原列表，避免迭代壳空掉
  return visible.length ? visible : base;
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
  if (!current) return [];
  return items.filter((it) => it.sprintId === current.id);
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

export type WorkspaceView = 'iteration' | 'requirement' | 'integration' | 'overview' | 'full-settings';
export type SettingsSection = 'connection' | 'trace' | 'ci' | 'security' | 'ai' | 'about';

/** 面包屑上的工作项（父 › 子层级链的节点） */
export interface WorkitemCrumb {
  workitemId: string;
  identifier: string;
  subject?: string;
}

/** 导航历史快照（后退恢复用）——含搜索词与滚动位置，完整还原工作现场 */
interface NavSnapshot {
  view: WorkspaceView;
  settingsSection: SettingsSection;
  iterationKey: string;
  selectedId: string | null;
  chain: WorkitemCrumb[];
  listSearch: string;
  scrollTop: number;
}

const HISTORY_LIMIT = 30;
const isSettingsView = (v: WorkspaceView) => v === 'full-settings';

interface UiStore {
  view: WorkspaceView;
  settingsSection: SettingsSection;
  iterationKey: string;
  filters: WorkitemFilters;
  /** 迭代页工作项搜索词（入导航快照，后退可恢复） */
  listSearch: string;
  setListSearch(value: string): void;
  /** 导航历史（后退用） */
  history: NavSnapshot[];
  /** 待恢复的工作区滚动位置（Shell 应用后清空） */
  restoreScroll: number | null;
  /** 需求详情的层级链（末位 = 当前详情）；从子任务进入时为 [父, 子] */
  chain: WorkitemCrumb[];
  setView(view: WorkspaceView): void;
  setSettingsSection(section: SettingsSection): void;
  openSettings(section?: SettingsSection): void;
  setIteration(key: string): void;
  toggleFilter(kind: keyof WorkitemFilters, value: string): void;
  clearFilters(): void;
  /** 打开工作项详情：记录历史与层级链（parent 传入时形成 父 › 子 面包屑） */
  openWorkitem(workitemId: string, crumb: WorkitemCrumb, parent?: WorkitemCrumb): void;
  /** 后退一步（⌘←）；无历史时不动 */
  back(): void;
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
  /** 主题模式：深色 dark（默认）与浅色 light */
  theme: 'dark' | 'light';
  setTheme(theme: 'dark' | 'light'): void;
  toggleTheme(event?: { clientX: number; clientY: number } | null): void;
}

/** 离开设置视图且草稿有未保存修改：无校验错误则静默保存放行，有阻断错误则弹窗确认 */
function guardSettingsDraft(current: WorkspaceView, next: WorkspaceView | 'back'): boolean {
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
  /** 把"当前状态"压入历史（在状态变更前调用）；捕获搜索词与工作区滚动位置 */
  const pushHistory = () => {
    const st = get();
    const snapshot: NavSnapshot = {
      view: st.view,
      settingsSection: st.settingsSection,
      iterationKey: st.iterationKey,
      selectedId: useApp.getState().selectedId,
      chain: st.chain,
      listSearch: st.listSearch,
      scrollTop: document.querySelector<HTMLElement>('.workspace-scroll')?.scrollTop ?? 0,
    };
    set({ history: [...st.history.slice(-(HISTORY_LIMIT - 1)), snapshot] });
  };

  return {
    view: 'iteration',
    settingsSection: 'connection',
    iterationKey: PLACEHOLDER_ITERATIONS[0].name,
    filters: { assignees: [], related: [], statuses: [] },
    listSearch: '',
    setListSearch: (value) => set({ listSearch: value }),
    history: [],
    restoreScroll: null,
    chain: [],
    commandOpen: false,
    setCommandOpen: (commandOpen) => set({ commandOpen }),
    toggleCommandMenu: () => set((st) => ({ commandOpen: !st.commandOpen })),
    shortcutsOpen: false,
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    aboutOpen: false,
    setAboutOpen: (aboutOpen) => set({ aboutOpen }),
    theme: (typeof localStorage !== 'undefined' && (localStorage.getItem('nervd-theme') as 'dark' | 'light')) || 'dark',
    setTheme: (theme) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem('nervd-theme', theme);
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', theme === 'dark');
      }
      set({ theme });
    },
    toggleTheme: (event) => {
      const current = get().theme;
      const next = current === 'dark' ? 'light' : 'dark';

      // 降级判定：检查环境支持与系统减弱动态效果偏好
      const isReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const doc = typeof document !== 'undefined' ? (document as Document & {
        startViewTransition?: (callback: () => void | Promise<void>) => { ready: Promise<void> };
      }) : null;
      const isAppearanceTransition = Boolean(
        doc && typeof doc.startViewTransition === 'function' && !isReducedMotion,
      );

      if (!isAppearanceTransition || !doc?.startViewTransition) {
        get().setTheme(next);
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
          get().setTheme(next);
        });
      });

      if (!transition) return;

      void transition.ready.then(() => {
        const isDark = next === 'dark';
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
    setView: (view) => {
      const st = get();
      if (view === st.view) return;
      if (guardSettingsDraft(st.view, view)) return;
      pushHistory();
      set({ view });
    },
    setSettingsSection: (settingsSection) => set({ settingsSection }),
    openSettings: (settingsSection = 'connection') => {
      const st = get();
      if (isSettingsView(st.view)) {
        set({ settingsSection });
        return;
      }
      pushHistory();
      set({ view: 'full-settings', settingsSection });
    },
    setIteration: (iterationKey) => {
      const st = get();
      if (iterationKey === st.iterationKey && st.view === 'iteration') return;
      if (guardSettingsDraft(st.view, 'iteration')) return;
      pushHistory();
      set({ iterationKey, view: 'iteration' });
    },
    toggleFilter: (kind, value) =>
      set((st) => {
        const values = st.filters[kind];
        const next = values.includes(value)
          ? values.filter((v) => v !== value)
          : [...values, value];
        return { filters: { ...st.filters, [kind]: next } };
      }),
    clearFilters: () => set({ filters: { assignees: [], related: [], statuses: [] } }),
    openWorkitem: (workitemId, crumb, parent) => {
      const st = get();
      const blocked = guardSettingsDraft(st.view, 'requirement');
      // 选择与层级链先落地（只读操作）；被拦截时确认后将 setView 到详情
      if (!blocked) pushHistory();
      set({ chain: parent ? [parent, crumb] : [crumb] });
      void useApp.getState().select(workitemId);
      if (!blocked) set({ view: 'requirement' });
    },
    back: () => {
      const st = get();
      if (guardSettingsDraft(st.view, 'back')) return;
      const prev = st.history[st.history.length - 1];
      if (!prev) return;
      set({
        history: st.history.slice(0, -1),
        view: prev.view,
        settingsSection: prev.settingsSection,
        iterationKey: prev.iterationKey,
        chain: prev.chain,
        // 恢复搜索词与滚动位置（Shell 应用 restoreScroll 后清空）
        listSearch: prev.listSearch,
        restoreScroll: prev.scrollTop,
      });
      if (prev.view === 'requirement') {
        const target = prev.chain[prev.chain.length - 1];
        if (target && target.workitemId !== useApp.getState().selectedId) {
          void useApp.getState().select(target.workitemId);
        }
      }
    },
  };
});
