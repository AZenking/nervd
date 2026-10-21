import { describe, it, expect } from 'vitest';
import { mapMergeRequests } from './workitem-trace';

const PATTERN = '(?:REQ|BUG|TASK)[-_]?(\\d+)';

describe('mapMergeRequests', () => {
  it('当 MR 标题包含工作项编号时能够匹配', () => {
    const raw = [
      {
        localId: 101,
        title: 'REQ-123: 优化登录体验',
        sourceBranch: 'feature/login-fix',
        targetBranch: 'master',
        state: 'UNDER_REVIEW',
      },
    ];

    const result = mapMergeRequests(raw, 'REQ-123', PATTERN);
    expect(result).toHaveLength(1);
    expect(result[0].localId).toBe(101);
    expect(result[0].title).toBe('REQ-123: 优化登录体验');
  });

  it('当 MR 标题未包含编号，但源分支 sourceBranch 包含需求编号时能够正确匹配（线上提交 MR 常见场景）', () => {
    const raw = [
      {
        localId: 202,
        title: 'fix: 修复个人中心头像无法展示',
        sourceBranch: 'feature/REQ-123-avatar',
        targetBranch: 'release/v1.0',
        state: 'OPEN',
      },
    ];

    const result = mapMergeRequests(raw, 'REQ-123', PATTERN);
    expect(result).toHaveLength(1);
    expect(result[0].localId).toBe(202);
    expect(result[0].sourceBranch).toBe('feature/REQ-123-avatar');
  });

  it('当 MR 标题和分支都无格式化前缀，但 description 包含需求编号时能够匹配', () => {
    const raw = [
      {
        localId: 303,
        title: 'feat: 接入新支付网关',
        sourceBranch: 'feature/payment-gw',
        targetBranch: 'master',
        description: '关联需求 REQ-123，解决跨境支付问题',
        state: 'OPEN',
      },
    ];

    const result = mapMergeRequests(raw, 'REQ-123', PATTERN);
    expect(result).toHaveLength(1);
    expect(result[0].localId).toBe(303);
  });

  it('过滤掉与当前需求无关的 MR', () => {
    const raw = [
      {
        localId: 404,
        title: 'REQ-999: 无关的需求合并',
        sourceBranch: 'feature/REQ-999',
        targetBranch: 'master',
        state: 'OPEN',
      },
      {
        localId: 505,
        title: 'chore: 升级依赖',
        sourceBranch: 'chore/deps',
        targetBranch: 'master',
        state: 'OPEN',
      },
    ];

    const result = mapMergeRequests(raw, 'REQ-123', PATTERN);
    expect(result).toHaveLength(0);
  });
});
