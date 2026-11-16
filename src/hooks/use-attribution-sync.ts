// 变更归属后台同步。
//
// 仅 Tauri 宿主启用：
// - 挂载 3s 后首次同步；
// - 窗口可见每 5 分钟、隐藏每 30 分钟同步一轮（syncAttribution + refreshStatus）；
// - 监听 `attribution-updated` / `local-repo-changed` 刷新状态与待归属队列；
// - 只写 store 数据，不触碰任何 UI 状态（选中项 / 抽屉 / toast 由调用方决定）。
import { useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriRuntime, syncLocalRepo } from '@/lib/attribution-api';
import { useApp } from '@/store/app';
import { useAttribution } from '@/store/attribution';
import { errorLog } from '@/lib/error-format';

const INITIAL_DELAY_MS = 3_000;
const VISIBLE_INTERVAL_MS = 5 * 60_000;
const HIDDEN_INTERVAL_MS = 30 * 60_000;

function settingsConfigured(): boolean {
  const settings = useApp.getState().settings;
  return !!(settings?.organizationId && settings?.defaultSpaceIdentifier);
}

/**
 * 挂载后台同步；返回的 effect cleanup 会清理定时器与 Tauri 事件监听。
 */
export function useAttributionSync(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let initialTimer: ReturnType<typeof setTimeout> | null = null;
    let unlisteners: UnlistenFn[] = [];

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (disposed) return;
      const hidden =
        typeof document !== 'undefined' && document.visibilityState === 'hidden';
      timer = setTimeout(() => {
        void run();
      }, hidden ? HIDDEN_INTERVAL_MS : VISIBLE_INTERVAL_MS);
    };

    const run = async () => {
      if (disposed) return;
      if (settingsConfigured()) {
        const store = useAttribution.getState();
        try {
          await store.syncNow({ silent: true });
          await store.refreshStatus({ silent: true });
          await store.loadUnassigned({ silent: true });
          refreshLoadedTimelines();
        } catch (error) {
          errorLog('attribution.sync', error);
        }
      }
      if (!disposed) schedule();
    };

    const refreshLoadedTimelines = () => {
      const state = useAttribution.getState();
      for (const workitemId of Object.keys(state.timelineByWorkitem)) {
        void state.loadTimeline(workitemId, state.timelineIncludeRollup[workitemId]);
      }
    };

    const onExternalUpdate = () => {
      if (disposed || !settingsConfigured()) return;
      const store = useAttribution.getState();
      void store.refreshStatus({ silent: true });
      void store.loadUnassigned({ silent: true });
      refreshLoadedTimelines();
    };

    const onLocalRepoChanged = async (repoId: number) => {
      if (disposed || !settingsConfigured()) return;
      try {
        await syncLocalRepo({ repoId });
      } catch (error) {
        errorLog('attribution.localSync', error);
        return;
      }
      onExternalUpdate();
    };

    const onVisibilityChange = () => {
      if (!disposed) schedule();
    };

    initialTimer = setTimeout(() => {
      void run();
    }, INITIAL_DELAY_MS);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    void Promise.all([
      listen('attribution-updated', onExternalUpdate),
      listen<{ repoId: number }>('local-repo-changed', (event) => {
        void onLocalRepoChanged(event.payload.repoId);
      }),
    ])
      .then((fns) => {
        if (disposed) {
          for (const fn of fns) fn();
          return;
        }
        unlisteners = fns;
      })
      .catch((error) => errorLog('attribution.sync.listen', error));

    return () => {
      disposed = true;
      if (initialTimer) {
        clearTimeout(initialTimer);
        initialTimer = null;
      }
      clearTimer();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      for (const fn of unlisteners) fn();
      unlisteners = [];
    };
  }, []);
}