import { useCallback, useEffect } from 'react';
import { useApp } from '@/store/app';
import type { RepoSummary } from '@/types';

export const ACTIVE_CI_INTERVAL_MS = 4_000;
export const IDLE_CI_INTERVAL_MS = 60_000;

export interface UseCiPollingOptions {
  repositories?: RepoSummary[];
  intervalMs?: number;
  enabled?: boolean;
}

/** 探测当前是否有任何仓库处于活跃构建态，或刚触发构建处于保护窗口 */
export function isCiStateActive(): boolean {
  const state = useApp.getState();
  if (Date.now() < state.ciActiveUntil) return true;
  return Object.values(state.repoCiByRepo).some((entry) => {
    const status = (entry.snapshot?.status ?? entry.snapshot?.runs?.[0]?.status)?.toUpperCase();
    return status === 'RUNNING' || status === 'WAITING' || status === 'QUEUED';
  });
}

/**
 * 全局自适应 CI 状态调度器 Hook：
 * - 活跃态（有进行中任务或刚触发构建）：4s 高频轮询
 * - 空闲态（全为终态）：60s 低频轮询
 * - 挂起态（document.hidden / 后台）：清除定时器，0 请求消耗
 * - 窗口重新可见（visibilitychange）或聚焦（focus）时立即静默刷新一次
 */
export function useGlobalCiScheduler(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const refreshAllRepoCi = useApp((s) => s.refreshAllRepoCi);
  const repositories = useApp((s) => s.repositories);

  useEffect(() => {
    if (!enabled) return;
    let timer: number | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (document.visibilityState !== 'visible') return;

      const delay = isCiStateActive() ? ACTIVE_CI_INTERVAL_MS : IDLE_CI_INTERVAL_MS;
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        try {
          await refreshAllRepoCi();
        } finally {
          scheduleNext();
        }
      }, delay);
    };

    // 初始执行
    if (document.visibilityState === 'visible') {
      void refreshAllRepoCi().finally(() => {
        scheduleNext();
      });
    }

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void refreshAllRepoCi().finally(() => {
          scheduleNext();
        });
      } else if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [enabled, repositories, refreshAllRepoCi]);

  return { refreshCi: () => void refreshAllRepoCi() };
}

/**
 * 局部视图兼容 Hook：
 * 直接复用全局调度中心，不再建立冗余定时器，保持已有返回签名一致。
 */
export function useCiPolling(_options?: UseCiPollingOptions) {
  const refreshAllRepoCi = useApp((s) => s.refreshAllRepoCi);
  const refreshCi = useCallback(() => {
    void refreshAllRepoCi();
  }, [refreshAllRepoCi]);

  return { refreshCi };
}
