import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetActivityWriterState,
  writeActivityCandidates,
} from '@/hooks/use-attribution-writer';
import * as attributionApi from '@/lib/attribution-api';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { SUMMARY_MARKER } from '@/lib/activity-summary';
import { setWritebackPaused } from '@/lib/writeback-pause';
import type {
  ActivityCandidate,
  ActivityPolicy,
  ChangeEvent,
  ChangePage,
  WorkitemChange,
} from '@/types/attribution';

vi.mock('@/lib/attribution-api', () => ({
  getActivityPolicy: vi.fn(),
  listActivityCandidates: vi.fn(),
  listWorkitemChanges: vi.fn(),
  updateWorkitemComment: vi.fn(),
  markActivity: vi.fn(),
  isTauriRuntime: vi.fn(() => false),
}));

vi.mock('@/lib/api', () => ({
  createWorkitemComment: vi.fn(),
  listWorkitemComments: vi.fn(),
}));

const BASE_POLICY: ActivityPolicy = {
  enabled: true,
  childMode: 'batch',
  parentMode: 'milestone',
  maxPerDay: 5,
};

const NOW = Date.UTC(2026, 10, 13, 2, 0, 0);

function event(overrides: Partial<ChangeEvent> & Pick<ChangeEvent, 'id' | 'kind'>): ChangeEvent {
  return {
    repoId: 7,
    externalId: overrides.id,
    title: '事件',
    occurredAt: NOW,
    source: 'remote',
    pushed: true,
    backfilled: false,
    payload: {},
    ...overrides,
    id: overrides.id,
    kind: overrides.kind,
  };
}

function candidate(
  id: string,
  kind: ChangeEvent['kind'],
  occurredAt: number,
  overrides: Partial<ActivityCandidate> = {},
  eventOverrides: Partial<ChangeEvent> = {},
): ActivityCandidate {
  return {
    eventId: id,
    workitemId: 'wi-1',
    identifier: 'TASK-1',
    relation: 'primary',
    event: event({ id, kind, occurredAt, ...eventOverrides }),
    ...overrides,
  };
}

function timelineOf(candidates: ActivityCandidate[]): ChangePage {
  return {
    items: candidates.map((item) => ({
      ...item.event,
      relation: item.relation,
      confidence: 'explicit',
      identifier: item.identifier,
      workitemId: item.workitemId,
    })) as WorkitemChange[],
  };
}

/** 同时设置候选与时间线，模拟事件已入库。 */
function mockCandidates(candidates: ActivityCandidate[]): void {
  vi.mocked(attributionApi.listActivityCandidates).mockResolvedValue(candidates);
  vi.mocked(attributionApi.listWorkitemChanges).mockImplementation(async (input) =>
    timelineOf(candidates.filter((item) => item.workitemId === input.workitemId)),
  );
}

function setWriteOps(allow: boolean): void {
  useApp.setState({
    toast: null,
    settings: { allowWriteOps: allow } as never,
    // 写回范围按「我」过滤：测试里固定一个已识别用户，避免 fail-closed 短路。
    currentUser: { id: 'user-1', name: '测试用户', email: 'test@example.com' } as never,
  });
}

describe('activity writer（滚动评论）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetActivityWriterState();
    setWritebackPaused(false);
    setWriteOps(true);
    vi.mocked(attributionApi.getActivityPolicy).mockResolvedValue({ ...BASE_POLICY });
    vi.mocked(attributionApi.listActivityCandidates).mockResolvedValue([]);
    vi.mocked(attributionApi.listWorkitemChanges).mockResolvedValue({ items: [] });
    vi.mocked(attributionApi.updateWorkitemComment).mockResolvedValue({});
    vi.mocked(attributionApi.markActivity).mockResolvedValue(true);
    vi.mocked(api.createWorkitemComment).mockResolvedValue({ id: 'comment-1' });
    vi.mocked(api.listWorkitemComments).mockResolvedValue({ result: [] });
  });

  it('本地暂停动态回写时不读取策略与候选，也不发任何请求', async () => {
    setWritebackPaused(true);
    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });
    expect(result.reason).toBe('paused');
    expect(attributionApi.getActivityPolicy).not.toHaveBeenCalled();
    expect(attributionApi.listActivityCandidates).not.toHaveBeenCalled();
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
    expect(attributionApi.updateWorkitemComment).not.toHaveBeenCalled();
  });

  it('allowWriteOps=false 时保持 pending，不请求候选也不发评论', async () => {
    setWriteOps(false);

    const result = await writeActivityCandidates({ now: NOW });

    expect(result.reason).toBe('write-disabled');
    expect(attributionApi.listActivityCandidates).not.toHaveBeenCalled();
    expect(attributionApi.getActivityPolicy).not.toHaveBeenCalled();
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
    expect(attributionApi.markActivity).not.toHaveBeenCalled();
  });

  it('未识别当前用户时 fail-closed：不读策略、不拉候选、不发评论', async () => {
    useApp.setState({ currentUser: null });

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.reason).toBe('no-viewer');
    expect(attributionApi.getActivityPolicy).not.toHaveBeenCalled();
    expect(attributionApi.listActivityCandidates).not.toHaveBeenCalled();
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
    expect(attributionApi.updateWorkitemComment).not.toHaveBeenCalled();
  });

  it('同一工作项的多个提交只创建一条滚动评论，并逐事件记账', async () => {
    const candidates = [
      candidate('commit:7:a', 'commit', NOW, {}, {
        branch: 'feature/req-1',
        payload: { sha: '7a3f8b1c9d', filesChanged: 2, additions: 10, deletions: 1 },
      }),
      candidate('commit:7:b', 'commit', NOW + 60_000, {}, {
        branch: 'feature/req-1',
        payload: { sha: '9c2d4e6f8a', filesChanged: 1, additions: 5, deletions: 2 },
      }),
    ];
    mockCandidates(candidates);

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.posted).toBe(1);
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    const [workitemId, html, format] = vi.mocked(api.createWorkitemComment).mock.calls[0]!;
    expect(workitemId).toBe('wi-1');
    expect(format).toBe('RICHTEXT');
    expect(html).toContain('交付进展');
    expect(html).toContain('7a3f8b1');
    expect(html).toContain('9c2d4e6');
    expect(html).toContain(SUMMARY_MARKER);
    expect(attributionApi.updateWorkitemComment).not.toHaveBeenCalled();
    expect(attributionApi.markActivity).toHaveBeenCalledTimes(2);
    expect(attributionApi.markActivity).toHaveBeenNthCalledWith(1, {
      eventId: 'commit:7:a',
      workitemId: 'wi-1',
      status: 'posted',
      commentId: 'comment-1',
    });
    expect(attributionApi.markActivity).toHaveBeenNthCalledWith(2, {
      eventId: 'commit:7:b',
      workitemId: 'wi-1',
      status: 'posted',
      commentId: 'comment-1',
    });

    // 同一批候选再次出现：本地幂等集合直接跳过，不重复创建/更新评论。
    const again = await writeActivityCandidates({ now: NOW + 1000, allowWriteOps: true });
    expect(again.reason).toBe('no-candidates');
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    expect(attributionApi.updateWorkitemComment).not.toHaveBeenCalled();
  });

  it('已有滚动评论时原地更新，不新增评论', async () => {
    mockCandidates([
      candidate('mr:7:12', 'mr', NOW, {}, {
        payload: { localId: 12, state: 'merged', sourceBranch: 'feature/a', targetBranch: 'master' },
      }),
    ]);
    vi.mocked(api.listWorkitemComments).mockResolvedValue({
      result: [{ id: 'comment-9', content: `旧内容 ${SUMMARY_MARKER}` }],
    });

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.posted).toBe(1);
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
    expect(attributionApi.updateWorkitemComment).toHaveBeenCalledTimes(1);
    const input = vi.mocked(attributionApi.updateWorkitemComment).mock.calls[0]![0];
    expect(input.workitemId).toBe('wi-1');
    expect(input.commentId).toBe('comment-9');
    expect(input.content).toContain('交付进展');
    expect(attributionApi.markActivity).toHaveBeenCalledWith({
      eventId: 'mr:7:12',
      workitemId: 'wi-1',
      status: 'posted',
      commentId: 'comment-9',
    });
  });

  it('更新评论失败时标记 failed 并退避，不降级为新增评论', async () => {
    mockCandidates([
      candidate('mr:7:12', 'mr', NOW, {}, {
        payload: { localId: 12, state: 'merged', sourceBranch: 'feature/a', targetBranch: 'master' },
      }),
    ]);
    vi.mocked(api.listWorkitemComments).mockResolvedValue({
      result: [{ id: 'comment-9', content: SUMMARY_MARKER }],
    });
    vi.mocked(attributionApi.updateWorkitemComment).mockRejectedValueOnce(new Error('更新接口失败'));

    const first = await writeActivityCandidates({ now: NOW, allowWriteOps: true });
    expect(first.failed).toBe(1);
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
    expect(attributionApi.markActivity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('更新接口失败') }),
    );
    expect(useApp.getState().toast?.kind).toBe('fail');

    const second = await writeActivityCandidates({ now: NOW + 1_000, allowWriteOps: true });
    expect(second.pending).toBe(1);
    expect(attributionApi.updateWorkitemComment).toHaveBeenCalledTimes(1);
  });

  it('PAT 不支持编辑评论时降级为新增摘要，不阻塞回写', async () => {
    mockCandidates([
      candidate('mr:7:12', 'mr', NOW, {}, {
        payload: { localId: 12, state: 'merged', sourceBranch: 'feature/a', targetBranch: 'master' },
      }),
    ]);
    vi.mocked(api.listWorkitemComments).mockResolvedValue({
      result: [{ id: 'comment-9', content: SUMMARY_MARKER }],
    });
    vi.mocked(attributionApi.updateWorkitemComment).mockRejectedValueOnce(
      new Error('YUNXIAO 404 Not Found: NotFound: Not Found'),
    );

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.posted).toBe(1);
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    expect(attributionApi.markActivity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'posted', commentId: 'comment-1' }),
    );
  });

  it('非代码事件（如工作项状态流转）不参与回写', async () => {
    const statusCandidate = candidate('status:1', 'commit', NOW);
    statusCandidate.event.kind = 'status' as never;
    mockCandidates([statusCandidate]);

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.reason).toBe('no-candidates');
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
    expect(attributionApi.updateWorkitemComment).not.toHaveBeenCalled();
  });

  it('没有新的变更候选时不产生任何动态请求', async () => {
    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });
    expect(result.reason).toBe('no-candidates');
    expect(api.listWorkitemComments).not.toHaveBeenCalled();
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
    expect(attributionApi.updateWorkitemComment).not.toHaveBeenCalled();
  });

  it('超过每日上限时同一工作项当天不再更新评论', async () => {
    vi.mocked(attributionApi.getActivityPolicy).mockResolvedValue({
      ...BASE_POLICY,
      maxPerDay: 1,
    });
    const first = candidate('mr:7:1', 'mr', NOW, {}, {
      payload: { localId: 1, state: 'merged', sourceBranch: 'a', targetBranch: 'master' },
    });
    mockCandidates([first]);
    const firstRun = await writeActivityCandidates({ now: NOW, allowWriteOps: true });
    expect(firstRun.posted).toBe(1);

    const second = candidate('mr:7:2', 'mr', NOW + 60_000, {}, {
      payload: { localId: 2, state: 'merged', sourceBranch: 'b', targetBranch: 'master' },
    });
    mockCandidates([first, second]);
    const secondRun = await writeActivityCandidates({ now: NOW + 60_000, allowWriteOps: true });

    expect(secondRun.posted).toBe(0);
    expect(secondRun.skipped).toBe(1);
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    expect(attributionApi.markActivity).toHaveBeenCalledWith({
      eventId: 'mr:7:2',
      workitemId: 'wi-1',
      status: 'skipped',
      error: '超出每日回写上限',
    });
  });

  it('daily 模式只把已翻篇的日期渲染进滚动评论', async () => {
    vi.mocked(attributionApi.getActivityPolicy).mockResolvedValue({
      ...BASE_POLICY,
      parentMode: 'daily',
    });
    const yesterday = NOW - 24 * 60 * 60 * 1000;
    const candidates = [
      candidate('commit:7:old', 'commit', yesterday, { relation: 'rollup' }, {
        branch: 'feature/req-1',
        payload: { sha: 'oldcommitsha', filesChanged: 1, additions: 2, deletions: 0 },
      }),
      candidate('commit:7:today', 'commit', NOW, { relation: 'rollup' }, {
        branch: 'feature/req-1',
        payload: { sha: 'todaycommitsha', filesChanged: 1, additions: 1, deletions: 0 },
      }),
    ];
    mockCandidates(candidates);

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.posted).toBe(1);
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    const html = vi.mocked(api.createWorkitemComment).mock.calls[0]![1];
    expect(html).toContain('交付进展');
    expect(html).toContain('oldcomm');
    expect(html).not.toContain('todaycomm');
  });

  it('策略关闭 / 子项 off 时不回写', async () => {
    vi.mocked(attributionApi.getActivityPolicy).mockResolvedValue({
      ...BASE_POLICY,
      enabled: false,
    });
    const disabled = await writeActivityCandidates({ now: NOW, allowWriteOps: true });
    expect(disabled.reason).toBe('policy-disabled');
    expect(attributionApi.listActivityCandidates).not.toHaveBeenCalled();

    vi.mocked(attributionApi.getActivityPolicy).mockResolvedValue({
      ...BASE_POLICY,
      childMode: 'off',
    });
    mockCandidates([candidate('commit:7:c', 'commit', NOW)]);
    const off = await writeActivityCandidates({ now: NOW, allowWriteOps: true });
    expect(off.reason).toBe('no-candidates');
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
  });

  it('MR / 构建非终态不回写（等待状态收敛）', async () => {
    mockCandidates([
      candidate('mr:7:8', 'mr', NOW, {}, {
        payload: { localId: 8, state: 'open', sourceBranch: 'a', targetBranch: 'master' },
      }),
      candidate('build:flow:7:9', 'build', NOW + 1_000, {}, {
        payload: { runId: '9', provider: 'flow', status: 'running' },
      }),
    ]);

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.reason).toBe('no-candidates');
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
  });

  it('需求 milestone 模式只把里程碑事件写进滚动评论', async () => {
    mockCandidates([
      candidate('commit:7:c', 'commit', NOW, { relation: 'rollup' }),
      // 需求级 primary commit 也应按 parentMode 处理，不能走子项批量回写
      candidate('commit:7:req', 'commit', NOW + 500, { identifier: 'REQ-1' }),
      candidate('mr:7:3', 'mr', NOW + 1_000, { relation: 'rollup' }, {
        payload: { localId: 3, state: 'merged', sourceBranch: 'a', targetBranch: 'master' },
      }),
    ]);

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.posted).toBe(1);
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    const html = vi.mocked(api.createWorkitemComment).mock.calls[0]![1];
    expect(html).toContain('交付进展');
    expect(html).toContain('!3');
    expect(html).toContain('已合入');
    expect(html).not.toContain('commit:7:c');
  });
});