import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAttribution } from './attribution';
import { useApp } from './app';
import * as attributionApi from '@/lib/attribution-api';
import type { WorkitemChange } from '@/types/attribution';

vi.mock('@/lib/attribution-api', () => ({
  syncAttribution: vi.fn(),
  getAttributionStatus: vi.fn(),
  listWorkitemChanges: vi.fn(),
  listUnattributedChanges: vi.fn(),
  assignChangeWorkitem: vi.fn(),
  resolveWorkitemIdentifiers: vi.fn(),
  listActivityCandidates: vi.fn(),
  markActivity: vi.fn(),
  getActivityPolicy: vi.fn(),
  saveActivityPolicy: vi.fn(),
  listLocalRepoBindings: vi.fn(),
  saveLocalRepoBinding: vi.fn(),
  deleteLocalRepoBinding: vi.fn(),
  pickRepoDirectory: vi.fn(),
  inspectLocalRepo: vi.fn(),
  syncLocalRepo: vi.fn(),
  getActiveWorkitem: vi.fn(),
  setActiveWorkitem: vi.fn(),
  installCommitMsgHook: vi.fn(),
  uninstallCommitMsgHook: vi.fn(),
  getBranchTrackTopology: vi.fn(),
  saveBranchTrackTopology: vi.fn(),
  isTauriRuntime: vi.fn(() => true),
}));

function change(
  id: string,
  occurredAt: number,
  overrides: Partial<WorkitemChange> = {},
): WorkitemChange {
  return {
    id,
    repoId: 1,
    repoName: 'trade-service',
    kind: 'commit',
    externalId: id.replace('commit:1:', ''),
    branch: 'feature/req-1',
    title: `提交 ${id}`,
    occurredAt,
    source: 'remote',
    pushed: true,
    backfilled: false,
    payload: { sha: id.replace('commit:1:', '') },
    relation: 'primary',
    confidence: 'explicit',
    identifier: 'REQ-1',
    workitemId: 'wi-1',
    ...overrides,
  };
}

const initialState = {
  timelineByWorkitem: {},
  loadingTimeline: {},
  timelineError: {},
  timelineNextBefore: {},
  timelineIncludeRollup: {},
  unassigned: [],
  unassignedLoading: false,
  status: null,
  policy: null,
  bindings: [],
  activeWorkitems: {},
  syncing: false,
};

describe('useAttribution store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(attributionApi.listUnattributedChanges).mockResolvedValue({
      items: [],
      nextBefore: undefined,
    });
    useAttribution.setState(initialState);
    useApp.setState({ toast: null, settings: null });
  });

  it('loadTimeline 合并去重并按发生时间倒序', async () => {
    vi.mocked(attributionApi.listWorkitemChanges).mockResolvedValueOnce({
      items: [change('commit:1:a', 200), change('commit:1:b', 100)],
      nextBefore: 100,
    });

    const first = await useAttribution.getState().loadTimeline('wi-1');
    expect(first?.map((item) => item.id)).toEqual(['commit:1:a', 'commit:1:b']);
    expect(attributionApi.listWorkitemChanges).toHaveBeenCalledWith({
      workitemId: 'wi-1',
      limit: 50,
      includeRollup: true,
    });
    expect(useAttribution.getState().timelineNextBefore['wi-1']).toBe(100);

    // 第二页包含重复 eventId（标题已更新）与新事件
    vi.mocked(attributionApi.listWorkitemChanges).mockResolvedValueOnce({
      items: [
        change('commit:1:b', 100, { title: '更新后的标题' }),
        change('commit:1:c', 50),
      ],
      nextBefore: undefined,
    });

    const merged = await useAttribution.getState().loadMore('wi-1');
    expect(merged).toHaveLength(3);
    expect(merged?.map((item) => item.id)).toEqual([
      'commit:1:a',
      'commit:1:b',
      'commit:1:c',
    ]);
    expect(merged?.find((item) => item.id === 'commit:1:b')?.title).toBe('更新后的标题');
    // 同一 eventId 只保留一条
    expect(merged?.filter((item) => item.id === 'commit:1:b')).toHaveLength(1);
    // loadMore 使用 before 游标
    expect(attributionApi.listWorkitemChanges).toHaveBeenLastCalledWith({
      workitemId: 'wi-1',
      limit: 50,
      before: 100,
      includeRollup: true,
    });

    // 游标为 null 后不再请求
    const third = await useAttribution.getState().loadMore('wi-1');
    expect(third).toHaveLength(3);
    expect(attributionApi.listWorkitemChanges).toHaveBeenCalledTimes(2);
  });

  it('时间线加载失败写入中文错误并 toast，不吞错', async () => {
    vi.mocked(attributionApi.listWorkitemChanges).mockRejectedValueOnce(new Error('socket hang up'));

    const result = await useAttribution.getState().loadTimeline('wi-1');

    expect(result).toBeNull();
    const state = useAttribution.getState();
    expect(state.loadingTimeline['wi-1']).toBe(false);
    expect(state.timelineError['wi-1']).toContain('变更时间线加载失败');
    expect(state.timelineError['wi-1']).toContain('socket hang up');
    expect(useApp.getState().toast).toEqual({
      kind: 'fail',
      text: expect.stringContaining('变更时间线加载失败'),
    });
  });

  it('待归属加载失败给出中文提示', async () => {
    vi.mocked(attributionApi.listUnattributedChanges).mockRejectedValueOnce(
      new Error('NOT_IMPLEMENTED: list_unattributed_changes'),
    );

    const result = await useAttribution.getState().loadUnassigned();

    expect(result).toBeNull();
    expect(useAttribution.getState().unassignedLoading).toBe(false);
    expect(useApp.getState().toast?.text).toContain('待归属变更加载失败');
    expect(useApp.getState().toast?.text).toContain('尚未就绪');
  });

  it('assign 成功后从待归属移除并把时间线标记为 manual', async () => {
    const item = change('commit:1:a', 200);
    useAttribution.setState({
      timelineByWorkitem: { 'wi-1': [item] },
      unassigned: [{ ...item, workitemId: undefined }],
    });
    vi.mocked(attributionApi.assignChangeWorkitem).mockResolvedValueOnce(true);

    const ok = await useAttribution.getState().assign({
      eventId: 'commit:1:a',
      workitemId: 'wi-2',
      relation: 'primary',
    });

    expect(ok).toBe(true);
    expect(attributionApi.assignChangeWorkitem).toHaveBeenCalledWith({
      eventId: 'commit:1:a',
      workitemId: 'wi-2',
      relation: 'primary',
    });
    const state = useAttribution.getState();
    expect(state.unassigned).toHaveLength(0);
    expect(state.timelineByWorkitem['wi-1'][0]?.workitemId).toBe('wi-2');
    expect(state.timelineByWorkitem['wi-1'][0]?.confidence).toBe('manual');
    expect(useApp.getState().toast?.kind).toBe('ok');
  });

  it('syncNow 更新 syncing 与最后同步时间', async () => {
    vi.mocked(attributionApi.syncAttribution).mockResolvedValueOnce({
      startedAt: 1,
      finishedAt: 2,
      repos: [
        { repoId: 1, ok: true, branches: 1, commits: 3, mergeRequests: 1 },
        { repoId: 2, ok: false, branches: 0, commits: 0, mergeRequests: 0, error: 'auth' },
      ],
    });
    useAttribution.setState({ syncing: false, status: null });

    const report = await useAttribution.getState().syncNow();

    expect(report?.repos).toHaveLength(2);
    const state = useAttribution.getState();
    expect(state.syncing).toBe(false);
    expect(state.status?.lastSyncAt).toBe(2);
    expect(useApp.getState().toast?.kind).toBe('ok');
    expect(useApp.getState().toast?.text).toContain('变更同步完成');
  });
});