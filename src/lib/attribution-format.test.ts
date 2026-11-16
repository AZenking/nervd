import { describe, expect, it } from 'vitest';
import {
  batchKeyOf,
  buildBuildMarkdown,
  buildCommitBatchMarkdown,
  buildMrMarkdown,
  buildParentDigest,
  describeAttributionError,
  groupCandidates,
  isTerminalBuildEvent,
  isTerminalMrEvent,
  localDateKey,
  shouldPostParentEvent,
} from './attribution-format';
import type { ActivityCandidate, ChangeEvent } from '@/types/attribution';

function event(overrides: Partial<ChangeEvent> & Pick<ChangeEvent, 'id' | 'kind'>): ChangeEvent {
  return {
    repoId: 7,
    externalId: overrides.id,
    title: '事件',
    occurredAt: 1_700_000_000_000,
    source: 'remote',
    pushed: true,
    backfilled: false,
    payload: {},
    ...overrides,
    id: overrides.id,
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
    identifier: 'REQ-1',
    relation: 'primary',
    event: event({ id, kind, occurredAt, ...eventOverrides }),
    ...overrides,
  };
}

describe('attribution-format', () => {
  it('buildCommitBatchMarkdown 生成提交批次摘要', () => {
    const md = buildCommitBatchMarkdown({
      identifier: 'REQ-101',
      branch: 'feature/req-101',
      commits: [
        { sha: '7a3f8b1c9d', shortSha: '7a3f8b1', message: 'feat: a', filesChanged: 2, additions: 30, deletions: 4 },
        { sha: '9c2d4e6f8a', shortSha: '9c2d4e6', message: 'fix: b', filesChanged: 1, additions: 12, deletions: 3 },
      ],
    });

    expect(md).toBe(
      [
        '[nervd] 代码变更 · REQ-101',
        '分支：feature/req-101',
        '提交：2 个（7a3f8b1、9c2d4e6）',
        '变更：3 个文件，+42 / -7',
      ].join('\n'),
    );
  });

  it('buildMrMarkdown / buildBuildMarkdown 输出单行摘要', () => {
    expect(
      buildMrMarkdown({
        identifier: 'REQ-101',
        localId: 12,
        state: 'merged',
        sourceBranch: 'feature/a',
        targetBranch: 'master',
      }),
    ).toBe('[nervd] 合并请求 · REQ-101 · !12 已合入 feature/a → master');

    expect(
      buildBuildMarkdown({ identifier: 'REQ-101', runId: '142', provider: 'flow', status: 'failed' }),
    ).toBe('[nervd] 构建 · REQ-101 · #142 失败');
  });

  it('batchKeyOf 按 workitem + repo + branch + 10 分钟窗口聚合', () => {
    const base = 1_700_000_000_000;
    const a = batchKeyOf({ workitemId: 'wi-1', event: event({ id: 'a', kind: 'commit', occurredAt: base }) });
    const b = batchKeyOf({
      workitemId: 'wi-1',
      event: event({ id: 'b', kind: 'commit', occurredAt: base + 60_000 }),
    });
    const c = batchKeyOf({
      workitemId: 'wi-1',
      event: event({ id: 'c', kind: 'commit', occurredAt: base + 11 * 60_000 }),
    });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toContain('commit:wi-1:7:');
  });

  it('groupCandidates 聚合 commit 批次、MR/构建即时单条', () => {
    const base = 1_700_000_000_000;
    const groups = groupCandidates([
      candidate('commit:7:a', 'commit', base),
      candidate('commit:7:b', 'commit', base + 60_000),
      candidate('mr:7:12', 'mr', base + 120_000),
      candidate('build:flow:7:88', 'build', base + 180_000),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]?.kind).toBe('commit');
    expect(groups[0]?.eventIds).toEqual(['commit:7:a', 'commit:7:b']);
    expect(groups[1]?.kind).toBe('mr');
    expect(groups[2]?.kind).toBe('build');
  });

  it('daily 模式按本地日期聚合需求 rollup 候选', () => {
    const base = Date.UTC(2026, 10, 13, 2, 0, 0);
    const groups = groupCandidates(
      [
        candidate('commit:7:a', 'commit', base, { relation: 'rollup' }),
        candidate('commit:7:b', 'commit', base + 60_000, { relation: 'rollup' }),
      ],
      { parentDaily: true },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe(`parent:wi-1:${localDateKey(base)}`);
    expect(groups[0]?.eventIds).toHaveLength(2);
  });

  it('shouldPostParentEvent 只放行里程碑与 daily', () => {
    const merged = candidate('mr:7:1', 'mr', 1, {}, {
      payload: { localId: 1, state: 'merged', sourceBranch: 'a', targetBranch: 'master' },
    });
    const open = candidate('mr:7:2', 'mr', 1, {}, {
      payload: { localId: 2, state: 'open', sourceBranch: 'a', targetBranch: 'master' },
    });
    const failed = candidate('build:flow:7:9', 'build', 1, {}, {
      payload: { runId: '9', provider: 'flow', status: 'failed' },
    });
    const commit = candidate('commit:7:c', 'commit', 1);

    expect(shouldPostParentEvent(merged.event, 'milestone')).toBe(true);
    expect(shouldPostParentEvent(open.event, 'milestone')).toBe(false);
    expect(shouldPostParentEvent(failed.event, 'milestone')).toBe(true);
    expect(shouldPostParentEvent(commit.event, 'milestone')).toBe(false);
    expect(shouldPostParentEvent(commit.event, 'daily')).toBe(true);
    expect(shouldPostParentEvent(merged.event, 'off')).toBe(false);
  });

  it('isTerminalMrEvent / isTerminalBuildEvent 只认终态', () => {
    const merged = event({ id: 'mr:7:1', kind: 'mr', payload: { localId: 1, state: 'merged' } });
    const open = event({ id: 'mr:7:2', kind: 'mr', payload: { localId: 2, state: 'open' } });
    const failed = event({ id: 'build:7:1', kind: 'build', payload: { runId: '1', status: 'failed' } });
    const running = event({ id: 'build:7:2', kind: 'build', payload: { runId: '2', status: 'running' } });

    expect(isTerminalMrEvent(merged)).toBe(true);
    expect(isTerminalMrEvent(open)).toBe(false);
    expect(isTerminalBuildEvent(failed)).toBe(true);
    expect(isTerminalBuildEvent(running)).toBe(false);
  });

  it('buildParentDigest 生成简短汇总与详情', () => {
    const base = Date.UTC(2026, 10, 13, 2, 0, 0);
    const md = buildParentDigest({
      identifier: 'REQ-101',
      date: '2026-11-13',
      candidates: [
        candidate('commit:7:a', 'commit', base, { relation: 'rollup' }),
        candidate('commit:7:b', 'commit', base + 1_000, { relation: 'rollup' }),
        candidate('mr:7:12', 'mr', base + 2_000, { relation: 'rollup' }, {
          payload: { localId: 12, state: 'merged', sourceBranch: 'feature/a', targetBranch: 'master' },
        }),
        candidate('build:flow:7:88', 'build', base + 3_000, { relation: 'rollup' }, {
          payload: { runId: '88', provider: 'flow', status: 'failed' },
        }),
      ],
    });

    expect(md).toContain('[nervd] 需求进展 · REQ-101');
    expect(md).toContain('日期：2026-11-13');
    expect(md).toContain('汇总：2 个提交、1 个 MR（合入 1）、1 次构建（失败 1）');
    expect(md).toContain('- MR !12 已合入 feature/a → master');
    expect(md).toContain('- 构建 #88 失败');
  });

  it('describeAttributionError 把未实现命令转成中文指引', () => {
    expect(describeAttributionError('NOT_IMPLEMENTED: list_activity_candidates')).toContain(
      '尚未就绪',
    );
    expect(describeAttributionError('permission denied')).toContain('只读保护模式');
    expect(describeAttributionError(new Error('boom'))).toBe('boom');
  });
});