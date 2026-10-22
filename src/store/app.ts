// Zustand 全局状态兼容入口。
// 领域实现位于 src/store/app/*，这里仅负责实例化和组合，保留现有 import 契约。
import { create } from 'zustand';
import { createCoreSlice } from './app/core';
import { createIterationsSlice } from './app/iterations';
import { createLogsSlice } from './app/logs';
import { createPipelinesSlice } from './app/pipelines';
import { createRepoCiSlice } from './app/repo-ci';
import { createAppRuntime } from './app/runtime';
import { createTraceSlice } from './app/trace';
import { createWorkitemsSlice } from './app/workitems';
import type { AppStore } from './app/types';

export type { AppStore, Toast } from './app/types';
export type { RefreshResult, SyncField, SyncPending } from './app/types';
export { appSelectors } from './app/selectors';

export function createAppStore() {
  const runtime = createAppRuntime();
  return create<AppStore>((set, get, api) => ({
    ...createCoreSlice(runtime)(set, get, api),
    ...createWorkitemsSlice(runtime)(set, get, api),
    ...createIterationsSlice(runtime)(set, get, api),
    ...createTraceSlice(runtime)(set, get, api),
    ...createRepoCiSlice(runtime)(set, get, api),
    ...createPipelinesSlice(runtime)(set, get, api),
    ...createLogsSlice(runtime)(set, get, api),
  }));
}

export const useApp = createAppStore();
