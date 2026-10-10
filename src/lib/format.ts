/** 全工程统一的时间与耗时格式化（zh-CN、24 小时制），取代各组件内散落的本地实现。 */

/** 时间戳 → 本地日期时间文本，如 2026/10/10 11:04:30 */
export function formatDateTime(timestamp: number | string): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

/** 时间戳 → 本地时间文本（不含日期），如 11:04:30 */
export function formatTime(timestamp: number | string): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

/** 毫秒耗时 → 人类可读文本：<1 分钟显示「N 秒」，否则「N 分 N 秒」 */
export function formatDuration(durationMs: number): string {
  if (durationMs < 60_000) return `${Math.round(durationMs / 1000)} 秒`;
  return `${Math.floor(durationMs / 60_000)} 分 ${Math.round((durationMs % 60_000) / 1000)} 秒`;
}
