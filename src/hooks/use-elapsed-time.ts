import { useEffect, useState } from 'react';

/**
 * 将毫秒差额格式化为 mm:ss 或 hh:mm:ss 文本（等宽显示）
 */
export function formatElapsedTime(elapsedMs: number): string {
  if (isNaN(elapsedMs) || elapsedMs < 0) return '00:00';
  const totalSecs = Math.floor(elapsedMs / 1000);
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60) % 60;
  const hours = Math.floor(totalSecs / 3600);

  const pad = (n: number) => String(n).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * 实时跳动计时器 Hook（为执行中的 Jenkins / Flow 任务提供秒级耗时跳动）
 * @param startTime 毫秒时间戳（如 Jenkins/Flow 的 startTime）
 * @param active 是否激活秒表（终态任务传 false，不再跑定时器）
 */
export function useElapsedTime(startTime?: number | null, active = true): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startTime || !active) return;

    // 立即校准一次
    setNow(Date.now());

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [startTime, active]);

  if (!startTime) return '—';
  return formatElapsedTime(now - startTime);
}
