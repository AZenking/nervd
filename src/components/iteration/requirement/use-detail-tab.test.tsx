// 需求详情页签状态 hook 单测：
// - 全屏工作台：挂载时从 store detailTab 初始化（分栏 → 全屏继承），之后不被 store 强控（子项钻取重置不回拽），
//   用户切换时写回 store；
// - 嵌入态（Peek 抽屉）：默认「交付进展」，受控页签优先，变更回调同步给抽屉 + store。
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUi, type DetailTabKey } from '@/store/ui';
import { useDetailTabState, type DetailTabStateOptions } from './use-detail-tab';

let latest: { active: DetailTabKey; set: (tab: DetailTabKey) => void } | null = null;

function Probe(props: DetailTabStateOptions) {
  const [active, set] = useDetailTabState(props);
  latest = { active, set };
  return <div data-testid="active-tab">{active}</div>;
}

describe('useDetailTabState 需求详情页签', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    useUi.setState({ detailTab: 'repos' });
    latest = null;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
  });

  const render = async (props: DetailTabStateOptions = {}) => {
    await act(async () => {
      root.render(<Probe {...props} />);
    });
  };

  it('全屏工作台挂载时继承 store 页签，store 之后变化不强制跟随', async () => {
    useUi.setState({ detailTab: 'activity' });
    await render();

    expect(latest?.active).toBe('activity');
    // 子项钻取触发 openWorkitem 会把 store 重置为默认；内部页签必须保留当前值
    useUi.setState({ detailTab: 'repos' });
    await act(async () => { root.render(<Probe />); });
    expect(latest?.active).toBe('activity');
  });

  it('全屏工作台切换页签时写回 store', async () => {
    useUi.setState({ detailTab: 'repos' });
    await render();
    await act(async () => { latest?.set('activity'); });

    expect(latest?.active).toBe('activity');
    expect(useUi.getState().detailTab).toBe('activity');
    expect(host.textContent).toContain('activity');
  });

  it('嵌入态默认「交付进展」且受控页签优先', async () => {
    useUi.setState({ detailTab: 'activity' });
    const onDetailTabChange = vi.fn();
    await render({ embedded: true, detailTab: 'repos', onDetailTabChange });

    // 受控态：忽略 store 的旧值，使用抽屉传入的默认页签
    expect(latest?.active).toBe('repos');

    await act(async () => { latest?.set('children'); });
    expect(onDetailTabChange).toHaveBeenCalledWith('children');
    expect(useUi.getState().detailTab).toBe('children');
  });

  it('嵌入态无受控页签时不继承 store，回落到默认「交付进展」', async () => {
    useUi.setState({ detailTab: 'activity' });
    await render({ embedded: true });
    expect(latest?.active).toBe('repos');
  });
});