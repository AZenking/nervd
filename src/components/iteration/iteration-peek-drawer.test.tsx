// IterationView Peek 抽屉交互测试：点击工作项行 → 详情以侧边抽屉就地滑出，列表现场不卸载；
// 抽屉开启时 j/k 连续检视仍联动切换（仅抽屉为唯一可见浮层时放行）。
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { IterationView } from './IterationView';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';
import { invoke } from '@tauri-apps/api/core';

// @ts-expect-error test act environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  }
  if (typeof Element.prototype.getAnimations === 'undefined') {
    Element.prototype.getAnimations = () => [];
  }
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

// Mock tauri API：详情/评论/子工作项加载给出最小可用形状，其余命令返回空对象
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === 'get_workitem') {
      return Promise.resolve({
        workitemId: 'item-1',
        identifier: 'REQ-101',
        subject: '支持需求链路一键回溯',
        category: 'Req',
        status: { id: 's-1', name: '开发中' },
      });
    }
    if (cmd === 'list_workitem_comments') return Promise.resolve([]);
    if (cmd === 'list_workitem_children') return Promise.resolve({ items: [] });
    return Promise.resolve({});
  }),
}));

describe('IterationView Peek 抽屉详情', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    useUi.setState({
      view: 'iteration',
      iterationKey: 'Sprint-1',
      listContext: {
        pageIndex: 1,
        cursorWorkitemId: null,
        collapsedStatuses: [],
        selectedWorkitemIds: [],
        splitWorkitemId: null,
        splitParentWorkitemId: null,
        viewTab: 'workitems',
      },
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
      selectedId: null,
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  const renderView = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        // data-workspace-content 模拟 Shell 工作区根：页面常驻集合容器（listbox）不算浮层
        <div data-workspace-content="">
          <TooltipProvider>
            <SidebarProvider defaultOpen={true}>
              <IterationView />
            </SidebarProvider>
          </TooltipProvider>
        </div>
      );
    });
  };

  const flush = async (ms = 60) => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  };

  it('点击工作项行以 Peek 抽屉滑出详情，列表保持挂载', async () => {
    await renderView();

    const row = container!.querySelector('[data-testid="workitem-row"]') as HTMLElement | null;
    expect(row).toBeTruthy();

    await act(async () => {
      row!.click();
    });
    // 行点击经 140ms 预览延迟后再开抽屉（保留原生双击语义）
    await flush(240);

    const drawer = document.querySelector('[data-workspace-peek-drawer][role="dialog"]') as HTMLElement | null;
    expect(drawer).not.toBeNull();

    // 打开动作只 select 一次：抽屉 effect 幂等跳过，避免双发详情 + 评论 + 子项请求
    const detailCalls = vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === 'get_workitem');
    expect(detailCalls).toHaveLength(1);

    // 列表现场不卸载：抽屉开启后工作项行仍在文档中
    const rowsAfter = document.querySelectorAll('[data-testid="workitem-row"]');
    expect(rowsAfter.length).toBeGreaterThanOrEqual(2);

    // 抽屉是当前唯一可见浮层（j/k 放行判定依赖）
    // 抽屉是当前唯一「浮层」（页面常驻 listbox 经工作区根过滤，不计入）
    const overlays = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-base-ui-popover-popup]')]
      .filter((el) => !(el as HTMLElement).hidden
        && el.getAttribute('aria-hidden') !== 'true'
        && !(el as HTMLElement).hasAttribute('data-closed')
        && !(container && container.contains(el)));
    expect(overlays.length).toBe(1);
    expect(overlays[0].hasAttribute('data-workspace-peek-drawer')).toBe(true);
  });

  it('抽屉开启时按 j 连续检视：光标推进并联动切换抽屉详情', async () => {
    await renderView();

    const row = container!.querySelector('[data-testid="workitem-row"]') as HTMLElement | null;
    expect(row).toBeTruthy();

    await act(async () => {
      row!.click();
    });
    await flush(240);

    expect(useApp.getState().selectedId).toBe('item-1');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    });
    // 联动 select 有 150ms 防抖：等防抖窗口结束再断言
    await flush(220);

    // 光标推进 → 联动 select 下一个工作项，抽屉不关闭
    expect(useApp.getState().selectedId).toBe('item-2');
    expect(document.querySelector('[data-workspace-peek-drawer]')).not.toBeNull();
  });
});
