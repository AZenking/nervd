// 工作区视图状态（nervd-new-ui 基准的信息架构）：
// iteration=迭代总览 / requirement=需求详情 / settings=环境与策略 / full-settings=完整设置
// 与 store/app.ts 的业务状态分离；不持久化——每次启动回到当前迭代。
import { create } from 'zustand';
import type { IterationSummary } from '../types';

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

/** 按当前迭代收窄工作项：真实迭代命中时只留 sprint 匹配的行（未命中迭代 / 占位壳=全量） */
export function scopedItems<T extends FilterableRow>(
  items: T[],
  iterationKey: string,
  realIterations: IterationSummary[],
): T[] {
  if (!realIterations.length) return items;
  const current = realIterations.find((it) => it.name === iterationKey);
  if (!current) return items;
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

export type WorkspaceView = 'iteration' | 'requirement' | 'overview' | 'settings' | 'full-settings';

interface UiStore {
  view: WorkspaceView;
  iterationKey: string;
  filters: WorkitemFilters;
  setView(view: WorkspaceView): void;
  setIteration(key: string): void;
  toggleFilter(kind: keyof WorkitemFilters, value: string): void;
  clearFilters(): void;
  openRequirement(): void;
}

export const useUi = create<UiStore>((set) => ({
  view: 'iteration',
  iterationKey: PLACEHOLDER_ITERATIONS[0].name,
  filters: { assignees: [], related: [], statuses: [] },
  setView: (view) => set({ view }),
  setIteration: (iterationKey) => set({ iterationKey, view: 'iteration' }),
  toggleFilter: (kind, value) =>
    set((st) => {
      const values = st.filters[kind];
      const next = values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value];
      return { filters: { ...st.filters, [kind]: next } };
    }),
  clearFilters: () => set({ filters: { assignees: [], related: [], statuses: [] } }),
  openRequirement: () => set({ view: 'requirement' }),
}));
