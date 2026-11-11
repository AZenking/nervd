import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandMenu } from './command-menu';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';
import { useRecentWorkitems } from '@/store/recent-workitems';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CommandMenu', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUi.setState({
      commandOpen: true,
      view: 'overview',
    });

    useRecentWorkitems.setState({
      items: [
        {
          workitemId: 'rec-1',
          identifier: 'REQ-101',
          subject: '测试最近浏览工作项超长标题用于走查截断与工具提示展示效果',
          viewedAt: Date.now(),
          stayedSeconds: 45,
        },
      ],
    });

    useApp.setState({
      items: [
        {
          workitemId: 'wi-1',
          identifier: 'REQ-202',
          subject: '测试工作项列表中的长文本工作项项目标题',
          status: '进行中',
          category: 'Req',
        },
      ],
      iterations: [
        {
          id: 'iter-1',
          name: '2026年Q4双十一保障与稳定性优化冲刺迭代',
          state: '进行中',
          title: 'Q4 冲刺',
          startDate: '2026-10-01',
          endDate: '2026-11-15',
        },
      ],
    });
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
    useUi.setState({ commandOpen: false });
  });

  it('renders command menu with search input and default entries', async () => {
    await act(async () => {
      root?.render(<CommandMenu />);
    });

    const input = document.querySelector('input') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.placeholder).toContain('搜索工作项');
    expect(document.body.textContent).toContain('总览');
    expect(document.body.textContent).toContain('REQ-101');
  });

  it('input stops propagation on keydown so global shortcuts do not swallow typing', async () => {
    await act(async () => {
      root?.render(<CommandMenu />);
    });

    const input = document.querySelector('input') as HTMLInputElement;
    const keydownEvent = new KeyboardEvent('keydown', {
      key: 'g',
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(keydownEvent, 'stopPropagation');

    await act(async () => {
      input.dispatchEvent(keydownEvent);
    });

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('supports Space key input without triggering entry execution', async () => {
    await act(async () => {
      root?.render(<CommandMenu />);
    });

    const input = document.querySelector('input') as HTMLInputElement;
    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(spaceEvent, 'stopPropagation');

    await act(async () => {
      input.dispatchEvent(spaceEvent);
    });

    expect(stopPropagationSpy).toHaveBeenCalled();
    // Modal should stay open
    expect(useUi.getState().commandOpen).toBe(true);
  });

  it('ignores Enter when IME composition is active (Chinese/Pinyin typing)', async () => {
    await act(async () => {
      root?.render(<CommandMenu />);
    });

    const input = document.querySelector('input') as HTMLInputElement;
    // Simulate IME composition (isComposing = true)
    const imeEnterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(imeEnterEvent, 'isComposing', { value: true });

    await act(async () => {
      input.dispatchEvent(imeEnterEvent);
    });

    // Should NOT close command menu or trigger navigation
    expect(useUi.getState().commandOpen).toBe(true);
  });

  it('provides title attributes on truncated entry labels and hints', async () => {
    await act(async () => {
      root?.render(<CommandMenu />);
    });

    // Recent item label
    const recentLabel = document.querySelector('[title*="测试最近浏览工作项超长标题"]');
    expect(recentLabel).not.toBeNull();
  });
});
