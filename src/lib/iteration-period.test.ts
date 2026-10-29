import { describe, expect, it } from 'vitest';
import {
  calculateSprintRemaining,
  formatSprintDateRange,
  calculateIterationProgress,
} from './iteration-period';

describe('iteration-period utils', () => {
  const baseDate = new Date(2026, 9, 29, 12, 0, 0); // 2026-10-29 12:00:00

  it('calculateSprintRemaining: 正常未来剩余天数', () => {
    const res = calculateSprintRemaining('2026-11-05', baseDate);
    expect(res.days).toBe(7);
    expect(res.label).toBe('剩余 7 天');
    expect(res.tone).toBe('ok');
  });

  it('calculateSprintRemaining: 临近截止 (<=3 天)', () => {
    const res = calculateSprintRemaining('2026-10-31', baseDate);
    expect(res.days).toBe(2);
    expect(res.label).toBe('剩余 2 天');
    expect(res.tone).toBe('run');
  });

  it('calculateSprintRemaining: 今天截止', () => {
    const res = calculateSprintRemaining('2026-10-29', baseDate);
    expect(res.days).toBe(0);
    expect(res.label).toBe('今天截止');
    expect(res.tone).toBe('run');
  });

  it('calculateSprintRemaining: 已延期', () => {
    const res = calculateSprintRemaining('2026-10-25', baseDate);
    expect(res.days).toBe(-4);
    expect(res.label).toBe('已延期 4 天');
    expect(res.tone).toBe('fail');
  });

  it('calculateSprintRemaining: 空值或非法日期优雅回退', () => {
    expect(calculateSprintRemaining(null, baseDate).label).toBe('未设截止时间');
    expect(calculateSprintRemaining('', baseDate).label).toBe('未设截止时间');
    expect(calculateSprintRemaining('not-a-date', baseDate).label).toBe('日期无效');
  });

  it('formatSprintDateRange: 正常区间与缺省', () => {
    expect(formatSprintDateRange('2026-10-16', '2026-10-30')).toBe('2026-10-16 ~ 2026-10-30');
    expect(formatSprintDateRange('2026-10-16', null)).toBe('自 2026-10-16 起');
    expect(formatSprintDateRange(null, '2026-10-30')).toBe('至 2026-10-30 止');
    expect(formatSprintDateRange(null, null)).toBe('周期未设置');
  });

  it('calculateIterationProgress: 按语义正确归类', () => {
    const items = [
      { status: '已完成' },
      { status: '已关闭' },
      { status: '进行中' },
      { status: '开发中' },
      { status: '阻塞' },
      { status: '未开始' },
      { status: '待排期' },
      { status: '待排期' },
    ];
    const progress = calculateIterationProgress(items);
    expect(progress.total).toBe(8);
    expect(progress.completed).toBe(2);
    expect(progress.inProgress).toBe(2);
    expect(progress.blocked).toBe(1);
    expect(progress.todo).toBe(3);
    expect(progress.percent).toBe(25); // 2/8 = 25%
  });
});
