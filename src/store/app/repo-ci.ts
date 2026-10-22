import * as api from '../../lib/api';
import type { RepoCiBinding } from '../../types';
import type { AppRuntime } from './runtime';
import type { AppSliceCreator, RepoCiSlice } from './types';

export function createRepoCiSlice(runtime: AppRuntime): AppSliceCreator<RepoCiSlice> {
  return (set, get) => ({
    repoCiByRepo: {},
    ciRefreshedAt: null,

    async saveRepoCiBinding(repoId: number, binding: RepoCiBinding | null) {
      const settings = await api.saveRepoCiBinding(repoId, binding);
      set({ settings });
      await get().loadRepoCi(repoId);
    },

    async loadRepoCi(repoId: number, alreadyLoading = false) {
      const requestId = (runtime.repoCiRequests.get(repoId) ?? 0) + 1;
      runtime.repoCiRequests.set(repoId, requestId);
      const binding = get().settings?.repoCiBindings?.[String(repoId)];
      if (!binding) {
        set((state) => ({
          repoCiByRepo: { ...state.repoCiByRepo, [repoId]: { loading: false, snapshot: null } },
        }));
        return;
      }
      if (!alreadyLoading) {
        set((state) => ({
          repoCiByRepo: {
            ...state.repoCiByRepo,
            [repoId]: { loading: true, snapshot: state.repoCiByRepo[repoId]?.snapshot ?? null },
          },
        }));
      }
      try {
        const snapshot = await api.getRepoCiSnapshot(repoId, 5);
        if (runtime.repoCiRequests.get(repoId) !== requestId) return;
        set((state) => ({
          repoCiByRepo: { ...state.repoCiByRepo, [repoId]: { loading: false, snapshot } },
          ciRefreshedAt: Date.now(),
        }));
      } catch (error) {
        if (runtime.repoCiRequests.get(repoId) !== requestId) return;
        set((state) => ({
          repoCiByRepo: {
            ...state.repoCiByRepo,
            [repoId]: { loading: false, snapshot: state.repoCiByRepo[repoId]?.snapshot ?? null, error: String(error) },
          },
        }));
      }
    },

    async refreshAllRepoCi() {
      const { settings, repositories, repoCiByRepo } = get();
      if (!settings?.repoCiBindings) return;
      const targetIds = repositories
        .filter((repo) => settings.repoCiBindings[String(repo.id)] && !repoCiByRepo[repo.id]?.loading)
        .map((repo) => repo.id);
      if (!targetIds.length) return;
      const nextRepoCi = { ...repoCiByRepo };
      for (const id of targetIds) {
        nextRepoCi[id] = { loading: true, snapshot: repoCiByRepo[id]?.snapshot ?? null };
      }
      set({ repoCiByRepo: nextRepoCi });
      await Promise.all(targetIds.map((id) => get().loadRepoCi(id, true)));
    },
  });
}
