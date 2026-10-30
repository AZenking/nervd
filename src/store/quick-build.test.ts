import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractConfiguredBuildTargets, useQuickBuild, type QuickBuildTarget } from './quick-build';
import { useApp } from './app';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  triggerRepoCi: vi.fn(),
  triggerJenkinsJob: vi.fn(),
}));

describe('useQuickBuild store', () => {
  beforeEach(() => {
    localStorage.clear();
    useQuickBuild.getState().clearHistory();
    vi.clearAllMocks();
  });

  const mockTarget: QuickBuildTarget = {
    id: 'flow:101',
    type: 'flow',
    repoId: 101,
    repoName: 'trade-service',
    pipelineName: 'Trade Master CI',
  };

  it('records build and prioritizes recent items', () => {
    const store = useQuickBuild.getState();
    store.recordBuild(mockTarget);

    expect(useQuickBuild.getState().history).toHaveLength(1);
    expect(useQuickBuild.getState().history[0].id).toBe('flow:101');
    expect(useQuickBuild.getState().history[0].triggerCount).toBe(1);

    // 再次记录同一个目标，应增加 count 并保持在第 0 位
    store.recordBuild(mockTarget);
    expect(useQuickBuild.getState().history).toHaveLength(1);
    expect(useQuickBuild.getState().history[0].triggerCount).toBe(2);

    // 记录第二个目标，应置顶
    const secondTarget: QuickBuildTarget = {
      id: 'jenkins:102:conn-1:deploy-job',
      type: 'jenkins',
      repoId: 102,
      repoName: 'auth-service',
      pipelineName: 'deploy-job',
      connectionId: 'conn-1',
      jobFullName: 'deploy-job',
    };
    store.recordBuild(secondTarget);
    expect(useQuickBuild.getState().history).toHaveLength(2);
    expect(useQuickBuild.getState().history[0].id).toBe('jenkins:102:conn-1:deploy-job');
  });

  it('blocks trigger and toasts when allowWriteOps is false', async () => {
    useApp.setState({
      settings: {
        organizationId: 'org-test',
        defaultSpaceIdentifier: 'space-1',
        linkPattern: '',
        watchedRepos: [101],
        allowWriteOps: false,
        workitemRepos: {},
        branchRuleTemplates: [],
        workitemRepoBranchTemplates: {},
        jenkinsConnections: [],
        repoCiBindings: {},
        hasPat: true,
      },
    });

    const store = useQuickBuild.getState();
    const ok = await store.triggerQuickBuild(mockTarget);
    expect(ok).toBe(false);
    expect(api.triggerRepoCi).not.toHaveBeenCalled();
  });

  it('successfully triggers flow pipeline and updates history', async () => {
    useApp.setState({
      settings: {
        organizationId: 'org-test',
        defaultSpaceIdentifier: 'space-1',
        linkPattern: '',
        watchedRepos: [101],
        allowWriteOps: true,
        workitemRepos: {},
        branchRuleTemplates: [],
        workitemRepoBranchTemplates: {},
        jenkinsConnections: [],
        repoCiBindings: {},
        hasPat: true,
      },
      loadRepoCi: vi.fn(),
      markRepoCiActive: vi.fn(),
      setToast: vi.fn(),
    });

    vi.mocked(api.triggerRepoCi).mockResolvedValueOnce({ success: true });

    const store = useQuickBuild.getState();
    const ok = await store.triggerQuickBuild(mockTarget);
    expect(ok).toBe(true);
    expect(api.triggerRepoCi).toHaveBeenCalledWith(101);
    expect(useQuickBuild.getState().history[0].id).toBe('flow:101');
  });

  it('extractConfiguredBuildTargets parses flow and jenkins configurations', () => {
    const settings = {
      organizationId: 'org-1',
      defaultSpaceIdentifier: 'space-1',
      linkPattern: '',
      watchedRepos: [101, 202],
      allowWriteOps: true,
      workitemRepos: {},
      branchRuleTemplates: [],
      workitemRepoBranchTemplates: {},
      jenkinsConnections: [
        { id: 'j-prod', name: '生产 Jenkins', baseUrl: 'http://jenkins', username: 'admin' },
      ],
      repoCiBindings: {
        '101': { provider: 'flow', pipelineId: 1001, pipelineName: 'Flow 构建' },
        '202': {
          provider: 'jenkins',
          connectionId: 'j-prod',
          jobFullName: 'build-pay-service',
          parameters: { ENV: 'staging' },
        },
      },
    };

    const repos = [
      { id: 101, name: 'repo-one', pathWithNamespace: 'team/repo-one' },
      { id: 202, name: 'repo-two', pathWithNamespace: 'team/repo-two' },
    ];

    const targets = extractConfiguredBuildTargets(settings as any, repos);
    expect(targets).toHaveLength(2);
    expect(targets.find((t) => t.type === 'flow')?.repoName).toBe('repo-one');
    expect(targets.find((t) => t.type === 'jenkins')?.connectionName).toBe('生产 Jenkins');
  });
});
