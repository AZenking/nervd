import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '@/store/app';
import type { RepoSummary } from '@/types';

export interface UseCiPollingOptions {
  repositories: RepoSummary[];
  intervalMs?: number;
  enabled?: boolean;
}

/**
 * CI 状态智能轮询 Hook：
 * - 首次加载立即查询已绑定 CI 的仓库
 * - 仅在 document.visibilityState 为 visible 时轮询（默认每 15s），节省系统开销与网络带宽
 * - 切换窗口重新可见时立即静默刷新
 */
export function useCiPolling(options: UseCiPollingOptions) {
  const { repositories, intervalMs = 15_000, enabled = true } = options;
  const loadRepoCi = useApp((s) => s.loadRepoCi);
  const repositoriesRef = useRef(repositories);
  repositoriesRef.current = repositories;

  const refreshCi = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    const state = useApp.getState();
    for (const repo of repositoriesRef.current) {
      if (
        state.settings?.repoCiBindings?.[String(repo.id)]
        && !state.repoCiByRepo[repo.id]?.loading
      ) {
        void state.loadRepoCi(repo.id);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    refreshCi();
    const timer = window.setInterval(refreshCi, intervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshCi();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, intervalMs, refreshCi, repositories, loadRepoCi]);

  return { refreshCi };
}
