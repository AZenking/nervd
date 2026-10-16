/**
 * nervd 启动 Splash 遮罩控制器
 * 负责首次启动 / 冷启动时全屏居中 logo 的展示、平滑渐隐退出及 DOM 节点清理。
 */

declare global {
  interface Window {
    __NERVD_START_TIME__?: number;
  }
}

export const DEFAULT_SPLASH_MIN_MS = 750;
export const SPLASH_FADE_OUT_MS = 450;

/**
 * 触发启动遮罩渐隐并自动从 DOM 中移除
 * @param minDurationMs 遮罩最小停留时间（毫秒），避免瞬时闪烁
 * @param startTime 启动时刻时间戳（优先取 window.__NERVD_START_TIME__）
 */
export function dismissSplashScreen(
  minDurationMs = DEFAULT_SPLASH_MIN_MS,
  startTime = (typeof window !== 'undefined' ? window.__NERVD_START_TIME__ : undefined) ?? Date.now(),
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }

    const splash = document.getElementById('app-splash');
    if (!splash) {
      resolve();
      return;
    }

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, minDurationMs - elapsed);

    const timer = setTimeout(() => {
      splash.classList.add('fade-out');

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        splash.remove();
        resolve();
      };

      splash.addEventListener('transitionend', cleanup, { once: true });
      // 容错兜底：若 transitionend 未触发，在超时后强制移除
      setTimeout(cleanup, SPLASH_FADE_OUT_MS + 100);
    }, remaining);

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => clearTimeout(timer), { once: true });
    }
  });
}
