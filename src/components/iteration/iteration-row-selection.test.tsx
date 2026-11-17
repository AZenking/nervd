// 行内多选勾选：点击必须「一次一下」稳定生效（勾上 / 取消各一次），且不触发行激活（不开 Peek 抽屉）。
// 回归背景：旧实现把 toggle 挂在 HeroUI Checkbox 的 onCheckedChange 上，而该组件是
// 「label 包裹隐藏 input」的 RAC 复合件；行状态刷新后 label 在 pointerdown 与 pointerup 之间被替换，
// input change 永不触发，表现为「偶尔点不动 / 再次点击无响应」。
// 新实现把交互收敛到行内 role="checkbox" 包裹层（内层 Checkbox 仅做视觉），本用例锁定该行为。
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { IterationView } from './IterationView';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';

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
  Element.prototype.scrollIntoView = vi.fn();
});

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

describe('IterationView 行内多选勾选', () => {
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
        <div data-workspace-content="">
          <TooltipProvider>
            <SidebarProvider defaultOpen={true}>
              <IterationView />
            </SidebarProvider>
          </TooltipProvider>
        </div>,
      );
    });
  };

  const flush = async (ms = 80) => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  };

  const firstRowCheckbox = () =>
    container!.querySelector('[data-testid="row-select-checkbox"]') as HTMLElement;

  const selectedIds = () => useUi.getState().listContext.selectedWorkitemIds ?? [];

  it('一次点击勾选、再次点击取消（不是只生效一次）', async () => {
    await renderView();

    const box = firstRowCheckbox();
    expect(box).toBeTruthy();
    expect(box.getAttribute('role')).toBe('checkbox');
    expect(box.getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      box.click();
    });
    await flush();
    expect(selectedIds()).toEqual(['item-1']);
    expect(firstRowCheckbox().getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      firstRowCheckbox().click();
    });
    await flush();
    expect(selectedIds()).toEqual([]);
    expect(firstRowCheckbox().getAttribute('aria-checked')).toBe('false');
  });

  it('勾选不会触发行激活（不开 Peek 抽屉、不改 selectedId）', async () => {
    await renderView();

    await act(async () => {
      firstRowCheckbox().click();
    });
    await flush(240);

    expect(selectedIds()).toEqual(['item-1']);
    expect(document.querySelector('[data-workspace-peek-drawer]')).toBeNull();
    expect(useApp.getState().selectedId).toBeNull();
  });

  it('键盘 Space / Enter 可切换勾选状态', async () => {
    await renderView();

    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    await act(async () => {
      firstRowCheckbox().dispatchEvent(space);
    });
    await flush();
    expect(selectedIds()).toEqual(['item-1']);

    await act(async () => {
      firstRowCheckbox().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    await flush();
    expect(selectedIds()).toEqual([]);
  });
});