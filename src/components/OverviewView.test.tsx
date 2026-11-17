import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { SidebarProvider } from '@/components/ui/sidebar';
import { OverviewView } from './OverviewView';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
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
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
  }
  Element.prototype.scrollIntoView = vi.fn();
});

// Mock workitem detail dependencies
vi.mock('@/components/iteration/RequirementDetails', () => ({
  RequirementDetails: () => <div data-testid="requirement-details-mock">RequirementDetails Mock</div>,
}));

describe('OverviewView Component', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // 设置基础 Store 状态
    useApp.setState({
      category: 'Req',
      connection: 'ok',
      settings: {
        organizationId: 'org-test-123',
        defaultSpaceIdentifier: 'space-test',
        allowWriteOps: true,
        watchedRepos: [101],
        repoCiBindings: {
          '101': {
            provider: 'jenkins',
            connectionId: 'c1',
            jobFullName: 'frontend-job',
          },
        },
      } as never,
      iterations: [
        {
          id: 'sprint-1',
          name: 'Sprint-20261029',
          title: '十月冲刺',
          state: '进行中',
          startDate: '2026-10-16',
          endDate: '2026-11-15',
        },
        {
          id: 'sprint-2',
          name: 'Sprint-20261113',
          title: '十一月计划',
          state: '未开始',
          startDate: '2026-11-01',
          endDate: '2026-11-12',
        },
      ],
      items: [
        {
          workitemId: 'wi-101',
          identifier: 'REQ-101',
          subject: '支持 Jenkins 活跃构建监听',
          status: '进行中',
          sprintId: 'sprint-1',
          updatedAt: '2026-10-29T10:00:00Z',
          assignedTo: 'Alice',
        },
        {
          workitemId: 'wi-102',
          identifier: 'REQ-102',
          subject: '细长复合进度条设计落地',
          status: '已完成',
          sprintId: 'sprint-1',
          updatedAt: '2026-10-28T10:00:00Z',
          assignedTo: 'Bob',
        },
        {
          workitemId: 'wi-201',
          identifier: 'REQ-201',
          subject: '十一月新需求规划',
          status: '未开始',
          sprintId: 'sprint-2',
          updatedAt: '2026-10-29T12:00:00Z',
          assignedTo: 'Charlie',
        },
      ] as never,
      pipelines: [
        { pipelineId: 1, pipelineName: 'Flow 生产发布' },
      ],
      runsByPipeline: {
        1: [{ pipelineRunId: 201, status: 'SUCCESS' }],
      },
      repoCiByRepo: {
        101: {
          loading: false,
          snapshot: {
            provider: 'jenkins',
            name: 'frontend-job',
            status: 'SUCCESS',
            runs: [{ runId: '99', status: 'SUCCESS' }],
          },
        },
      },
      loadingList: false,
      loadList: vi.fn(),
      loadIterations: vi.fn(),
      overviewIterations: {
        items: [
          {
            id: 'sprint-1',
            name: 'Sprint-20261029',
            title: '十月冲刺',
            state: '进行中',
            startDate: '2026-10-16',
            endDate: '2026-11-15',
          },
          {
            id: 'sprint-2',
            name: 'Sprint-20261113',
            title: '十一月计划',
            state: '未开始',
            startDate: '2026-11-01',
            endDate: '2026-11-12',
          },
        ],
        status: 'success',
        error: null,
        fetchedAt: Date.now(),
      },
      overviewByCategory: {
        Req: {
          items: [
            {
              workitemId: 'wi-101',
              identifier: 'REQ-101',
              subject: '支持 Jenkins 活跃构建监听',
              status: '进行中',
              category: 'Req',
              sprintId: 'sprint-1',
              updatedAt: '2026-10-29T10:00:00Z',
              assignedTo: 'Alice',
            },
            {
              workitemId: 'wi-102',
              identifier: 'REQ-102',
              subject: '细长复合进度条设计落地',
              status: '已完成',
              category: 'Req',
              sprintId: 'sprint-1',
              updatedAt: '2026-10-28T10:00:00Z',
              assignedTo: 'Bob',
            },
            {
              workitemId: 'wi-201',
              identifier: 'REQ-201',
              subject: '十一月新需求规划',
              status: '未开始',
              category: 'Req',
              sprintId: 'sprint-2',
              updatedAt: '2026-10-29T12:00:00Z',
              assignedTo: 'Charlie',
            },
          ],
          loadedCount: 3,
          nextToken: null,
          complete: true,
          status: 'success',
          error: null,
          fetchedAt: Date.now(),
        },
        Bug: { items: [], loadedCount: 0, nextToken: null, complete: false, status: 'idle', error: null, fetchedAt: null },
        Task: { items: [], loadedCount: 0, nextToken: null, complete: false, status: 'idle', error: null, fetchedAt: null },
      },
      loadOverviewCategory: vi.fn(),
      loadOverviewIterations: vi.fn(),
      loadPipelines: vi.fn(),
      loadRepoCi: vi.fn(),
      select: vi.fn(),
    });

    useUi.setState({
      view: 'overview',
      iterationKey: 'Sprint-20261029',
    });
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });

  it('完整渲染总览：按「需要处理优先」顺序组织区块，统计图默认折叠', () => {
    act(() => {
      root?.render(
        <SidebarProvider>
          <OverviewView />
        </SidebarProvider>,
      );
    });

    const text = container?.textContent ?? '';

    // 0. 统一页头
    expect(text).toContain('总览');

    // 1. 需要关注：三项异常细分 + 合并后的异常总数（不再有重复的 KPI 统计卡）
    expect(text).toContain('需要关注');
    expect(text).toContain('失败构建');
    expect(text).toContain('CI 查询失败');
    expect(text).toContain('未绑定 CI');
    expect(text).toContain('一切正常');
    expect(text).not.toContain('交付监控资产');
    expect(text).not.toContain('活跃构建任务');
    expect(text).not.toContain('当前工作项 (');

    // 2. 活跃构建：QuickBuildConsole 承载运行状态/耗时/日志入口与触发按钮
    expect(text).toContain('快捷构建控制台');
    expect(text).toContain('就绪待命');

    // 3. 当前迭代：周期横幅 + 已加载范围提示 + 进入迭代工作台 + 工作项列表
    expect(text).toContain('Sprint-20261029');
    expect(text).toContain('进入迭代工作台');
    expect(text).toContain('共 2 项');
    expect(text).toContain('工作项速览');
    expect(text).toContain('最近更新');
    expect(text).toContain('REQ-101');
    expect(text).toContain('REQ-102');

    // 4. 仓库与 Flow 状态
    expect(text).toContain('已连接');
    expect(text).toContain('重点仓库 CI');
    expect(text).toContain('组织级 Flow');

    // 5. 迭代统计：区块存在，但默认折叠（面板 aria-hidden）
    expect(text).toContain('迭代统计');
    expect(text).toContain('展开统计');
    expect(container?.querySelector('[data-slot="collapsible-content"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(text).not.toContain('通过率');

    // 顺序断言：需要关注 → 活跃构建 → 当前迭代 → 仓库与 Flow → 迭代统计
    const order = ['需要关注', '快捷构建控制台', 'Sprint-20261029', '重点仓库 CI', '迭代统计'];
    const positions = order.map((label) => text.indexOf(label));
    positions.forEach((position, index) => {
      expect(position).toBeGreaterThanOrEqual(0);
      if (index > 0) expect(position).toBeGreaterThan(positions[index - 1]);
    });

    // 静态的冗长流水线墙与仓库卡片已被成功去除
    expect(text).not.toContain('去绑定 CI');
    expect(text).not.toContain('设置中的默认云效仓库');
  });

  it('迭代统计默认折叠，展开状态由会话内 useState 控制且 aria-expanded 正确', () => {
    act(() => {
      root?.render(
        <SidebarProvider>
          <OverviewView />
        </SidebarProvider>,
      );
    });

    const statsTrigger = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('展开统计'),
    ) as HTMLButtonElement | undefined;
    expect(statsTrigger).toBeDefined();
    expect(statsTrigger?.getAttribute('aria-expanded')).toBe('false');

    const panel = container?.querySelector('[data-slot="collapsible-content"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
    // 折叠时图表不占用首屏可见区域，但内容已随数据挂载（展开无需额外请求）
    expect(panel?.textContent).toContain('状态分布');

    act(() => {
      statsTrigger?.click();
    });

    expect(statsTrigger?.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.getAttribute('aria-hidden')).toBe('false');
    expect(container?.textContent).toContain('收起统计');
    expect(container?.textContent).toContain('状态分布');
    expect(container?.textContent).toContain('更新时间分布');

    act(() => {
      statsTrigger?.click();
    });

    expect(statsTrigger?.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
    expect(container?.textContent).toContain('展开统计');
  });

  it('迭代接口失败时显示错误态，不注入示例迭代', () => {
    useApp.setState({
      overviewIterations: {
        items: [],
        status: 'error',
        error: '迭代接口暂时不可用',
        fetchedAt: null,
      },
    });

    act(() => {
      root?.render(
        <SidebarProvider>
          <OverviewView />
        </SidebarProvider>,
      );
    });

    expect(container?.textContent).toContain('迭代加载失败');
    expect(container?.textContent).toContain('迭代接口暂时不可用');
    expect(container?.textContent).not.toContain('示例迭代');
    expect(container?.textContent).not.toContain('Benz-20261016');
  });

  it('在总览下拉菜单中切换迭代时，就地更新当前迭代数据且保持 view 为 overview，不发生跨页跳转', () => {
    act(() => {
      root?.render(
        <SidebarProvider>
          <OverviewView />
        </SidebarProvider>,
      );
    });

    // 找到迭代选择下拉触发器
    const triggerBtn = Array.from(container?.querySelectorAll('button') ?? []).find(
      (btn) => btn.textContent?.includes('Sprint-20261029'),
    );
    expect(triggerBtn).toBeDefined();

    act(() => {
      triggerBtn?.click();
    });

    const items = document.querySelectorAll('[data-slot="menu-item"], [role="menuitem"]');
    const targetItem = Array.from(items).find((el) => el.textContent?.includes('Sprint-20261113')) as HTMLElement | undefined;
    expect(targetItem).toBeDefined();

    act(() => {
      targetItem?.click();
    });

    // 保持在 overview 视图，同时当前迭代切换为 Sprint-20261113
    expect(useUi.getState().view).toBe('overview');
    expect(useUi.getState().iterationKey).toBe('Sprint-20261113');
    expect(container?.textContent).toContain('Sprint-20261113');
  });

  it('当有 Jenkins 构建正在执行时，活跃构建监听带自动滑出浮现', () => {
    useApp.setState({
      repoCiByRepo: {
        101: {
          loading: false,
          snapshot: {
            provider: 'jenkins',
            name: 'frontend-job',
            status: 'RUNNING',
            runs: [{ runId: '100', status: 'RUNNING', startTime: Date.now() - 30000 }],
          },
        },
      },
    });

    act(() => {
      root?.render(
        <SidebarProvider>
          <OverviewView />
        </SidebarProvider>,
      );
    });

    expect(container?.textContent).toContain('活跃构建中');
    expect(container?.textContent).toContain('Jenkins');
    expect(container?.textContent).toContain('#100');
    expect(container?.textContent).toContain('查看日志');
  });

  it('点击进入迭代工作台按钮时，正确切换视图至 iteration', () => {
    act(() => {
      root?.render(
        <SidebarProvider>
          <OverviewView />
        </SidebarProvider>,
      );
    });

    const enterBtn = Array.from(container?.querySelectorAll('button') ?? []).find(
      (btn) => btn.textContent?.includes('进入迭代工作台'),
    );
    expect(enterBtn).toBeDefined();

    act(() => {
      enterBtn?.click();
    });

    expect(useUi.getState().view).toBe('iteration');
    expect(useUi.getState().iterationKey).toBe('Sprint-20261029');
  });
});
