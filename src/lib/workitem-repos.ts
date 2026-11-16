import type { Category, Settings } from '../types';

/**
 * 工作项仓库解析（方案 A：显式关联与默认扫描池拆开）。
 *
 * - 显式关联：只有用户主动「关联仓库」才会写入 `workitemRepos`；没有键 = 没有关联，
 *   不再回退默认池。任务/缺陷不落盘自己的仓库，继承父需求的显式关联（父级未知视为未关联）。
 * - 扫描范围：追溯、迭代仓库分组、开始处理候选仓库仍需要仓库集合；
 *   有显式关联用显式，否则用「默认云效仓库」（`watchedRepos`）。
 *
 * 这样详情页的「关联仓库 · N」只反映真实关联，而追溯行为保持向后兼容。
 */
export function workitemRepoOverride(
  category: Category,
  workitemId: string,
  settings: Pick<Settings, 'watchedRepos' | 'workitemRepos'>,
  parentWorkitemId?: string,
): number[] | null {
  const overrides = settings.workitemRepos ?? {};
  if (category === 'Req') {
    return Object.prototype.hasOwnProperty.call(overrides, workitemId)
      ? overrides[workitemId] ?? []
      : null;
  }
  if (parentWorkitemId && Object.prototype.hasOwnProperty.call(overrides, parentWorkitemId)) {
    return overrides[parentWorkitemId] ?? [];
  }
  return null;
}

/** 显式关联的仓库（空数组表示「没有关联」，与「未设置」在展示上区分由 override 是否为 null 决定）。 */
export function workitemExplicitRepoIds(
  category: Category,
  workitemId: string,
  settings: Pick<Settings, 'watchedRepos' | 'workitemRepos'>,
  parentWorkitemId?: string,
): number[] {
  return workitemRepoOverride(category, workitemId, settings, parentWorkitemId) ?? [];
}

/** 追溯/分组/开始处理使用的扫描范围：显式关联优先，缺省回退默认云效仓库。 */
export function workitemScanRepoIds(
  category: Category,
  workitemId: string,
  settings: Pick<Settings, 'watchedRepos' | 'workitemRepos'>,
  parentWorkitemId?: string,
): number[] {
  return (
    workitemRepoOverride(category, workitemId, settings, parentWorkitemId)
    ?? settings.watchedRepos
    ?? []
  );
}