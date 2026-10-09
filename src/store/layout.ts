// 布局状态：视图切换 / 侧栏与追溯栏折叠 / 栏宽，localStorage 持久化。
// 与 store/app.ts 的业务状态分离，避免污染 IPC 契约。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewKey = 'workbench' | 'overview';

/** 与 theme.css 中 --rail-w / --trace-w 默认值保持一致 */
export const RAIL_W_DEFAULT = 260;
export const TRACE_W_DEFAULT = 320;
export const RAIL_W_RANGE: [number, number] = [200, 420];
export const TRACE_W_RANGE: [number, number] = [240, 520];

interface LayoutStore {
  view: ViewKey;
  sidebarOpen: boolean;
  traceOpen: boolean;
  railW: number;
  traceW: number;
  setView(view: ViewKey): void;
  toggleSidebar(): void;
  toggleTrace(): void;
  setRailW(w: number): void;
  setTraceW(w: number): void;
  resetRailW(): void;
  resetTraceW(): void;
}

const clamp = (v: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, v));

export const useLayout = create<LayoutStore>()(
  persist(
    (set) => ({
      view: 'workbench',
      sidebarOpen: true,
      traceOpen: true,
      railW: RAIL_W_DEFAULT,
      traceW: TRACE_W_DEFAULT,
      setView: (view) => set({ view }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleTrace: () => set((s) => ({ traceOpen: !s.traceOpen })),
      setRailW: (w) => set({ railW: clamp(Math.round(w), RAIL_W_RANGE) }),
      setTraceW: (w) => set({ traceW: clamp(Math.round(w), TRACE_W_RANGE) }),
      resetRailW: () => set({ railW: RAIL_W_DEFAULT }),
      resetTraceW: () => set({ traceW: TRACE_W_DEFAULT }),
    }),
    { name: 'nervd-layout' },
  ),
);
