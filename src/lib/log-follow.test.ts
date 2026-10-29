import { describe, expect, it } from 'vitest';
import { updateLogFollowState, type LogScrollMetrics } from './log-follow';

const metrics = (scrollTop: number, scrollHeight = 1000): LogScrollMetrics => ({
  scrollTop,
  scrollHeight,
  clientHeight: 400,
});

describe('log auto-follow', () => {
  it('pauses when the user scrolls up, then resumes at the bottom', () => {
    const beforeUpwardScroll = metrics(400);
    const afterUpwardScroll = metrics(320);
    const beforeReturning = metrics(320);
    const nearBottom = metrics(598);

    const paused = updateLogFollowState(true, beforeUpwardScroll, afterUpwardScroll);
    expect(paused).toBe(false);
    expect(updateLogFollowState(paused, beforeReturning, metrics(580))).toBe(false);
    expect(updateLogFollowState(paused, beforeReturning, nearBottom)).toBe(true);
  });

  it('does not pause when a shorter content range clamps the scroll position', () => {
    const beforeCollapse = { scrollTop: 500, scrollHeight: 1200, clientHeight: 400 };
    const afterCollapse = { scrollTop: 350, scrollHeight: 900, clientHeight: 400 };

    expect(updateLogFollowState(true, beforeCollapse, afterCollapse)).toBe(true);
  });

  it('keeps following when new content extends the range at the bottom', () => {
    expect(updateLogFollowState(true, metrics(600), metrics(600, 1100))).toBe(true);
  });
});
