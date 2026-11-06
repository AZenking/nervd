import type { Category, Settings } from '../types';

/**
 * 解析工作项的追溯仓库列表。
 * - Req：需求级覆盖（workitemRepos）优先，缺省回退默认云效仓库（watchedRepos）。
 * - Task/Bug：子项不维护自己的关联仓库，继承父需求的解析链（父覆盖 → watchedRepos）；
 *   父级未知时回退 watchedRepos，行为不劣化。继承是解析时行为，不落盘 settings。
 */
export function workitemRepoIds(
  category: Category,
  workitemId: string,
  settings: Pick<Settings, 'watchedRepos' | 'workitemRepos'>,
  parentWorkitemId?: string,
): number[] {
  if (category === 'Req' && Object.prototype.hasOwnProperty.call(settings.workitemRepos ?? {}, workitemId)) {
    return settings.workitemRepos[workitemId] ?? [];
  }
  if (category !== 'Req' && parentWorkitemId
    && Object.prototype.hasOwnProperty.call(settings.workitemRepos ?? {}, parentWorkitemId)) {
    return settings.workitemRepos[parentWorkitemId] ?? [];
  }
  return settings.watchedRepos ?? [];
}
