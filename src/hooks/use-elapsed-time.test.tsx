import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatElapsedTime, useElapsedTime } from './use-elapsed-time';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function TestTimer({ startTime, active }: { startTime?: number | null; active?: boolean }) {
  const elapsed = useElapsedTime(startTime, active);
  return <div data-testid="elapsed">{elapsed}</div>;
}

describe('use-elapsed-time', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
    vi.useRealTimers();
  });

  it('formatElapsedTime: 格式化不同区间耗时', () => {
    expect(formatElapsedTime(0)).toBe('00:00');
    expect(formatElapsedTime(5000)).toBe('00:05');
    expect(formatElapsedTime(65000)).toBe('01:05');
    expect(formatElapsedTime(3665000)).toBe('1:01:05');
    expect(formatElapsedTime(-100)).toBe('00:00');
  });

  it('useElapsedTime: 启动计时器并随时间跳动', () => {
    const start = 1_000_000;
    vi.setSystemTime(start);

    act(() => {
      root?.render(<TestTimer startTime={start} active />);
    });
    expect(container?.querySelector('[data-testid="elapsed"]')?.textContent).toBe('00:00');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container?.querySelector('[data-testid="elapsed"]')?.textContent).toBe('00:03');

    act(() => {
      vi.advanceTimersByTime(70000);
    });
    expect(container?.querySelector('[data-testid="elapsed"]')?.textContent).toBe('01:13');
  });

  it('useElapsedTime: 无 startTime 时返回占位横线', () => {
    act(() => {
      root?.render(<TestTimer startTime={null} active />);
    });
    expect(container?.querySelector('[data-testid="elapsed"]')?.textContent).toBe('—');
  });

  it('useElapsedTime: active=false 时不启动定时器', () => {
    const start = 1_000_000;
    vi.setSystemTime(start + 5000);

    act(() => {
      root?.render(<TestTimer startTime={start} active={false} />);
    });
    expect(container?.querySelector('[data-testid="elapsed"]')?.textContent).toBe('00:05');

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    // 不自增
    expect(container?.querySelector('[data-testid="elapsed"]')?.textContent).toBe('00:05');
  });
});
