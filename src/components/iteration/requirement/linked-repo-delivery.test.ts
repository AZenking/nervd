import { describe, expect, it, vi } from 'vitest';
import {
  boundJenkinsRunBranch,
  deriveLinkedRepoDelivery,
  ensureIterationBaseline,
  latestCiRun,
} from './linked-repo-delivery';

const baseFacts = {
  iterationId: 'iteration-1',
  placeholderIteration: false,
  hasValidRule: true,
  traceState: 'ready' as const,
  baselineState: 'exists' as const,
  developerBranchState: 'exists' as const,
  hasMatchingMergedMr: false,
  divergence: { status: 'ready' as const, developmentOnly: 0, baselineOnly: 0 },
};

describe('deriveLinkedRepoDelivery', () => {
  it('does not report merged while divergence is not ready, even with a matching history MR', () => {
    const result = deriveLinkedRepoDelivery({
      ...baseFacts,
      hasMatchingMergedMr: true,
      divergence: { status: 'loading' },
    });

    expect(result.action).toBe('querying');
    expect(result.isAllMerged).toBe(false);
    expect(result.conclusion).toContain('正在查询');
  });

  it('offers a separate baseline action before demand-branch creation', () => {
    const result = deriveLinkedRepoDelivery({ ...baseFacts, baselineState: 'missing' });

    expect(result.action).toBe('create-baseline');
    expect(result.conclusion).toContain('迭代基准分支尚未创建');
  });

  it('uses a confirmed matched active MR instead of proposing a duplicate MR', () => {
    const result = deriveLinkedRepoDelivery({
      ...baseFacts,
      matchingActiveMrId: 19,
      divergence: { status: 'ready', developmentOnly: 4, baselineOnly: 0 },
    });

    expect(result.action).toBe('view-mr');
    expect(result.conclusion).toContain('!19');
  });

  it('requires ready divergence before showing create-MR or build actions', () => {
    const pending = deriveLinkedRepoDelivery({
      ...baseFacts,
      divergence: { status: 'ready', developmentOnly: 2, baselineOnly: 0 },
    });
    const failed = deriveLinkedRepoDelivery({
      ...baseFacts,
      divergence: { status: 'error' },
    });

    expect(pending.action).toBe('create-mr');
    expect(failed.action).toBe('retry');
    expect(failed.isAllMerged).toBe(false);
  });

  it('requires aligned or matching merged evidence before offering build', () => {
    const unmatchedHistory = deriveLinkedRepoDelivery({
      ...baseFacts,
      hasMatchingMergedMr: false,
      divergence: { status: 'ready', developmentOnly: 0, baselineOnly: 3 },
    });
    const aligned = deriveLinkedRepoDelivery({
      ...baseFacts,
      divergence: { status: 'ready', developmentOnly: 0, baselineOnly: 0 },
    });

    expect(unmatchedHistory.action).toBe('details');
    expect(unmatchedHistory.isAllMerged).toBe(false);
    expect(aligned.action).toBe('build');
    expect(aligned.isAllMerged).toBe(true);
  });

  it('prioritizes configuring a missing rule over inferred branches', () => {
    const result = deriveLinkedRepoDelivery({ ...baseFacts, hasValidRule: false });

    expect(result.action).toBe('configure-rule');
  });
});

describe('ensureIterationBaseline', () => {
  it('creates a missing baseline from its configured source and verifies the result', async () => {
    const remote = new Set(['develop']);
    const findBranch = vi.fn(async (_repoId: number, name: string) => remote.has(name) ? { name } : null);
    const createBranch = vi.fn(async (_repoId: number, name: string) => { remote.add(name); });

    const result = await ensureIterationBaseline({
      repoId: 17,
      targetBranch: 'iteration/sprint-1/main',
      sourceBranch: 'develop',
      findBranch,
      createBranch,
    });

    expect(result).toEqual({ created: true, branchName: 'iteration/sprint-1/main' });
    expect(createBranch).toHaveBeenCalledOnce();
    expect(createBranch).toHaveBeenCalledWith(17, 'iteration/sprint-1/main', 'develop');
    expect(findBranch).toHaveBeenCalledTimes(3);
  });

  it('does not create a baseline that already exists', async () => {
    const createBranch = vi.fn();
    const result = await ensureIterationBaseline({
      repoId: 17,
      targetBranch: 'iteration/sprint-1/main',
      sourceBranch: 'develop',
      findBranch: vi.fn(async (_repoId: number, name: string) => name === 'iteration/sprint-1/main' ? { name } : null),
      createBranch,
    });

    expect(result.created).toBe(false);
    expect(createBranch).not.toHaveBeenCalled();
  });

  it('rejects identical target/source and missing source without attempting a write', async () => {
    const createBranch = vi.fn();
    const findBranch = vi.fn(async () => null);

    await expect(ensureIterationBaseline({
      repoId: 17,
      targetBranch: 'develop',
      sourceBranch: 'develop',
      findBranch,
      createBranch,
    })).rejects.toThrow('不能与迭代基准分支同名');

    await expect(ensureIterationBaseline({
      repoId: 17,
      targetBranch: 'iteration/sprint-1/main',
      sourceBranch: 'develop',
      findBranch,
      createBranch,
    })).rejects.toThrow('模板源分支「develop」在线上不存在');

    expect(createBranch).not.toHaveBeenCalled();
  });

  it('reports a failed post-create lookup instead of claiming success', async () => {
    const findBranch = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: 'develop' })
      .mockResolvedValueOnce(null);
    const createBranch = vi.fn(async () => undefined);

    await expect(ensureIterationBaseline({
      repoId: 17,
      targetBranch: 'iteration/sprint-1/main',
      sourceBranch: 'develop',
      findBranch,
      createBranch,
    })).rejects.toThrow('创建后未能查询到');
    expect(createBranch).toHaveBeenCalledOnce();
  });
});

describe('CI run facts', () => {
  it('selects the run with the newest startTime', () => {
    const result = latestCiRun([
      { runId: 'earlier', startTime: 100 },
      { runId: 'latest', startTime: 250 },
      { runId: 'middle', startTime: 180 },
    ]);

    expect(result?.runId).toBe('latest');
  });

  it('reads only the branch value from the Jenkins binding selected for that run', () => {
    const run = { parameters: { SOURCE_BRANCH: 'release/actual', branch: 'other-branch' } };

    expect(boundJenkinsRunBranch(run, 'SOURCE_BRANCH')).toBe('release/actual');
    expect(boundJenkinsRunBranch(run, undefined)).toBeUndefined();
    expect(boundJenkinsRunBranch(run, 'UNKNOWN')).toBeUndefined();
  });
});
