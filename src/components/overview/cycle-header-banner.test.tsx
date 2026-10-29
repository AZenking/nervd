import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CycleHeaderBanner } from './cycle-header-banner';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CycleHeaderBanner', () => {
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

  it('渲染迭代信息、倒计时与进入工作台触发按钮', () => {
    const handleOpen = vi.fn();
    const iteration = {
      id: 'iter-1',
      name: 'Benz-20261016',
      title: '前端优化',
      state: '进行中',
      startDate: '2026-10-16',
      endDate: '2026-11-15',
    };
    const breakdown = {
      total: 10,
      completed: 6,
      inProgress: 2,
      blocked: 1,
      todo: 1,
      percent: 60,
    };

    act(() => {
      root?.render(
        <TooltipProvider>
          <CycleHeaderBanner
            iteration={iteration}
            breakdown={breakdown}
            onOpenIterationWorkbench={handleOpen}
          />
        </TooltipProvider>,
      );
    });

    expect(container?.textContent).toContain('Benz-20261016');
    expect(container?.textContent).toContain('进行中');
    expect(container?.textContent).toContain('6 / 10');
    expect(container?.textContent).toContain('60%');
    expect(container?.textContent).toContain('进入迭代工作台');

    const button = container?.querySelector('button:last-of-type') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });
    expect(handleOpen).toHaveBeenCalledWith('Benz-20261016');
  });

  it('点击下拉菜单项触发 onSelectIteration 回调', async () => {
    const handleSelect = vi.fn();
    const current = {
      id: 'iter-1',
      name: 'Benz-20261113',
      title: '',
      state: '未开始',
      startDate: '2026-11-01',
      endDate: '2026-11-12',
    };
    const other = {
      id: 'iter-2',
      name: 'Benz-20261030',
      title: '',
      state: '进行中',
      startDate: '2026-10-16',
      endDate: '2026-10-30',
    };
    const breakdown = { total: 0, completed: 0, inProgress: 0, blocked: 0, todo: 0, percent: 0 };

    act(() => {
      root?.render(
        <TooltipProvider>
          <CycleHeaderBanner
            iteration={current}
            iterations={[current, other]}
            breakdown={breakdown}
            onSelectIteration={handleSelect}
          />
        </TooltipProvider>,
      );
    });

    const trigger = container?.querySelector('button') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();

    // 点击打开下拉菜单
    act(() => {
      trigger?.click();
    });

    // 查找下拉菜单项
    const items = document.querySelectorAll('[data-slot="dropdown-menu-item"]');
    expect(items.length).toBe(2);

    const targetItem = Array.from(items).find((el) => el.textContent?.includes('Benz-20261030')) as HTMLElement | undefined;
    expect(targetItem).toBeDefined();

    act(() => {
      targetItem?.click();
    });

    expect(handleSelect).toHaveBeenCalledWith('Benz-20261030');
  });
});
