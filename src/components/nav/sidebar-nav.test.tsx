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

  it('主导航顺序为 当前迭代 → 总览 → 定时任务 → 迭代列表 → 工具，且不含「高级模式」开关', async () => {
    await render(
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
      </SidebarProvider>,
    );

    const nav = container?.querySelector('nav[aria-label="主导航"]');
    expect(nav).toBeTruthy();

    // 主入口：当前迭代 → 总览 → 定时任务（定时任务从工具分组上提，紧跟总览）
    const mainGroup = nav?.querySelector('[data-nav-group="main"]') as HTMLElement;
    expect(mainGroup).toBeTruthy();
    expect(menuButtonLabels(mainGroup)).toEqual(['当前迭代', '总览', '定时任务']);
    expect(nav?.querySelector('[data-sidebar="menu-button"]')?.textContent).toContain('当前迭代');

    const schedulesButton = [...(mainGroup.querySelectorAll<HTMLButtonElement>('[data-sidebar="menu-button"]') ?? [])].find(
      (el) => (el.textContent ?? '').includes('定时任务'),
    ) as HTMLButtonElement;
    await act(async () => {
      schedulesButton.click();
    });
    expect(useUi.getState().view).toBe('schedules');

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

  it('工具分组使用 HeroUI Accordion：默认收起；点击展开后 2 个入口分别映射到对应视图', async () => {
    await render(
      <SidebarProvider defaultOpen={true}>
        <NavTools />
      </SidebarProvider>,
    );

    const trigger = container?.querySelector('[data-nav-tools-trigger]') as HTMLButtonElement;
    const panel = container?.querySelector('[data-slot="accordion-panel"]') as HTMLElement;
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

  it('折叠为纯图标模式时工具内条目仍以图标按钮到达（无分组标题）', async () => {
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
    expect(buttons).toHaveLength(2);
    // 折叠态不依赖文字可见：SidebarMenuButton 用 tooltip 文本补 aria-label
    expect(buttons.map((el) => el.getAttribute('aria-label'))).toEqual([
      '最近查看',
      '集成分支',
    ]);
    // 全部不在隐藏容器内，点击可达
    expect(buttons.every((el) => el.closest('[hidden]') === null)).toBe(true);
  });

  it('定时任务徽标展示已启用任务数量，0 时不展示', async () => {
    await render(
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
      </SidebarProvider>,
    );

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

  it('设置模式：侧栏按「个人偏好 / 工作区 / 应用」分组，分组标题不可点击并直达 9 个页面', async () => {
    useUi.setState({ view: 'full-settings', settingsSection: 'connection' });
    await render(
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
      </SidebarProvider>,
    );

    const nav = container?.querySelector('nav[aria-label="设置导航"]');
    expect(nav).toBeTruthy();
    const groups = [...(nav?.querySelectorAll<HTMLElement>('[data-settings-group]') ?? [])];
    expect(groups.map((group) => group.getAttribute('data-settings-group'))).toEqual([
      '个人偏好',
      '工作区',
      '应用',
    ]);

    // 分组标题为不可点击文本，不是菜单项
    expect(groups[0].textContent).toContain('个人偏好');
    expect(groups[0].querySelector('[data-sidebar="menu-button"]')?.textContent).not.toContain('个人偏好');

    // 返回工作区不再占据导航顶部，而是固定在侧栏底部
    expect(nav?.textContent).not.toContain('返回工作区');
    expect(
      container?.querySelector('[data-slot="sidebar-footer"] [data-sidebar="menu-button"]')?.textContent,
    ).toContain('返回工作区');

    const settingsLabels = [
      ...(nav?.querySelectorAll<HTMLElement>('[data-sidebar="menu-button"]') ?? []),
    ]
      .map((el) => (el.textContent ?? '').trim())
      .filter((label) => label !== '返回工作区');
    expect(settingsLabels).toEqual([
      '外观与交互',
      '云效连接',
      '仓库与分支',
      '构建集成',
      '变更追溯',
      'AI 助手',
      '安全与权限',
      '诊断与支持',
      '关于 nervd',
    ]);

    const appearance = [...(nav?.querySelectorAll<HTMLElement>('[data-sidebar="menu-button"]') ?? [])].find(
      (el) => (el.textContent ?? '').includes('外观与交互'),
    ) as HTMLElement;
    await act(async () => {
      appearance.click();
    });
    expect(useUi.getState().settingsSection).toBe('appearance');
    expect(useUi.getState().view).toBe('full-settings');
  });

  it('设置模式折叠为图标时保留全部入口，分组标题让位', async () => {
    useUi.setState({ view: 'full-settings', settingsSection: 'trace' });
    await render(
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
      </SidebarProvider>,
    );

    const groups = [...(container?.querySelectorAll<HTMLElement>('[data-settings-group]') ?? [])];
    expect(groups).toHaveLength(3);
    // 折叠态隐藏分组标题（ClassName 由侧栏 group-data 控制），页面按钮仍可达
    const labels = [...(container?.querySelectorAll<HTMLElement>('[data-settings-group-label]') ?? [])];
    expect(labels).toHaveLength(3);
    expect(
      labels.every((label) => label.className.includes('group-data-[collapsible=icon]:hidden')),
    ).toBe(true);

    const buttons = [
      ...(container?.querySelectorAll<HTMLElement>('nav[aria-label="设置导航"] [data-sidebar="menu-button"]') ?? []),
    ];
    expect(buttons).toHaveLength(9);
    expect(buttons.every((el) => el.closest('[hidden]') === null)).toBe(true);
    // 折叠态下返回工作区仍固定在底部，以图标按钮到达
    const footerButton = container?.querySelector<HTMLElement>(
      '[data-slot="sidebar-footer"] [data-sidebar="menu-button"]',
    );
    expect(footerButton?.getAttribute('aria-label')).toBe('返回工作区');
  });
});