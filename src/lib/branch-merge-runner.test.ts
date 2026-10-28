import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { executeBranchMerge } from './branch-merge-runner';
import { useApp } from '@/store/app';

vi.mock('./api', () => ({
  compareBranches: vi.fn(),
  listMergeRequests: vi.fn(),
  createMergeRequest: vi.fn(),
  mergeMergeRequest: vi.fn(),
  createBranch: vi.fn(),
}));

describe('executeBranchMerge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApp.setState({
      settings: {
        hasPat: true,
        organizationId: 'org-test',
        defaultSpaceIdentifier: 'space-test',
        linkPattern: '',
        watchedRepos: [],
        allowWriteOps: true,
        workitemRepos: {},
        branchRuleTemplates: [],
        workitemRepoBranchTemplates: {},
        jenkinsConnections: [],
        repoCiBindings: {},
      },
    });
  });

  it('rejects identical or empty branches', async () => {
    await expect(
      executeBranchMerge({
        type: 'branch_merge',
        repoId: 101,
        sourceBranch: '',
        targetBranch: 'master',
        strategy: 'cautious',
      }),
    ).rejects.toThrow('源分支与目标分支不能为空');

    await expect(
      executeBranchMerge({
        type: 'branch_merge',
        repoId: 101,
        sourceBranch: 'master',
        targetBranch: 'master',
        strategy: 'cautious',
      }),
    ).rejects.toThrow('源分支与目标分支不能相同');
  });

  it('blocks execution when allowWriteOps is false', async () => {
    useApp.setState({
      settings: {
        ...useApp.getState().settings!,
        allowWriteOps: false,
      },
    });

    await expect(
      executeBranchMerge({
        type: 'branch_merge',
        repoId: 101,
        sourceBranch: 'feature/1',
        targetBranch: 'master',
        strategy: 'cautious',
      }),
    ).rejects.toThrow('只读保护模式');
  });

  it('returns success early if target branch is already up-to-date', async () => {
    vi.mocked(api.compareBranches).mockResolvedValueOnce({
      commits: [],
      diffs: [],
    });

    const result = await executeBranchMerge({
      type: 'branch_merge',
      repoId: 101,
      sourceBranch: 'feature/1',
      targetBranch: 'master',
      strategy: 'cautious',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('无待合入改动');
    expect(api.createMergeRequest).not.toHaveBeenCalled();
  });

  it('cautious strategy aborts immediately when conflict is detected', async () => {
    vi.mocked(api.compareBranches).mockResolvedValueOnce({
      commits: [{ id: 'c1' }],
      diffs: [{ newPath: 'a.txt' }],
      hasConflict: true,
    });
    vi.mocked(api.listMergeRequests).mockResolvedValueOnce({ result: [] });

    const result = await executeBranchMerge({
      type: 'branch_merge',
      repoId: 101,
      sourceBranch: 'feature/conflict',
      targetBranch: 'master',
      strategy: 'cautious',
    });

    expect(result.success).toBe(false);
    expect(result.conflictDetected).toBe(true);
    expect(result.message).toContain('谨慎策略');
    expect(result.message).toContain('已中止');
    expect(api.mergeMergeRequest).not.toHaveBeenCalled();
  });

  it('cautious strategy merges clean branches without conflicts', async () => {
    vi.mocked(api.compareBranches).mockResolvedValueOnce({
      commits: [{ id: 'c1' }],
      diffs: [{ newPath: 'clean.txt' }],
    });
    vi.mocked(api.listMergeRequests).mockResolvedValueOnce({ result: [] });
    vi.mocked(api.createMergeRequest).mockResolvedValueOnce({ localId: 88 });
    vi.mocked(api.mergeMergeRequest).mockResolvedValueOnce({ status: 'MERGED' });

    const result = await executeBranchMerge(
      {
        type: 'branch_merge',
        repoId: 101,
        sourceBranch: 'feature/clean',
        targetBranch: 'master',
        strategy: 'cautious',
      },
      { retryDelayMs: 1 },
    );

    expect(result.success).toBe(true);
    expect(result.conflictDetected).toBe(false);
    expect(result.mrId).toBe(88);
    expect(api.mergeMergeRequest).toHaveBeenCalledWith(101, 88);
  });

  it('retries and recovers when encountering 405 status not allowed error from Yunxiao', async () => {
    vi.mocked(api.compareBranches).mockResolvedValueOnce({
      commits: [{ id: 'c1' }],
      diffs: [{ newPath: 'clean.txt' }],
    });
    vi.mocked(api.listMergeRequests).mockResolvedValueOnce({ result: [] });
    vi.mocked(api.createMergeRequest).mockResolvedValueOnce({ localId: 88 });
    // 第 1 次调用报 405（云效计算中），第 2 次成功
    vi.mocked(api.mergeMergeRequest)
      .mockRejectedValueOnce(new Error('YUNXIAO 405 Method Not Allowed: SYSTEM_FORBIDDEN_ERROR: 405 METHOD_NOT_ALLOWED - 该状态下的评审不允许合并，请刷新页面后重试。'))
      .mockResolvedValueOnce({ status: 'MERGED' });

    const result = await executeBranchMerge(
      {
        type: 'branch_merge',
        repoId: 101,
        sourceBranch: 'feature/retry',
        targetBranch: 'master',
        strategy: 'cautious',
      },
      { retryDelayMs: 1 },
    );

    expect(result.success).toBe(true);
    expect(result.mrId).toBe(88);
    expect(api.mergeMergeRequest).toHaveBeenCalledTimes(2);
  });

  it('aggressive strategy resolves conflicts in shadow isolated branch without polluting source branch', async () => {
    vi.mocked(api.compareBranches).mockResolvedValueOnce({
      commits: [{ id: 'c1' }],
      diffs: [{ newPath: 'conflict.txt' }],
      hasConflict: true,
    });
    vi.mocked(api.listMergeRequests).mockResolvedValueOnce({ result: [] });
    vi.mocked(api.createBranch).mockResolvedValueOnce({ name: 'sync-isolated/test' });
    vi.mocked(api.createMergeRequest).mockResolvedValueOnce({ localId: 99 });

    const result = await executeBranchMerge({
      type: 'branch_merge',
      repoId: 101,
      sourceBranch: 'feature/dirty',
      targetBranch: 'release/v1',
      strategy: 'aggressive',
      aggressiveConflictPreference: 'isolated_pr',
    });

    expect(result.success).toBe(true);
    expect(result.strategy).toBe('aggressive');
    expect(result.conflictDetected).toBe(true);
    expect(result.conflictResolved).toBe(true);
    expect(result.shadowBranch).toBeDefined();
    expect(result.message).toContain('零污染');
    expect(api.createBranch).toHaveBeenCalledWith(
      101,
      expect.stringContaining('sync-isolated/release-v1'),
      'release/v1',
    );
    expect(api.createMergeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceBranch: 'feature/dirty',
        targetBranch: expect.stringContaining('sync-isolated/'),
      }),
    );
  });
});
