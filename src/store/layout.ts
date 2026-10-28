// 可拖动分栏布局状态（lead：Shell 侧栏宽度；Luna 3：列表分栏）。
// 与 store/ui.ts 的导航状态分离：只保存两个面板宽度，持久化到 localStorage `nervd-layout`。
// 读取走 parseNavigationRecord 同款防御式解析（try/catch + 逐字段校验）：
// 记录缺失/损坏/字段非法 → 默认值；有限数越界 → clamp 宽容采用；NaN/负数/0/Infinity → 默认值。
import { create } from 'zustand';

export interface PaneSizeSpec { default: number; min: number; max: number }
/** 导航侧栏：默认 256px，200–300px */
export const SIDEBAR_PANE: PaneSizeSpec = { default: 256, min: 200, max: 300 };
/** 工作项列表：默认 360px，280–480px */
export const LIST_PANE: PaneSizeSpec = { default: 360, min: 280, max: 480 };
/** 需求详情最小宽度 */
export const DETAIL_PANE_MIN = 480;
/** 应用容器宽度低于该值 → 侧栏自动收为图标栏 */
export const NARROW_CONTAINER_WIDTH = 1180;
/** 工作区（扣除侧栏后）低于该值 → 列表/详情切单栏 */
export const SINGLE_COLUMN_WORKSPACE_WIDTH = 760;

interface LayoutStore {
  sidebarWidth: number;
  listWidth: number;
  setSidebarWidth: (px: number) => void;
  setListWidth: (px: number) => void;
  resetSidebarWidth: () => void;
  resetListWidth: () => void;
}

const LAYOUT_STORAGE_KEY = 'nervd-layout';
const LAYOUT_STORAGE_VERSION = 1;
/** 拖动高频触发 set*，持久化写入按该窗口 debounce 合并 */
const PERSIST_DEBOUNCE_MS = 150;

const clampToRange = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * 宽度字段清洗（水合与 set* 共用同一语义）：
 * 非数值 / 非有限数 / 非正数（NaN、负数、0、Infinity）→ 该栏默认值；
 * 有限数越界 → clamp 到 [min, max] 宽容采用。
 */
function sanitizePaneWidth(value: unknown, spec: PaneSizeSpec): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return spec.default;
  return clampToRange(value, spec.min, spec.max);
}

interface StoredLayoutRecord {
  version: number;
  sidebarWidth: number;
  listWidth: number;
}

/** 校验已持久化的布局记录；缺失 / 损坏 / 版本不符时返回 null（逐字段清洗延后到 sanitizePaneWidth） */
function parseLayoutRecord(serialized: string | null): Record<string, unknown> | null {
  if (serialized === null) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== LAYOUT_STORAGE_VERSION) return null;
    return record;
  } catch {
    return null;
  }
}

interface HydratedLayout {
  sidebarWidth: number;
  listWidth: number;
}

const defaultLayout = (): HydratedLayout => ({
  sidebarWidth: SIDEBAR_PANE.default,
  listWidth: LIST_PANE.default,
});

/** 模块加载时读一次 localStorage；存储不可用时静默降级为内存态默认值 */
function readStoredLayout(): HydratedLayout {
  try {
    if (typeof localStorage === 'undefined') return defaultLayout();
    const record = parseLayoutRecord(localStorage.getItem(LAYOUT_STORAGE_KEY));
    if (record === null) return defaultLayout();
    return {
      sidebarWidth: sanitizePaneWidth(record.sidebarWidth, SIDEBAR_PANE),
      listWidth: sanitizePaneWidth(record.listWidth, LIST_PANE),
    };
  } catch {
    return defaultLayout();
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** 立即持久化当前 state（并取消挂起的 debounce 写入）；配额 / 隐私模式异常静默吞掉 */
function writeLayoutNow(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    if (typeof localStorage === 'undefined') return;
    const { sidebarWidth, listWidth } = useLayout.getState();
    const record: StoredLayoutRecord = {
      version: LAYOUT_STORAGE_VERSION,
      sidebarWidth,
      listWidth,
    };
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // 存储写入失败不中断拖动；内存态继续工作。
  }
}

/** debounce 持久化：拖动期间高频 set* 只合并为一次写入 */
function schedulePersist(): void {
  if (typeof localStorage === 'undefined') return;
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeLayoutNow();
  }, PERSIST_DEBOUNCE_MS);
}

const initialLayout = readStoredLayout();

export const useLayout = create<LayoutStore>((set, get) => {
  const setPaneWidth = (
    key: 'sidebarWidth' | 'listWidth',
    spec: PaneSizeSpec,
    px: number,
  ): void => {
    const next = sanitizePaneWidth(px, spec);
    if (next === get()[key]) return; // 值未变化：不写 state、不排持久化
    set({ [key]: next });
    schedulePersist();
  };
  const resetPaneWidth = (key: 'sidebarWidth' | 'listWidth', spec: PaneSizeSpec): void => {
    if (spec.default === get()[key]) return;
    set({ [key]: spec.default });
    // reset 是离散低频操作：立即落盘并取消挂起的 debounce，避免窗口关闭前丢失。
    writeLayoutNow();
  };
  return {
    sidebarWidth: initialLayout.sidebarWidth,
    listWidth: initialLayout.listWidth,
    setSidebarWidth: (px) => setPaneWidth('sidebarWidth', SIDEBAR_PANE, px),
    setListWidth: (px) => setPaneWidth('listWidth', LIST_PANE, px),
    resetSidebarWidth: () => resetPaneWidth('sidebarWidth', SIDEBAR_PANE),
    resetListWidth: () => resetPaneWidth('listWidth', LIST_PANE),
  };
});
