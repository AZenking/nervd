import { describe, expect, it } from 'vitest';
import { repoSignalScores } from './repo-signals';
import type { Settings, TraceResult } from '../types';
import type { WorkitemRow } from './api';

const settings = {
  workitemRepos: { 'wi-2': [2], 'wi-3': [] as number[] },
  repoCiBindings: { '3': { provider: 'flow', pipelineId: 1, pipelineName: 'p' } },
} satisfies Pick<Settings, 'workitemRepos' | 'repoCiBindings'>;

const row = (workitemId: string, identifier: string): WorkitemRow => ({
  workitemId,
  identifier,
  subject: identifier,
  status: '待办',
  category: 'Req',
});

const trace = {
  workitemId: 'wi-1',
  branches: [],
  commits: [],
  mergeRequests: [],
  runs: [],
  scannedAt: 0,
  repositories: [
    {
      repoId: 1,
      branches: [{ name: 'feature/REQ-101' }],
      commits: [{ sha: 'a', message: 'fix REQ-101', authorName: '张三' }],
      mergeRequests: [],
    },
    {
      repoId: 2,
      branches: [],
      commits: [{ sha: 'b', message: 'chore', authorName: '张三' }],
      mergeRequests: [],
    },
  ],
} satisfies TraceResult;

describe('repoSignalScores', () => {
  it('追溯命中分支/Commit 记 100，处理人为作者再加 50', () => {
    const scores = repoSignalScores({
      repositories: [{ id: 1 }],
      settings,
      items: [],
      currentWorkitemId: 'wi-1',
      assigneeName: '张三',
      trace,
    });
    expect(scores.get(1)?.score).toBe(150);
    expect(scores.get(1)?.reasons).toHaveLength(2);
  });

  it('共现只统计显式 override 的其他工作项，排除自身', () => {
    const scores = repoSignalScores({
      repositories: [{ id: 2 }, { id: 4 }],
      settings,
      items: [row('wi-1', 'REQ-101'), row('wi-2', 'REQ-102'), row('wi-3', 'REQ-103'), row('wi-4', 'REQ-104')],
      currentWorkitemId: 'wi-1',
      assigneeName: undefined,
      trace: null,
    });
    // wi-2 显式关联 [2]；wi-3 是空 override；wi-4 无 override 行
    expect(scores.get(2)?.score).toBe(10);
    expect(scores.get(2)?.reasons[0]).toContain('REQ-102');
    expect(scores.get(4)).toBeUndefined();
  });

  it('CI 绑定记 5 分', () => {
    const scores = repoSignalScores({
      repositories: [{ id: 3 }],
      settings,
      items: [],
      currentWorkitemId: null,
      assigneeName: undefined,
      trace: null,
    });
    expect(scores.get(3)?.score).toBe(5);
  });

  it('现扫命中：候选仓库分支命中 100，处理人提交再 50', () => {
    const scores = repoSignalScores({
      repositories: [{ id: 9 }, { id: 10 }],
      settings,
      items: [],
      currentWorkitemId: 'wi-1',
      assigneeName: '张三',
      trace: null,
      probes: new Map([
        [9, { branchHit: true, assigneeHit: true }],
        [10, { branchHit: false, assigneeHit: false }],
      ]),
    });
    expect(scores.get(9)?.score).toBe(150);
    expect(scores.get(10)).toBeUndefined();
  });

  it('无任何信号时返回空 Map', () => {
    const scores = repoSignalScores({
      repositories: [{ id: 1 }],
      settings: { workitemRepos: {}, repoCiBindings: {} },
      items: [],
      currentWorkitemId: null,
      assigneeName: undefined,
      trace: null,
    });
    expect(scores.size).toBe(0);
  });
});
