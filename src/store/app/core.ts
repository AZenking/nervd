import * as api from '../../lib/api';
import {
  loadHighlightSettings,
  saveHighlightSettings,
} from '../../lib/workitem-highlight';
import { errorLog } from '../../lib/error-format';
import type { Settings } from '../../types';
import type { AppRuntime } from './runtime';
import { readDetailField } from './helpers';
import type { AppSliceCreator, CoreSlice, SyncField } from './types';

export function createCoreSlice(runtime: AppRuntime): AppSliceCreator<CoreSlice> {
  return (set, get) => ({
    settings: null,
    connection: 'unknown',
    booting: true,
    toast: null,
    currentUser: null,
    loadingCurrentUser: false,
    workitemHighlight: loadHighlightSettings(),
    listFetchedAt: null,
    iterationsFetchedAt: null,
    detailFetchedAt: null,
    ciActiveUntil: 0,
    syncPendingByWorkitem: {},

    async init() {
      try {
        const settings = await api.getSettings();
        set({ settings, booting: false });
        if (settings.hasPat) void get().loadCurrentUser();
        if (settings.hasPat && settings.organizationId) {
          await get().refreshConnection();
          await Promise.all([get().loadList(), get().loadRepos(), get().loadIterations()]);
          void get().loadPipelines();
        }
      } catch (error) {
        set({ booting: false, connection: 'fail' });
        get().setToast({ text: `初始化失败：${String(error)}`, kind: 'fail' });
      }
    },

    async loadSettings() {
      try {
        const settings = await api.getSettings();
        set({ settings });
        return settings;
      } catch (error) {
        errorLog('app.loadSettings', error);
        return null;
      }
    },

    async refreshConnection() {
      const requestId = ++runtime.requests.connection;
      try {
        await api.checkConnection();
        if (requestId === runtime.requests.connection) set({ connection: 'ok' });
        void get().loadCurrentUser();
      } catch {
        if (requestId === runtime.requests.connection) set({ connection: 'fail' });
      }
    },

    async loadCurrentUser() {
      const settings = get().settings;
      if (!settings?.hasPat) {
        set({ currentUser: null, loadingCurrentUser: false });
        return;
      }
      set({ loadingCurrentUser: true });
      try {
        const user = await api.getCurrentUser();
        set({ currentUser: user });
      } catch (error) {
        errorLog('app.loadCurrentUser', error);
      } finally {
        set({ loadingCurrentUser: false });
      }
    },

    setWorkitemHighlight(patch) {
      const next = { ...get().workitemHighlight, ...patch };
      saveHighlightSettings(next);
      set({ workitemHighlight: next });
    },

    setToast(toast) {
      set({ toast });
      if (toast) {
        setTimeout(() => set((state) => (state.toast === toast ? { toast: null } : {})), 4000);
      }
    },

    markRepoCiActive(durationMs = 90_000) {
      const until = Date.now() + durationMs;
      set((state) => ({ ciActiveUntil: Math.max(state.ciActiveUntil, until) }));
    },

    async saveAll(settings: Settings, pat?: string) {
      if (pat) await api.savePat(pat);
      const nextSettings = await api.saveSettings(settings);
      const previous = get().settings;
      const previousWatchedRepos = previous?.watchedRepos ?? [];
      const nextWatchedRepos = nextSettings.watchedRepos ?? [];
      const watchedReposChanged =
        previousWatchedRepos.length !== nextWatchedRepos.length ||
        nextWatchedRepos.some((repoId, index) => repoId !== previousWatchedRepos[index]);
      const dataContextChanged =
        Boolean(pat) ||
        previous?.organizationId !== nextSettings.organizationId ||
        previous?.defaultSpaceIdentifier !== nextSettings.defaultSpaceIdentifier;
      const traceContextChanged =
        dataContextChanged ||
        previous?.linkPattern !== nextSettings.linkPattern ||
        watchedReposChanged ||
        JSON.stringify(previous?.workitemRepos ?? {}) !== JSON.stringify(nextSettings.workitemRepos ?? {});
      const repoCiChanged =
        JSON.stringify(previous?.repoCiBindings ?? {}) !== JSON.stringify(nextSettings.repoCiBindings ?? {}) ||
        JSON.stringify(previous?.jenkinsConnections ?? []) !== JSON.stringify(nextSettings.jenkinsConnections ?? []);

      if (dataContextChanged) {
        runtime.requests.list += 1;
        runtime.requests.detail += 1;
        runtime.requests.pipelines += 1;
        runtime.requests.logs += 1;
        runtime.pipelineRunRequests.clear();
        runtime.optimisticFields.clear();
        runtime.optimisticChildStatuses.clear();
        runtime.optimisticChildPreviousStatuses.clear();
        runtime.optimisticCreatedChildren.clear();
        runtime.fieldOperations.clear();
        runtime.syncTimers.forEach((timers) => timers.forEach((timer) => clearTimeout(timer)));
        runtime.syncTimers.clear();
      }
      if (traceContextChanged) runtime.requests.trace += 1;

      set({
        settings: nextSettings,
        ...(dataContextChanged
          ? {
              connection: 'unknown' as const,
              items: [],
              nextToken: null,
              loadingList: false,
              iterations: [],
              selectedId: null,
              detail: null,
              comments: [],
              children: [],
              childrenError: null,
              childrenDebug: null,
              loadingDetail: false,
              pipelines: [],
              runsByPipeline: {},
              loadingPipelines: false,
              logView: null,
              syncPendingByWorkitem: {},
            }
          : {}),
        ...(traceContextChanged ? { trace: null, traceLoading: false } : {}),
        ...(repoCiChanged ? { repoCiByRepo: {} } : {}),
      });

      await get().refreshConnection();
      if (nextSettings.hasPat && nextSettings.organizationId && nextSettings.defaultSpaceIdentifier) {
        await get().loadList();
        await get().loadRepos();
        void get().loadPipelines();
        void get().loadIterations();
        if (traceContextChanged && !dataContextChanged && get().selectedId) {
          void get().loadTrace();
        } else if (repoCiChanged) {
          const trace = get().trace;
          if (trace) void Promise.all(trace.repositories.map((repo) => get().loadRepoCi(repo.repoId)));
        }
      }
    },

    async retryWorkitemSync(workitemId: string, field?: SyncField) {
      const pending = get().syncPendingByWorkitem[workitemId];
      const targetField = field ?? pending?.field;
      if (!targetField) return;
      const result = await get().reloadCurrentDetail();
      const expected = pending?.expectedValue;
      const actual = readDetailField(get().detail, workitemId, targetField);
      if (result.status !== 'fail' && expected && actual === expected) {
        set((state) => {
          const next = { ...state.syncPendingByWorkitem };
          delete next[workitemId];
          return { syncPendingByWorkitem: next };
        });
      }
    },

    async revalidateIfStale(maxAgeMs = 120_000) {
      const state = get();
      if (
        state.booting ||
        state.connection !== 'ok' ||
        !state.settings?.organizationId ||
        !state.settings.defaultSpaceIdentifier
      ) return;
      const now = Date.now();
      const tasks: Promise<unknown>[] = [];
      if (!state.loadingList && !state.revalidatingList && (!state.listFetchedAt || now - state.listFetchedAt > maxAgeMs)) {
        tasks.push(get().revalidateList());
      }
      if (!state.loadingIterations && (!state.iterationsFetchedAt || now - state.iterationsFetchedAt > maxAgeMs)) {
        tasks.push(get().loadIterations());
      }
      if (state.selectedId && (!state.detailFetchedAt || now - state.detailFetchedAt > maxAgeMs)) {
        tasks.push(get().reloadCurrentDetail());
      }
      await Promise.all(tasks);
    },
  });
}
