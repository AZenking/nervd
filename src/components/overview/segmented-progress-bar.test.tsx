import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LinearSegmentedProgressBar } from './segmented-progress-bar';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('LinearSegmentedProgressBar', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
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
  });

  it('空数据时渲染极简灰色占位条', () => {
    act(() => {
      root?.render(
        <TooltipProvider>
          <LinearSegmentedProgressBar
            breakdown={{ total: 0, completed: 0, inProgress: 0, blocked: 0, todo: 0, percent: 0 }}
          />
        </TooltipProvider>,
      );
    });
    expect(container?.querySelector('[aria-label="暂无工作项进度"]')).not.toBeNull();
  });

  it('正常数据时渲染多个分段色块', () => {
    act(() => {
      root?.render(
        <TooltipProvider>
          <LinearSegmentedProgressBar
            breakdown={{ total: 10, completed: 5, inProgress: 3, blocked: 1, todo: 1, percent: 50 }}
          />
        </TooltipProvider>,
      );
    });
    const bar = container?.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');

    // 应该渲染 4 个色块段
    const spans = bar?.querySelectorAll('span');
    expect(spans?.length).toBe(4);
  });
});
