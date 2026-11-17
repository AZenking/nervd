import type { Category, Settings } from '../types';

/**
 * 工作项仓库解析（方案 A：显式关联与默认扫描池拆开）。
 *
 * - 显式关联：只有用户主动「关联仓库」才会写入 `workitemRepos`；没有键 = 没有关联，
 *   不再回退默认池。
 * - 任务/缺陷：挂在需求下时继承父需求的显式关联（子项不落盘自己的键）；
 *   **独立工作项（无父需求的 Bug/Task）允许自持关联**——缺陷常常独立处理、没有父需求，
 *   若仍只认父需求，它就连关联仓库与建分支/MR 的入口都没有。
 *   解析链：父需求键 > 自身键（无父需求时）> 未关联。
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
  const hasKey = (id: string) => Object.prototype.hasOwnProperty.call(overrides, id);
  if (category === 'Req') {
    return hasKey(workitemId) ? overrides[workitemId] ?? [] : null;
  }
  // 有父需求：严格继承，忽略子项自身键（子项仓库始终由父需求管理）
  if (parentWorkitemId) {
    return hasKey(parentWorkitemId) ? overrides[parentWorkitemId] ?? [] : null;
  }
  // 独立工作项：自身键生效
  return hasKey(workitemId) ? overrides[workitemId] ?? [] : null;
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

/**
 * 是否由「工作项自身」持有仓库关联与分支模板配置：
 * 需求恒为 true；Task/Bug 仅在**没有父需求**（独立工作项）时为 true，
 * 有父需求的子项只读继承父需求配置（增删/推荐/模板选择都在父需求页）。
 */
export function workitemOwnsRepoConfig(category: Category, parentWorkitemId?: string): boolean {
  return category === 'Req' || !parentWorkitemId;
}
