// 工作区视图状态（nervd-new-ui 基准的信息架构）：
// iteration=迭代总览 / requirement=需求详情 / settings=环境与策略 / full-settings=完整设置
// 与 store/app.ts 的业务状态分离；不持久化——每次启动回到当前迭代。
import { create } from 'zustand';

/** 演示迭代（后端暂无云效迭代 API，先以占位数据呈现信息架构） */
export const PLACEHOLDER_ITERATIONS = [
  { name: 'Benz-20261016', title: '前端优化迭代', state: '进行中' as const },
  { name: 'ITER-17', title: '稳定性修复迭代', state: '归档' as const },
];

export type WorkspaceView = 'iteration' | 'requirement' | 'overview' | 'settings' | 'full-settings';

interface UiStore {
  view: WorkspaceView;
  iterationKey: string;
  setView(view: WorkspaceView): void;
  setIteration(key: string): void;
  openRequirement(): void;
}

export const useUi = create<UiStore>((set) => ({
  view: 'iteration',
  iterationKey: PLACEHOLDER_ITERATIONS[0].name,
  setView: (view) => set({ view }),
  setIteration: (iterationKey) => set({ iterationKey, view: 'iteration' }),
  openRequirement: () => set({ view: 'requirement' }),
}));
