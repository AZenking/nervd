import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime } from './format';

describe('formatRelativeTime', () => {
  const BASE_TIME = 1774350000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('小于 1 分钟返回「刚刚」', () => {
    expect(formatRelativeTime(BASE_TIME - 30_000)).toBe('刚刚');
    expect(formatRelativeTime(BASE_TIME - 1_000)).toBe('刚刚');
  });

  it('1 到 59 分钟返回「N 分钟前」', () => {
    expect(formatRelativeTime(BASE_TIME - 5 * 60_000)).toBe('5 分钟前');
    expect(formatRelativeTime(BASE_TIME - 45 * 60_000)).toBe('45 分钟前');
  });

  it('1 到 23 小时返回「N 小时前」', () => {
    expect(formatRelativeTime(BASE_TIME - 3 * 3600_000)).toBe('3 小时前');
  });

  it('1 到 6 天返回「N 天前」', () => {
    expect(formatRelativeTime(BASE_TIME - 2 * 86400_000)).toBe('2 天前');
  });
});
