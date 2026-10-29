import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { TooltipProvider } from '@/components/ui/tooltip';
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

  it('完整渲染总览：CycleHeaderBanner、4 格指标带、状态分布图谱与最近更新', () => {
    act(() => {
      root?.render(
        <TooltipProvider>
          <SidebarProvider>
            <OverviewView />
          </SidebarProvider>
        </TooltipProvider>,
      );
    });

    // 1. 统一页头
    expect(container?.textContent).toContain('总览');

    // 2. Linear CycleHeaderBanner
    expect(container?.textContent).toContain('Sprint-20261029');
    expect(container?.textContent).toContain('进入迭代工作台');
    expect(container?.textContent).toContain('1 / 2');
    expect(container?.textContent).toContain('50%');

    // 3. 4 格指标带
    expect(container?.textContent).toContain('正常');
    expect(container?.textContent).toContain('流水线');
    expect(container?.textContent).toContain('通过率 100%');
    expect(container?.textContent).toContain('仓库 CI');

    // 4. 工作项速览与生命周期状态
    expect(container?.textContent).toContain('工作项速览');
    expect(container?.textContent).toContain('最近更新');
    expect(container?.textContent).toContain('REQ-101');
    expect(container?.textContent).toContain('REQ-102');

    // 5. 静态的冗长流水线墙与仓库卡片已被成功去除
    expect(container?.textContent).not.toContain('去绑定 CI');
    expect(container?.textContent).not.toContain('设置中的默认云效仓库');
  });

  it('在总览下拉菜单中切换迭代时，就地更新当前迭代数据且保持 view 为 overview，不发生跨页跳转', () => {
    act(() => {
      root?.render(
        <TooltipProvider>
          <SidebarProvider>
            <OverviewView />
          </SidebarProvider>
        </TooltipProvider>,
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

    const items = document.querySelectorAll('[data-slot="dropdown-menu-item"]');
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
        <TooltipProvider>
          <SidebarProvider>
            <OverviewView />
          </SidebarProvider>
        </TooltipProvider>,
      );
    });

    expect(container?.textContent).toContain('活跃构建中');
    expect(container?.textContent).toContain('Jenkins');
    expect(container?.textContent).toContain('#100');
    expect(container?.textContent).toContain('就地盯盘');
  });

  it('点击进入迭代工作台按钮时，正确切换视图至 iteration', () => {
    act(() => {
      root?.render(
        <TooltipProvider>
          <SidebarProvider>
            <OverviewView />
          </SidebarProvider>
        </TooltipProvider>,
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
