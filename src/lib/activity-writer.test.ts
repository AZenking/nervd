import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetActivityWriterState,
  writeActivityCandidates,
} from '@/hooks/use-attribution-writer';
import * as attributionApi from '@/lib/attribution-api';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import type {
  ActivityCandidate,
  ActivityPolicy,
  ChangeEvent,
} from '@/types/attribution';

vi.mock('@/lib/attribution-api', () => ({
  getActivityPolicy: vi.fn(),
  listActivityCandidates: vi.fn(),
  markActivity: vi.fn(),
  isTauriRuntime: vi.fn(() => false),
}));

vi.mock('@/lib/api', () => ({
  createWorkitemComment: vi.fn(),
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

function setWriteOps(allow: boolean): void {
  useApp.setState({
    toast: null,
    settings: { allowWriteOps: allow } as never,
  });
}

describe('activity writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetActivityWriterState();
    setWriteOps(true);
    vi.mocked(attributionApi.getActivityPolicy).mockResolvedValue({ ...BASE_POLICY });
    vi.mocked(attributionApi.listActivityCandidates).mockResolvedValue([]);
    vi.mocked(attributionApi.markActivity).mockResolvedValue(true);
    vi.mocked(api.createWorkitemComment).mockResolvedValue({ id: 'comment-1' });
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

  it('commit 批次聚合为一条评论并逐事件幂等记账', async () => {
    vi.mocked(attributionApi.listActivityCandidates).mockResolvedValue([
      candidate('commit:7:a', 'commit', NOW, {}, {
        branch: 'feature/req-1',
        payload: { sha: '7a3f8b1c9d', filesChanged: 2, additions: 10, deletions: 1 },
      }),
      candidate('commit:7:b', 'commit', NOW + 60_000, {}, {
        branch: 'feature/req-1',
        payload: { sha: '9c2d4e6f8a', filesChanged: 1, additions: 5, deletions: 2 },
      }),
    ]);

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.posted).toBe(1);
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    const [workitemId, html, format] = vi.mocked(api.createWorkitemComment).mock.calls[0]!;
    expect(workitemId).toBe('wi-1');
    expect(format).toBe('RICHTEXT');
    expect(html).toContain('<!-- nervd:evt:commit:7:a -->');
    expect(html).toContain('<!-- nervd:evt:commit:7:b -->');
    expect(html).toContain('代码变更');
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

    // 同一批候选再次出现：本地幂等集合直接跳过，不重复评论。
    const again = await writeActivityCandidates({ now: NOW + 1000, allowWriteOps: true });
    expect(again.reason).toBe('no-candidates');
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
  });

  it('评论失败时 mark failed，并按退避窗口暂缓重试', async () => {
    vi.mocked(attributionApi.listActivityCandidates).mockResolvedValue([
      candidate('mr:7:12', 'mr', NOW, {}, {
        payload: { localId: 12, state: 'merged', sourceBranch: 'feature/a', targetBranch: 'master' },
      }),
    ]);
    vi.mocked(api.createWorkitemComment).mockRejectedValueOnce(new Error('评论接口失败'));

    const first = await writeActivityCandidates({ now: NOW, allowWriteOps: true });
    expect(first.failed).toBe(1);
    expect(attributionApi.markActivity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('评论接口失败') }),
    );
    expect(useApp.getState().toast?.kind).toBe('fail');

    const second = await writeActivityCandidates({ now: NOW + 1_000, allowWriteOps: true });
    expect(second.pending).toBe(1);
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
  });

  it('超过每日上限时 mark skipped', async () => {
    vi.mocked(attributionApi.getActivityPolicy).mockResolvedValue({
      ...BASE_POLICY,
      maxPerDay: 1,
    });
    vi.mocked(attributionApi.listActivityCandidates).mockResolvedValue([
      candidate('mr:7:1', 'mr', NOW, {}, {
        payload: { localId: 1, state: 'merged', sourceBranch: 'a', targetBranch: 'master' },
      }),
      candidate('mr:7:2', 'mr', NOW + 1_000, {}, {
        payload: { localId: 2, state: 'merged', sourceBranch: 'b', targetBranch: 'master' },
      }),
    ]);

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.posted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    expect(attributionApi.markActivity).toHaveBeenCalledWith({
      eventId: 'mr:7:2',
      workitemId: 'wi-1',
      status: 'skipped',
      error: '超出每日回写上限',
    });
  });

  it('daily 模式只汇总已翻篇的本地日期，当天事件保持 pending', async () => {
    vi.mocked(attributionApi.getActivityPolicy).mockResolvedValue({
      ...BASE_POLICY,
      parentMode: 'daily',
    });
    const yesterday = NOW - 24 * 60 * 60 * 1000;
    vi.mocked(attributionApi.listActivityCandidates).mockResolvedValue([
      candidate('commit:7:old', 'commit', yesterday, { relation: 'rollup' }, {
        branch: 'feature/req-1',
        payload: { sha: '7a3f8b1c9d', filesChanged: 1, additions: 2, deletions: 0 },
      }),
      candidate('commit:7:today', 'commit', NOW, { relation: 'rollup' }, {
        branch: 'feature/req-1',
        payload: { sha: '9c2d4e6f8a', filesChanged: 1, additions: 1, deletions: 0 },
      }),
    ]);

    const result = await writeActivityCandidates({ now: NOW, allowWriteOps: true });

    expect(result.posted).toBe(1);
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    const html = vi.mocked(api.createWorkitemComment).mock.calls[0]![1];
    expect(html).toContain('需求进展');
    expect(html).toContain('commit:7:old');
    expect(html).not.toContain('commit:7:today');
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
    vi.mocked(attributionApi.listActivityCandidates).mockResolvedValue([
      candidate('commit:7:c', 'commit', NOW),
    ]);
    const off = await writeActivityCandidates({ now: NOW, allowWriteOps: true });
    expect(off.reason).toBe('no-candidates');
    expect(api.createWorkitemComment).not.toHaveBeenCalled();
  });

  it('MR / 构建非终态不回写（等待状态收敛）', async () => {
    vi.mocked(attributionApi.listActivityCandidates).mockResolvedValue([
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

  it('需求 milestone 模式忽略普通 commit，只回写 MR 合入 / 构建失败', async () => {
    vi.mocked(attributionApi.listActivityCandidates).mockResolvedValue([
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
    expect(html).toContain('需求进展');
    expect(html).toContain('!3 已合入');
    expect(html).not.toContain('commit:7:c');
  });
});