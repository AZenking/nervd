import type { Category, Settings } from '../types';

export function workitemRepoIds(
  category: Category,
  workitemId: string,
  settings: Pick<Settings, 'watchedRepos' | 'workitemRepos'>,
): number[] {
  if (category === 'Req' && Object.prototype.hasOwnProperty.call(settings.workitemRepos ?? {}, workitemId)) {
    return settings.workitemRepos[workitemId] ?? [];
  }
  return settings.watchedRepos ?? [];
}
