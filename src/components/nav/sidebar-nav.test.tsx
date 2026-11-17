// 侧栏导航收敛（task-1）：主导航顺序 / 工具分组开合与入口映射 / 折叠态图标入口 / 定时任务徽标
// 纯 DOM 断言（项目单测基座为 react-dom createRoot + act，未引入 testing-library）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AppSidebar } from './app-sidebar';
import { NavTools } from './nav-tools';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';
import { useScheduleStore } from '@/store/schedule';
import { useRecentWorkitems } from '@/store/recent-workitems';

// @ts-expect-error test act environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** 触发 RAC Button 的键盘 press（usePress 在 keydown 阶段按下、keyup 阶段释放） */
function pressKey(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

function menuButtonLabels(scope: ParentNode): string[] {
  return [...scope.querySelectorAll<HTMLElement>('[data-sidebar="menu-button"]')].map(
    (el) => (el.textContent ?? '').trim(),
  );
}

describe('侧栏导航收敛', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  const render = async (element: React.ReactElement) => {
    await act(async () => {
      root?.render(element);
    });
  };

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
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
      settingsSection: 'connection',
    });
    useApp.setState({
      iterations: [
        { id: '1', name: 'Sprint-1', title: 'Sprint-1', state: '进行中', startDate: '2026-11-01', endDate: '2026-11-15' },
        { id: '2', name: 'Sprint-2', title: 'Sprint-2', state: '未开始', startDate: '2026-11-16', endDate: '2026-11-30' },
      ],
      loadingIterations: false,
    } as never);
    useRecentWorkitems.setState({ items: [] } as never);
    useScheduleStore.setState({ tasks: [] } as never);
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

  it('主导航顺序为 当前迭代 → 总览 → 迭代列表 → 工具，且不含「高级模式」开关', async () => {
    await render(
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
      </SidebarProvider>,
    );

    const nav = container?.querySelector('nav[aria-label="主导航"]');
    expect(nav).toBeTruthy();

    // 前两个主入口：当前迭代（第一项）、总览
    const mainGroup = nav?.querySelector('[data-nav-group="main"]') as HTMLElement;
    expect(mainGroup).toBeTruthy();
    expect(menuButtonLabels(mainGroup)).toEqual(['当前迭代', '总览']);
    expect(nav?.querySelector('[data-sidebar="menu-button"]')?.textContent).toContain('当前迭代');

    const iterationsTrigger = nav?.querySelector('[data-slot="accordion-trigger"]') as HTMLElement;
    const toolsGroup = nav?.querySelector('[data-nav-group="tools"]') as HTMLElement;
    expect(iterationsTrigger).toBeTruthy();
    expect(toolsGroup).toBeTruthy();

    // 文档顺序：主导航 → 迭代列表 → 工具
    expect(mainGroup.compareDocumentPosition(iterationsTrigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(iterationsTrigger.compareDocumentPosition(toolsGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 工具分组不引入「高级模式」开关
    expect(container?.textContent).not.toContain('高级模式');
  });

  it('工具分组默认收起；点击展开后 4 个入口分别映射到对应视图/设置分区', async () => {
    await render(
      <SidebarProvider defaultOpen={true}>
        <NavTools />
      </SidebarProvider>,
    );

    const trigger = container?.querySelector('[data-nav-tools-trigger]') as HTMLButtonElement;
    const panel = container?.querySelector('[data-slot="collapsible-content"]') as HTMLElement;
    expect(trigger).toBeTruthy();
    expect(panel).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hasAttribute('hidden')).toBe(true);

    await act(async () => {
      trigger.click();
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(menuButtonLabels(container!)).toEqual([
      '最近查看',
      '集成分支',
      '定时任务',
      '本地仓库与 Agent',
    ]);

    const buttonByLabel = (label: string) =>
      [...container!.querySelectorAll<HTMLButtonElement>('[data-sidebar="menu-button"]')].find((el) =>
        (el.textContent ?? '').includes(label),
      ) as HTMLButtonElement;

    await act(async () => {
      buttonByLabel('最近查看').click();
    });
    expect(useUi.getState().view).toBe('recents');

    await act(async () => {
      buttonByLabel('集成分支').click();
    });
    expect(useUi.getState().view).toBe('integration');

    await act(async () => {
      buttonByLabel('定时任务').click();
    });
    expect(useUi.getState().view).toBe('schedules');

    await act(async () => {
      buttonByLabel('本地仓库与 Agent').click();
    });
    expect(useUi.getState().view).toBe('full-settings');
    expect(useUi.getState().settingsSection).toBe('attribution');
  });

  it('键盘 Enter / Space 均可开合工具分组，aria-expanded 同步', async () => {
    await render(
      <SidebarProvider defaultOpen={true}>
        <NavTools />
      </SidebarProvider>,
    );

    const trigger = container?.querySelector('[data-nav-tools-trigger]') as HTMLButtonElement;
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('type')).toBe('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      pressKey(trigger, 'Enter');
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await act(async () => {
      pressKey(trigger, 'Enter');
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      pressKey(trigger, ' ');
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('进入工具内页面时自动展开，当前页在侧栏可见', async () => {
    useUi.setState({ view: 'integration' });
    await render(
      <SidebarProvider defaultOpen={true}>
        <NavTools />
      </SidebarProvider>,
    );

    const trigger = container?.querySelector('[data-nav-tools-trigger]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const active = container?.querySelector('[data-sidebar="menu-button"][data-active]');
    expect(active?.textContent).toContain('集成分支');
  });

  it('折叠为纯图标模式时工具内 4 个条目仍以图标按钮到达（无分组标题）', async () => {
    await render(
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
      </SidebarProvider>,
    );

    // 折叠态不渲染分组标题/折叠容器
    expect(container?.querySelector('[data-nav-tools-trigger]')).toBeNull();

    const toolsGroup = container?.querySelector('[data-nav-group="tools"]') as HTMLElement;
    expect(toolsGroup).toBeTruthy();
    const buttons = [
      ...toolsGroup.querySelectorAll<HTMLButtonElement>('[data-sidebar="menu-button"]'),
    ];
    expect(buttons).toHaveLength(4);
    // 折叠态不依赖文字可见：SidebarMenuButton 用 tooltip 文本补 aria-label
    expect(buttons.map((el) => el.getAttribute('aria-label'))).toEqual([
      '最近查看',
      '集成分支',
      '定时任务',
      '本地仓库与 Agent',
    ]);
    // 全部不在隐藏容器内，点击可达
    expect(buttons.every((el) => el.closest('[hidden]') === null)).toBe(true);
  });

  it('定时任务徽标展示已启用任务数量，0 时不展示', async () => {
    await render(
      <SidebarProvider defaultOpen={true}>
        <NavTools />
      </SidebarProvider>,
    );
    const trigger = container?.querySelector('[data-nav-tools-trigger]') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    const schedulesButton = () =>
      [...container!.querySelectorAll<HTMLButtonElement>('[data-sidebar="menu-button"]')].find((el) =>
        (el.textContent ?? '').includes('定时任务'),
      ) as HTMLButtonElement;

    // 0 个启用任务：无数字徽标
    expect(schedulesButton().textContent).toBe('定时任务');

    // 3 个任务中 2 个启用 → 徽标为 2
    await act(async () => {
      useScheduleStore.setState({
        tasks: [
          { id: 't1', enabled: true },
          { id: 't2', enabled: true },
          { id: 't3', enabled: false },
        ],
      } as never);
    });
    expect(schedulesButton().textContent).toBe('定时任务2');
  });
});