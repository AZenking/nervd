// IterationView HeroUI Accordion 原生手风琴集成测试
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { IterationView } from './IterationView';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';

// @ts-expect-error test act environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('IterationView HeroUI Accordion', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUi.setState({
      view: 'iteration',
      iterationKey: 'Sprint-1',
    });
    useApp.setState({
      items: [
        {
          workitemId: 'item-1',
          identifier: 'REQ-101',
          subject: '支持需求链路一键回溯',
          status: '开发中',
          category: 'Req',
          assignedTo: '张三',
          sprintId: 'Sprint-1',
        },
        {
          workitemId: 'item-2',
          identifier: 'REQ-102',
          subject: '分支差异自动比对',
          status: '已完成',
          category: 'Req',
          assignedTo: '李四',
          sprintId: 'Sprint-1',
        },
      ],
      loadingList: false,
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  it('renders native HeroUI Accordion for status groups', async () => {
    await act(async () => {
      root?.render(
        <SidebarProvider defaultOpen={true}>
          <IterationView />
        </SidebarProvider>
      );
    });

    // 验证渲染了 HeroUI Accordion
    const accordions = container?.querySelectorAll('[data-slot="accordion"]');
    expect(accordions?.length).toBeGreaterThan(0);

    // 验证状态组分组为 Accordion.Item
    const items = container?.querySelectorAll('[data-slot="accordion-item"]');
    expect(items?.length).toBeGreaterThanOrEqual(2);

    // 验证含有 Accordion.Indicator
    const indicators = container?.querySelectorAll('[data-slot="accordion-indicator"]');
    expect(indicators?.length).toBeGreaterThanOrEqual(2);

    // 验证含有 ListBox
    const listboxes = container?.querySelectorAll('[data-slot="list-box"]');
    expect(listboxes?.length).toBeGreaterThanOrEqual(2);
  });
});
