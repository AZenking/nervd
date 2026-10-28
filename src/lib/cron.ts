// 零依赖 5 段式标准 Cron 表达式解析与时间计算引擎
// 格式：minute (0-59) hour (0-23) dayOfMonth (1-31) month (1-12) dayOfWeek (0-7, 0与7均为周日)

export interface CronPreset {
  label: string;
  value: string;
  description: string;
}

export const CRON_PRESETS: readonly CronPreset[] = [
  { label: '每 15 分钟', value: '*/15 * * * *', description: '高频敏捷巡检' },
  { label: '每 30 分钟', value: '*/30 * * * *', description: '日常周期同步' },
  { label: '每小时整点', value: '0 * * * *', description: '如 09:00, 10:00, 11:00' },
  { label: '每 2 小时', value: '0 */2 * * *', description: '如 08:00, 10:00, 12:00' },
  { label: '工作日早 09:00', value: '0 9 * * 1-5', description: '周一至周五开工前' },
  { label: '每天凌晨 02:00', value: '0 2 * * *', description: '夜间全量构建与集成' },
  { label: '每周一早 09:00', value: '0 9 * * 1', description: '周会前全量代码对齐' },
];

interface FieldRange {
  min: number;
  max: number;
  name: string;
}

const FIELD_RANGES: FieldRange[] = [
  { min: 0, max: 59, name: '分钟 (0-59)' },
  { min: 0, max: 23, name: '小时 (0-23)' },
  { min: 1, max: 31, name: '日期 (1-31)' },
  { min: 1, max: 12, name: '月份 (1-12)' },
  { min: 0, max: 7, name: '星期 (0-7)' },
];

// 解析单个 Cron 字段（支持 '*', '* / step', '1-5', '1,3,5', '1-10/2'）
function parseField(field: string, range: FieldRange): Set<number> | null {
  const values = new Set<number>();
  const parts = field.split(',');

  for (const part of parts) {
    if (!part) return null;

    if (part === '*') {
      for (let i = range.min; i <= (range.name.includes('星期') ? 6 : range.max); i++) {
        values.add(i);
      }
      continue;
    }

    if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10);
      if (isNaN(step) || step <= 0) return null;
      for (let i = range.min; i <= (range.name.includes('星期') ? 6 : range.max); i += step) {
        values.add(i);
      }
      continue;
    }

    if (part.includes('/')) {
      const [rangePart, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) return null;
      const subValues = parseRangeOrValue(rangePart, range);
      if (!subValues) return null;
      const sorted = [...subValues].sort((a, b) => a - b);
      if (!sorted.length) return null;
      const start = sorted[0];
      const end = sorted[sorted.length - 1];
      for (let i = start; i <= end; i += step) {
        if (subValues.has(i)) values.add(i);
      }
      continue;
    }

    const subValues = parseRangeOrValue(part, range);
    if (!subValues) return null;
    for (const v of subValues) values.add(v);
  }

  // 星期中 7 归一化为 0 (Sunday)
  if (range.name.includes('星期') && values.has(7)) {
    values.delete(7);
    values.add(0);
  }

  return values.size > 0 ? values : null;
}

function parseRangeOrValue(part: string, range: FieldRange): Set<number> | null {
  const values = new Set<number>();
  if (part.includes('-')) {
    const [startStr, endStr] = part.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end) || start > end) return null;
    if (start < range.min || end > range.max) return null;
    for (let i = start; i <= end; i++) values.add(i);
    return values;
  }

  const num = parseInt(part, 10);
  if (isNaN(num) || num < range.min || num > range.max) return null;
  values.add(num);
  return values;
}

/**
 * 校验 5 段式 Cron 表达式是否合法
 */
export function validateCron(expr: string): { valid: boolean; error?: string } {
  const trimmed = expr.trim();
  if (!trimmed) return { valid: false, error: 'Cron 表达式不能为空' };

  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    return { valid: false, error: `需要 5 个字段（当前 ${fields.length} 个），格式：分 时 日 月 周` };
  }

  for (let i = 0; i < 5; i++) {
    const parsed = parseField(fields[i], FIELD_RANGES[i]);
    if (!parsed) {
      return { valid: false, error: `第 ${i + 1} 个字段 [${FIELD_RANGES[i].name}] 语法不正确: "${fields[i]}"` };
    }
  }

  return { valid: true };
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 将标准 Cron 表达式转换为友好的中文自然语言说明
 */
export function describeCron(expr: string): string {
  const check = validateCron(expr);
  if (!check.valid) return '无效表达式';

  // 预设匹配
  const preset = CRON_PRESETS.find((p) => p.value === expr.trim());
  if (preset) return preset.label;

  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/);

  // 每 N 分钟
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `每 ${min.slice(2)} 分钟`;
  }

  // 每 N 小时整点
  if (min === '0' && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
    return `每 ${hour.slice(2)} 小时`;
  }

  const pad = (n: number | string) => String(n).padStart(2, '0');

  // 固定时刻（每天 / 工作日 / 特定星期）
  if (!min.includes('*') && !min.includes('/') && !hour.includes('*') && !hour.includes('/')) {
    const timeStr = `${pad(hour)}:${pad(min)}`;
    if (dom === '*' && mon === '*') {
      if (dow === '*') return `每天 ${timeStr}`;
      if (dow === '1-5') return `工作日 (周一至周五) ${timeStr}`;
      if (dow === '0,6' || dow === '6,0') return `周末 (周六周日) ${timeStr}`;
      if (!dow.includes('-') && !dow.includes(',')) {
        const d = parseInt(dow, 10);
        return `每${WEEKDAY_NAMES[d % 7]} ${timeStr}`;
      }
    }
  }

  return `自定义 (${expr.trim()})`;
}

/**
 * 计算给定时间点之后的下一个匹配时刻
 */
export function getNextRunTime(expr: string, fromDate = new Date()): Date | null {
  const check = validateCron(expr);
  if (!check.valid) return null;

  const fields = expr.trim().split(/\s+/);
  const minutes = parseField(fields[0], FIELD_RANGES[0])!;
  const hours = parseField(fields[1], FIELD_RANGES[1])!;
  const daysOfMonth = parseField(fields[2], FIELD_RANGES[2])!;
  const months = parseField(fields[3], FIELD_RANGES[3])!;
  const daysOfWeek = parseField(fields[4], FIELD_RANGES[4])!;

  // 从当前分钟的下一分钟开始检查
  const current = new Date(fromDate.getTime());
  current.setSeconds(0, 0);
  current.setMinutes(current.getMinutes() + 1);

  // 最多向前探测 5 年（约 5 * 366 * 24 * 60 次遍历）
  // 优化：按天/月跨度步进
  const maxSearchDate = new Date(current.getTime());
  maxSearchDate.setFullYear(maxSearchDate.getFullYear() + 2);

  while (current <= maxSearchDate) {
    const month = current.getMonth() + 1; // 1-12
    if (!months.has(month)) {
      // 快速跳过当前月
      current.setMonth(current.getMonth() + 1, 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    const date = current.getDate();
    const day = current.getDay(); // 0-6 (0 is Sunday)

    const domMatch = daysOfMonth.has(date);
    const dowMatch = daysOfWeek.has(day);

    // 标准 Cron: 若日和星期都指定了非通配符，通常两者满足其一即可；若仅有一个指定则严格按指定
    const hasDomRestriction = fields[2] !== '*';
    const hasDowRestriction = fields[4] !== '*';

    let dayMatches = false;
    if (hasDomRestriction && hasDowRestriction) {
      dayMatches = domMatch || dowMatch;
    } else if (hasDomRestriction) {
      dayMatches = domMatch;
    } else if (hasDowRestriction) {
      dayMatches = dowMatch;
    } else {
      dayMatches = true;
    }

    if (!dayMatches) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    const hour = current.getHours();
    if (!hours.has(hour)) {
      current.setHours(current.getHours() + 1, 0, 0, 0);
      continue;
    }

    const minute = current.getMinutes();
    if (!minutes.has(minute)) {
      current.setMinutes(current.getMinutes() + 1);
      continue;
    }

    return new Date(current.getTime());
  }

  return null;
}

/**
 * 预测接下来的 N 次运行时间（用于在配置界面直观预览）
 */
export function getNextRunTimes(expr: string, count = 5, fromDate = new Date()): Date[] {
  const results: Date[] = [];
  let cursor = fromDate;

  for (let i = 0; i < count; i++) {
    const next = getNextRunTime(expr, cursor);
    if (!next) break;
    results.push(next);
    cursor = next;
  }

  return results;
}
