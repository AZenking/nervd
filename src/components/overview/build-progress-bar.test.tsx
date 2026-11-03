import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildProgressBar } from './build-progress-bar';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('BuildProgressBar & useBuildProgress', () => {
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

  it('无预估历史时长时，降级为首次运行流光占位', () => {
    const startTime = Date.now() - 15000;

    act(() => {
      root?.render(<BuildProgressBar startTime={startTime} />);
    });

    expect(container?.textContent).toContain('00:15');
    expect(container?.textContent).toContain('首次运行预估中');
  });

  it('有预估历史时长且未超时，显示正确百分比与剩余时间', () => {
    const now = 1700000000000;
    vi.setSystemTime(now);

    const startTime = now - 30000; // 已跑 30s
    const estimatedDurationMs = 60000; // 预估 60s

    act(() => {
      root?.render(
        <BuildProgressBar
          startTime={startTime}
          estimatedDurationMs={estimatedDurationMs}
        />,
      );
    });

    expect(container?.textContent).toContain('00:30');
    expect(container?.textContent).toContain('01:00');
    expect(container?.textContent).toContain('50%');
    expect(container?.textContent).toContain('剩余约 00:30');
  });

  it('超过预估历史时长时，切换为超时警告状态', () => {
    const now = 1700000000000;
    vi.setSystemTime(now);

    const startTime = now - 75000; // 已跑 75s
    const estimatedDurationMs = 60000; // 预估 60s

    act(() => {
      root?.render(
        <BuildProgressBar
          startTime={startTime}
          estimatedDurationMs={estimatedDurationMs}
        />,
      );
    });

    expect(container?.textContent).toContain('01:15');
    expect(container?.textContent).toContain('超出预估 +00:15');
    expect(container?.textContent).toContain('95%');
  });
});
