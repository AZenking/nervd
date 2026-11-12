// L2 store 单测：追溯结果短缓存 —— 同一工作项 + 同 settings 版本下避免重复全量扇出。
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  getRepoCiSnapshot: vi.fn(),
  listWorkitems: vi.fn(),
  listIterations: vi.fn(),
}));
vi.mock('@/store/workitem-trace', () => ({
  loadWorkitemTrace: vi.fn(),
}));

import { loadWorkitemTrace } from '@/store/workitem-trace';
import { createAppStore } from '@/store/app';

const settings = () => ({
  organizationId: 'org-test',
  defaultSpaceIdentifier: 'space-1',
  linkPattern: '',
  watchedRepos: [],
  workitemRepos: {},
  hasPat: true,
} as never);

const traceResult = {
  workitemId: 'wi-task',
  repositories: [],
  branches: [],
  commits: [],
  mergeRequests: [],
  runs: [],
  scannedAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadWorkitemTrace).mockResolvedValue(traceResult as never);
});

describe('TraceSlice caching', () => {
  const createStore = () => {
    const store = createAppStore();
    store.setState({
      settings: settings(),
      selectedId: 'wi-task',
      category: 'Task',
      items: [{
        workitemId: 'wi-task',
        identifier: 'TASK-1',
        subject: '缓存测试',
        status: '待办',
        category: 'Task',
        assignedTo: '—',
      }] as never,
      children: [],
      detail: { workitem: { workitemId: 'wi-task', identifier: 'TASK-1', category: 'Task' } },
    });
    return store;
  };

  it('同一工作项重复加载只请求一次，settings 版本变化或 force 才重新加载', async () => {
    const store = createStore();

    await store.getState().loadTrace();
    await store.getState().loadTrace();
    expect(loadWorkitemTrace).toHaveBeenCalledTimes(1);
    expect(store.getState().trace).toEqual(traceResult);

    // settings 引用变化 = 追溯上下文版本变化 → 允许重新扇出
    store.setState({ settings: settings() });
    await store.getState().loadTrace();
    expect(loadWorkitemTrace).toHaveBeenCalledTimes(2);

    // 手动刷新强制绕过缓存
    await store.getState().loadTrace({ force: true });
    expect(loadWorkitemTrace).toHaveBeenCalledTimes(3);
  });
});