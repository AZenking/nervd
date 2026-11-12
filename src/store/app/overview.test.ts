import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  listWorkitems: vi.fn(),
  listIterations: vi.fn(),
}));

import * as api from '@/lib/api';
import { createAppStore } from '@/store/app';

const settings = (space: string) => ({
  organizationId: 'org-test',
  defaultSpaceIdentifier: space,
} as any);

const row = (id: string, over: Record<string, unknown> = {}) => ({
  workitemId: id,
  identifier: `REQ-${id}`,
  subject: id,
  status: '待办',
  category: 'Req',
  ...over,
});

beforeEach(() => {
  // reset 而非 clear：清掉上一用例遗留的 mockResolvedValueOnce 队列，避免跨用例串数据。
  vi.resetAllMocks();
});

describe('OverviewSlice', () => {
  it('顺序拉取全部分页并按 workitemId 去重', async () => {
    const store = createAppStore();
    store.setState({ settings: settings('space-1') });
    vi.mocked(api.listWorkitems)
      .mockResolvedValueOnce({ items: [row('one'), row('two')], nextToken: 'page-2' } as never)
      .mockResolvedValueOnce({ items: [row('two', { status: '进行中' }), row('three')], nextToken: null } as never);

    await store.getState().loadOverviewCategory('Req');

    const state = store.getState().overviewByCategory.Req;
    expect(api.listWorkitems).toHaveBeenNthCalledWith(1, { category: 'Req', spaceIdentifier: 'space-1' });
    expect(api.listWorkitems).toHaveBeenNthCalledWith(2, {
      category: 'Req',
      spaceIdentifier: 'space-1',
      nextToken: 'page-2',
    });
    expect(state.items.map((item) => item.workitemId)).toEqual(['one', 'two', 'three']);
    expect(state.items[1].status).toBe('进行中');
    expect(state.loadedCount).toBe(3);
    expect(state.complete).toBe(true);
    expect(state.status).toBe('success');
  });

  it('超过最大页数 / 条数时停止拉取并一次写入，标记未加载完整', async () => {
    const store = createAppStore();
    store.setState({ settings: settings('space-1') });
    for (let page = 1; page <= 6; page += 1) {
      vi.mocked(api.listWorkitems).mockResolvedValueOnce({
        items: [row(`p${page}`)],
        nextToken: String(page + 1),
      } as never);
    }

    await store.getState().loadOverviewCategory('Req');

    const state = store.getState().overviewByCategory.Req;
    expect(api.listWorkitems).toHaveBeenCalledTimes(5);
    expect(state.items).toHaveLength(5);
    expect(state.complete).toBe(false);
    expect(state.status).toBe('success');
    expect(state.nextToken).toBe('6');
  });

  it('分页失败时保留已经加载的数据并标记 partial', async () => {
    const store = createAppStore();
    store.setState({ settings: settings('space-1') });
    vi.mocked(api.listWorkitems)
      .mockResolvedValueOnce({ items: [row('one')], nextToken: 'page-2' } as never)
      .mockRejectedValueOnce(new Error('第二页超时'));

    await store.getState().loadOverviewCategory('Req');

    const state = store.getState().overviewByCategory.Req;
    expect(state.items.map((item) => item.workitemId)).toEqual(['one']);
    expect(state.status).toBe('partial');
    expect(state.complete).toBe(false);
    expect(state.error).toContain('第二页超时');
    expect(state.nextToken).toBe('page-2');
  });

  it('项目空间变化后旧请求结果不能覆盖新空间数据', async () => {
    const store = createAppStore();
    store.setState({ settings: settings('space-1') });
    let resolveOld: (page: unknown) => void = () => {};
    const oldRequest = new Promise((resolve) => {
      resolveOld = resolve;
    });
    vi.mocked(api.listWorkitems).mockImplementation(async ({ spaceIdentifier }) => {
      if (spaceIdentifier === 'space-1') return oldRequest as never;
      return { items: [row('new-space')], nextToken: null } as never;
    });

    const oldLoad = store.getState().loadOverviewCategory('Req');
    store.setState({ settings: settings('space-2') });
    await store.getState().loadOverviewCategory('Req', { refresh: true });
    resolveOld({ items: [row('old-space')], nextToken: null });
    await oldLoad;

    expect(store.getState().overviewByCategory.Req.items.map((item) => item.workitemId)).toEqual(['new-space']);
  });

  it('迭代接口失败时进入 error 且不写入示例迭代', async () => {
    const store = createAppStore();
    store.setState({ settings: settings('space-1') });
    vi.mocked(api.listIterations).mockRejectedValue(new Error('迭代接口不可用'));

    await store.getState().loadOverviewIterations();

    expect(store.getState().overviewIterations.status).toBe('error');
    expect(store.getState().overviewIterations.items).toEqual([]);
    expect(store.getState().overviewIterations.error).toContain('迭代接口不可用');
  });
});
