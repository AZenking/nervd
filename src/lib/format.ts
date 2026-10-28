/** 全工程统一的时间与耗时格式化（zh-CN、24 小时制），取代各组件内散落的本地实现。 */

/** 时间戳 → 本地日期时间文本，如 2026/10/10 11:04:30 */
export function formatDateTime(timestamp: number | string): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

/** 时间戳 → 本地紧凑日期时间文本（MM-DD HH:mm），用于列表与卡片次级信息 */
export function formatCompactDateTime(timestamp: number | string | Date): string {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
}


/** 毫秒耗时 → 人类可读文本：<1 分钟显示「N 秒」，否则「N 分 N 秒」 */
export function formatDuration(durationMs: number): string {
  if (durationMs < 60_000) return `${Math.round(durationMs / 1000)} 秒`;
  return `${Math.floor(durationMs / 60_000)} 分 ${Math.round((durationMs % 60_000) / 1000)} 秒`;
}

/** 时间戳 → 相对时间（刚刚 / N分钟前 / N小时前 / N天前 / 具体日期） */
export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return '刚刚';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return formatDateTime(timestamp);
}

