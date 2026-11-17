import { describe, expect, it } from 'vitest';
import {
  SUMMARY_MARKER,
  buildWorkitemSummaryMarkdown,
  findSummaryCommentId,
  summaryContentHash,
} from './activity-summary';
import type { WorkitemChange } from '@/types/attribution';

const NOW = Date.UTC(2026, 10, 13, 2, 0, 0);

function change(overrides: Partial<WorkitemChange> & Pick<WorkitemChange, 'id' | 'kind' | 'occurredAt'>): WorkitemChange {
  return {
    repoId: 7,
    externalId: overrides.id,
    title: '变更',
    source: 'remote',
    pushed: true,
    backfilled: false,
    payload: {},
    relation: 'primary',
    confidence: 'explicit',
    identifier: 'TASK-1',
    workitemId: 'wi-1',
    ...overrides,
  } as WorkitemChange;
}

describe('activity-summary', () => {
  it('在多层评论响应里定位带滚动标记的评论 ID', () => {
    expect(
      findSummaryCommentId({ result: [{ id: 'c-1', content: '<p>普通评论</p>' }, { id: 'c-2', content: `x ${SUMMARY_MARKER}` }] }),
    ).toBe('c-2');
    expect(findSummaryCommentId([{ commentId: 123, content: SUMMARY_MARKER }])).toBe('123');
    expect(findSummaryCommentId({ result: [] })).toBeUndefined();
    expect(findSummaryCommentId(null)).toBeUndefined();
  });

  it('生成滚动摘要：汇总计数 + 最近变更 + 更新时间', () => {
    const markdown = buildWorkitemSummaryMarkdown({
      identifier: 'TASK-1',
      now: NOW,
      changes: [
        change({
          id: 'commit:7:a',
          kind: 'commit',
          occurredAt: NOW - 60_000,
          payload: { sha: '7a3f8b1c9d', message: 'feat: 实现收款', author: '林默' },
        }),
        change({
          id: 'mr:7:12',
          kind: 'mr',
          occurredAt: NOW - 120_000,
          payload: {
            localId: 12,
            state: 'merged',
            sourceBranch: 'feature/a',
            targetBranch: 'master',
            webUrl: 'https://codeup.aliyun.com/demo/repo/change/12',
          },
        }),
      ],
      options: { repoPathById: { 7: 'demo/repo' } },
    });
    expect(markdown).toContain('交付进展 · TASK-1');
    expect(markdown).toContain('汇总：1 个提交 · 1 个 MR');
    expect(markdown).toContain('7a3f8b1');
    expect(markdown).toContain('!12 已合入');
    expect(markdown).toContain('[提交](https://codeup.aliyun.com/demo/repo/commit/7a3f8b1c9d)');
    expect(markdown).toContain('[MR](https://codeup.aliyun.com/demo/repo/change/12)');
    expect(markdown).toContain('11-13 09:59');
  });

  it('没有可见变更时返回空串（调用方跳过、不产生动态）', () => {
    expect(
      buildWorkitemSummaryMarkdown({ identifier: 'TASK-1', now: NOW, changes: [] }),
    ).toBe('');
  });

  it('milestone 模式只渲染里程碑事件；daily 模式过滤未翻篇日期', () => {
    const changes = [
      change({
        id: 'commit:7:old',
        kind: 'commit',
        occurredAt: NOW - 24 * 60 * 60 * 1000,
        payload: { sha: 'oldsha123456', message: 'feat: 昨日提交', author: '林默' },
      }),
      change({ id: 'commit:7:a', kind: 'commit', occurredAt: NOW - 60_000 }),
      change({
        id: 'mr:7:12',
        kind: 'mr',
        occurredAt: NOW - 120_000,
        payload: { localId: 12, state: 'merged', sourceBranch: 'a', targetBranch: 'master' },
      }),
      change({ id: 'commit:7:today', kind: 'commit', occurredAt: NOW + 60_000 }),
    ];
    const milestone = buildWorkitemSummaryMarkdown({
      identifier: 'REQ-1',
      now: NOW,
      changes,
      options: { parentMilestoneOnly: true },
    });
    expect(milestone).toContain('!12 已合入');
    expect(milestone).not.toContain('commit:7:a');

    const daily = buildWorkitemSummaryMarkdown({
      identifier: 'REQ-1',
      now: NOW,
      changes,
      options: { beforeDate: '2026-11-13' },
    });
    expect(daily).not.toContain('today');
    expect(daily).toContain('oldsha1');
  });

  it('内容指纹对相同内容稳定、对不同内容变化', () => {
    expect(summaryContentHash('a')).toBe(summaryContentHash('a'));
    expect(summaryContentHash('a')).not.toBe(summaryContentHash('b'));
  });
});
