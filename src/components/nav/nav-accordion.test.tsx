// NavProjects HeroUI Accordion 原生手风琴集成测试
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { NavProjects } from './nav-projects';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';

// @ts-expect-error test act environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('NavProjects HeroUI Accordion', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
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
      iterations: [
        { id: '1', name: 'Sprint-1', title: 'Sprint-1', state: '进行中', startDate: '2026-11-01', endDate: '2026-11-15' },
        { id: '2', name: 'Sprint-2', title: 'Sprint-2', state: '待规划', startDate: '2026-11-16', endDate: '2026-11-30' },
      ],
      loadingIterations: false,
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

  it('renders native HeroUI Accordion structure for sidebar iterations', async () => {
    await act(async () => {
      root?.render(
        <SidebarProvider defaultOpen={true}>
          <NavProjects />
        </SidebarProvider>
      );
    });

    // 验证 HeroUI Accordion 原生容器
    const accordion = container?.querySelector('[data-slot="accordion"]');
    expect(accordion).toBeTruthy();

    // 验证 Accordion.Item
    const item = container?.querySelector('[data-slot="accordion-item"]');
    expect(item).toBeTruthy();

    // 验证 Accordion.Trigger 包含迭代统计
    const trigger = container?.querySelector('[data-slot="accordion-trigger"]');
    expect(trigger).toBeTruthy();
    expect(trigger?.textContent).toContain('迭代（2）');

    // 验证 Indicator 存在
    const indicator = container?.querySelector('[data-slot="accordion-indicator"]');
    expect(indicator).toBeTruthy();

    // 验证 Panel 展开并包含迭代菜单项
    const body = container?.querySelector('[data-slot="accordion-body"]');
    expect(body).toBeTruthy();
    const menuButtons = container?.querySelectorAll('[data-sidebar="menu-button"]');
    expect(menuButtons?.length).toBe(2);
  });

  it('hides text labels when sidebar is collapsed to icon mode', async () => {
    await act(async () => {
      root?.render(
        <SidebarProvider defaultOpen={false}>
          <NavProjects />
        </SidebarProvider>
      );
    });

    // 验证 Heading 带有 group-data-[collapsible=icon]:hidden
    const heading = container?.querySelector('[data-slot="accordion-heading"]');
    expect(heading?.className).toContain('group-data-[collapsible=icon]:hidden');

    // 验证迭代名称 span 带有 group-data-[collapsible=icon]:hidden
    const iterationNames = container?.querySelectorAll('.group-data-\\[collapsible\\=icon\\]\\:hidden');
    expect(iterationNames && iterationNames.length).toBeGreaterThan(0);
  });
});
