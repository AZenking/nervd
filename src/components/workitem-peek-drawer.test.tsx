// WorkitemPeekDrawer 页签策略测试：
// - 默认「交付进展」；
// - j/k 连续检视（workitemId 变化）保留当前页签；
// - 抽屉关闭（workitemId=null）重置回默认；
// - 「全屏打开」把当前页签经 onOpenWorkbench / openWorkitem(..., { detailTab }) 带到全屏工作台。
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { WorkitemPeekDrawer } from './workitem-peek-drawer';

vi.mock('@/components/iteration/RequirementDetails', () => ({
  RequirementDetailsSkeleton: () => null,
  RequirementDetails: (props: {
    detailTab?: string;
    onDetailTabChange?: (tab: string) => void;
    onOpenWorkbench?: () => void;
  }) => (
    <div data-testid="requirement-details" data-tab={props.detailTab}>
      <button
        type="button"
        data-testid="switch-to-changes"
        onClick={() => props.onDetailTabChange?.('activity')}
      >
        去活动动态
      </button>
      <button type="button" data-testid="open-workbench" onClick={() => props.onOpenWorkbench?.()}>
        全屏打开
      </button>
    </div>
  ),
}));

describe('WorkitemPeekDrawer 详情页签', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
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
    // 抽屉挂载时会对齐 store 选中项；单测里不触发真实详情请求。
    useApp.setState({ select: (async () => undefined) as any });
    useUi.setState({ detailTab: 'repos' });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
  });

  const renderDrawer = async (
    workitemId: string | null,
    props: Partial<ComponentProps<typeof WorkitemPeekDrawer>> = {},
  ) => {
    await act(async () => {
      root.render(
        <WorkitemPeekDrawer
          workitemId={workitemId}
          onClose={props.onClose ?? vi.fn()}
          onOpenWorkbench={props.onOpenWorkbench}
        />,
      );
    });
  };

  const tabOfDetails = () =>
    document.querySelector('[data-testid="requirement-details"]')?.getAttribute('data-tab');

  it('默认交付进展；workitemId 变化（j/k）保留页签；关闭后重置', async () => {
    const onClose = vi.fn();
    await renderDrawer('wi-1', { onClose });
    expect(tabOfDetails()).toBe('repos');

    const switchBtn = document.querySelector('[data-testid="switch-to-changes"]') as HTMLElement | null;
    expect(switchBtn).not.toBeNull();
    await act(async () => { switchBtn!.click(); });
    expect(tabOfDetails()).toBe('activity');
    expect(useUi.getState().detailTab).toBe('activity');

    // j/k 连续检视：只换工作项，页签保留
    await renderDrawer('wi-2', { onClose });
    expect(tabOfDetails()).toBe('activity');

    // 关闭抽屉：页签重置回「交付进展」（store 同步回默认）
    await renderDrawer(null, { onClose });
    expect(useUi.getState().detailTab).toBe('repos');

    // 重新打开：默认交付进展
    await renderDrawer('wi-3', { onClose });
    expect(tabOfDetails()).toBe('repos');
  });

  it('全屏打开时把当前页签带给回调（分栏 → 全屏携带）', async () => {
    const onClose = vi.fn();
    const onOpenWorkbench = vi.fn();
    await renderDrawer('wi-1', { onClose, onOpenWorkbench });

    const switchBtn = document.querySelector('[data-testid="switch-to-changes"]') as HTMLElement | null;
    await act(async () => { switchBtn!.click(); });

    const fullBtn = document.querySelector('[data-testid="open-workbench"]') as HTMLElement | null;
    expect(fullBtn).not.toBeNull();
    await act(async () => { fullBtn!.click(); });

    expect(onOpenWorkbench).toHaveBeenCalledWith('wi-1', undefined, undefined, 'activity');
  });

  it('无自定义回调时经 openWorkitem(..., { detailTab }) 携带页签', async () => {
    const originalOpenWorkitem = useUi.getState().openWorkitem;
    const openWorkitemSpy = vi.fn();
    useUi.setState({ openWorkitem: openWorkitemSpy });
    try {
      await renderDrawer('wi-1');
      const switchBtn = document.querySelector('[data-testid="switch-to-changes"]') as HTMLElement | null;
      await act(async () => { switchBtn!.click(); });
      const fullBtn = document.querySelector('[data-testid="open-workbench"]') as HTMLElement | null;
      await act(async () => { fullBtn!.click(); });

      expect(openWorkitemSpy).toHaveBeenCalledWith(
        'wi-1',
        { workitemId: 'wi-1', identifier: '', subject: undefined },
        undefined,
        { detailTab: 'activity' },
      );
    } finally {
      useUi.setState({ openWorkitem: originalOpenWorkitem });
    }
  });
});