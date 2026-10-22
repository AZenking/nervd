import type { AppStore } from './types';

/**
 * 页面侧使用的窄选择器。组件可以订阅单一领域，避免 CI/日志轮询导致详情工作台整体重渲染。
 * 这里只读，不在 selector 中派生会改变引用的对象。
 */
export const appSelectors = {
  settings: (state: AppStore) => state.settings,
  workitemList: (state: AppStore) => state.items,
  selectedId: (state: AppStore) => state.selectedId,
  detail: (state: AppStore) => state.detail,
  children: (state: AppStore) => state.children,
  trace: (state: AppStore) => state.trace,
  repoCiByRepo: (state: AppStore) => state.repoCiByRepo,
  logView: (state: AppStore) => state.logView,
  toast: (state: AppStore) => state.toast,
  allowWriteOps: (state: AppStore) => state.settings?.allowWriteOps ?? false,
};
