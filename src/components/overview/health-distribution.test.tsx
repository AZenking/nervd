import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HealthDistributionCard } from './health-distribution';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('HealthDistributionCard', () => {
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

  it('按照生命周期严格排序：运行中 → 失败 → 待办 → 完成', () => {
    const items = [
      { status: '已完成' },
      { status: '已完成' },
      { status: '待排期' },
      { status: '进行中' },
      { status: '阻塞' },
    ];

    act(() => {
      root?.render(<HealthDistributionCard items={items} />);
    });

    const statusTexts = Array.from(container?.querySelectorAll('span.w-20') ?? []).map(
      (el) => el.textContent,
    );

    // 进行中(Run)应在最前，阻塞(Fail)其次，待排期(Idle)再次，已完成(Ok)最后
    expect(statusTexts).toEqual(['进行中', '阻塞', '待排期', '已完成']);
    expect(container?.textContent).toContain('共 5 项');
  });

  it('空数据时展示暂无工作项', () => {
    act(() => {
      root?.render(<HealthDistributionCard items={[]} />);
    });
    expect(container?.textContent).toContain('暂无工作项');
  });
});
