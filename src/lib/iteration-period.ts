import { statusMeta } from '@/components/StatusBadge';

export interface SprintRemainingInfo {
  days: number;
  label: string;
  tone: 'ok' | 'run' | 'fail' | 'idle';
}

/**
 * 计算迭代截止日期的剩余状态与文案
 * @param endDate 格式如 YYYY-MM-DD 或 ISO 字符串
 * @param now 可传入基准时间用于单元测试
 */
export function calculateSprintRemaining(endDate?: string | null, now = new Date()): SprintRemainingInfo {
  if (!endDate || !endDate.trim()) {
    return { days: 0, label: '未设截止时间', tone: 'idle' };
  }

  // 处理 YYYY-MM-DD 格式
  const parts = endDate.trim().split(/[-/]/);
  let end: Date;
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    // 当天 23:59:59 结束
    end = new Date(year, month, day, 23, 59, 59, 999);
  } else {
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
  }

  if (isNaN(end.getTime())) {
    return { days: 0, label: '日期无效', tone: 'idle' };
  }

  // 统一按天数边界计算（抹平当天的具体时分秒落差）
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const diffDays = Math.round((startOfEnd - startOfNow) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { days: diffDays, label: `已延期 ${Math.abs(diffDays)} 天`, tone: 'fail' };
  }
  if (diffDays === 0) {
    return { days: 0, label: '今天截止', tone: 'run' };
  }
  if (diffDays === 1) {
    return { days: 1, label: '剩余 1 天', tone: 'run' };
  }
  if (diffDays <= 3) {
    return { days: diffDays, label: `剩余 ${diffDays} 天`, tone: 'run' };
  }
  return { days: diffDays, label: `剩余 ${diffDays} 天`, tone: 'ok' };
}

/**
 * 格式化起止周期展示文本
 */
export function formatSprintDateRange(startDate?: string | null, endDate?: string | null): string {
  const s = startDate?.trim()?.slice(0, 10);
  const e = endDate?.trim()?.slice(0, 10);
  if (s && e) return `${s} ~ ${e}`;
  if (s) return `自 ${s} 起`;
  if (e) return `至 ${e} 止`;
  return '周期未设置';
}

export interface IterationWorkitemBreakdown {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  todo: number;
  percent: number;
}

/**
 * 按生命周期语义分析迭代工作项统计
 */
export function calculateIterationProgress(items: { status?: string | null }[]): IterationWorkitemBreakdown {
  let completed = 0;
  let inProgress = 0;
  let blocked = 0;
  let todo = 0;

  for (const item of items) {
    const tone = statusMeta(item.status).tone;
    if (tone === 'ok') completed += 1;
    else if (tone === 'run') inProgress += 1;
    else if (tone === 'fail') blocked += 1;
    else todo += 1;
  }

  const total = items.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, inProgress, blocked, todo, percent };
}
