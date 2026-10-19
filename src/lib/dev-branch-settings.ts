/**
 * 集成开发分支（Dev/Main Integration Branch）配置服务
 * 默认比对 dev，若无配置则回退 dev；支持在设置页面中全局自定义（例如 develop / dev / master）。
 */

const STORAGE_KEY = 'nervd:default-dev-branch';
export const DEFAULT_DEV_BRANCH = 'dev';

export function getCustomDevBranch(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_DEV_BRANCH;
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val?.trim() || DEFAULT_DEV_BRANCH;
  } catch {
    return DEFAULT_DEV_BRANCH;
  }
}

export function setCustomDevBranch(branchName: string): void {
  if (typeof localStorage === 'undefined') return;
  const normalized = branchName.trim() || DEFAULT_DEV_BRANCH;
  localStorage.setItem(STORAGE_KEY, normalized);
  window.dispatchEvent(
    new CustomEvent('nervd:dev-branch-changed', {
      detail: { devBranch: normalized },
    }),
  );
}
