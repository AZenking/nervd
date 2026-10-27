import { describe, expect, it } from 'vitest';
import { describeCron, getNextRunTime, getNextRunTimes, validateCron } from './cron';

describe('cron expression validator', () => {
  it('validates standard 5-part cron expressions', () => {
    expect(validateCron('* * * * *').valid).toBe(true);
    expect(validateCron('*/15 * * * *').valid).toBe(true);
    expect(validateCron('0 2 * * *').valid).toBe(true);
    expect(validateCron('0 9 * * 1-5').valid).toBe(true);
    expect(validateCron('0,30 9-18 * * 1-5').valid).toBe(true);
  });

  it('rejects invalid field counts and numbers out of range', () => {
    expect(validateCron('').valid).toBe(false);
    expect(validateCron('* * * *').valid).toBe(false);
    expect(validateCron('* * * * * *').valid).toBe(false);
    expect(validateCron('60 * * * *').valid).toBe(false);
    expect(validateCron('* 24 * * *').valid).toBe(false);
    expect(validateCron('* * 32 * *').valid).toBe(false);
    expect(validateCron('* * * 13 *').valid).toBe(false);
    expect(validateCron('* * * * 8').valid).toBe(false);
    expect(validateCron('abc * * * *').valid).toBe(false);
  });
});

describe('cron description generator', () => {
  it('generates friendly Chinese descriptions for presets and standard patterns', () => {
    expect(describeCron('*/15 * * * *')).toBe('每 15 分钟');
    expect(describeCron('0 2 * * *')).toBe('每天凌晨 02:00');
    expect(describeCron('0 9 * * 1-5')).toBe('工作日早 09:00');
    expect(describeCron('0 */2 * * *')).toBe('每 2 小时');
    expect(describeCron('30 14 * * 1')).toBe('每周一 14:30');
    expect(describeCron('0 18 * * 0,6')).toBe('周末 (周六周日) 18:00');
  });

  it('handles invalid cron by returning error indicator', () => {
    expect(describeCron('invalid')).toBe('无效表达式');
  });
});

describe('next run calculator', () => {
  it('calculates the next minute for every-minute cron', () => {
    const base = new Date('2026-10-27T10:15:30.000Z');
    const next = getNextRunTime('* * * * *', base);
    expect(next).not.toBeNull();
    expect(next?.toISOString()).toBe('2026-10-27T10:16:00.000Z');
  });

  it('calculates next run for fixed daily time (02:00)', () => {
    const beforeRun = new Date('2026-10-27T01:30:00.000');
    const next = getNextRunTime('0 2 * * *', beforeRun);
    expect(next?.getHours()).toBe(2);
    expect(next?.getMinutes()).toBe(0);
    expect(next?.getDate()).toBe(27);

    const afterRun = new Date('2026-10-27T03:00:00.000');
    const nextDay = getNextRunTime('0 2 * * *', afterRun);
    expect(nextDay?.getHours()).toBe(2);
    expect(nextDay?.getMinutes()).toBe(0);
    expect(nextDay?.getDate()).toBe(28);
  });

  it('predicts multiple upcoming execution times', () => {
    const base = new Date('2026-10-27T00:00:00.000');
    const runs = getNextRunTimes('0 */4 * * *', 3, base);
    expect(runs).toHaveLength(3);
    expect(runs[0].getHours()).toBe(4);
    expect(runs[1].getHours()).toBe(8);
    expect(runs[2].getHours()).toBe(12);
  });
});
