import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractConfiguredBuildTargets,
  markHistoryStaleness,
  useQuickBuild,
  type QuickBuildTarget,
} from './quick-build';
import { useApp } from './app';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  triggerRepoCi: vi.fn(),
  triggerJenkinsJob: vi.fn(),
  startPipelineRun: vi.fn(),
  getJenkinsQueueItem: vi.fn(),
  getJenkinsJobRuns: vi.fn(),
  getPipelineRun: vi.fn(),
}));

describe('useQuickBuild store', () => {
  beforeEach(() => {
    localStorage.clear();
    useQuickBuild.getState().clearHistory();
    useQuickBuild.setState({ trackedBuilds: [] });
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
    const result = await store.triggerQuickBuild(mockTarget);
    expect(result).toMatchObject({ targetKey: 'flow:101', provider: 'flow' });
    expect(api.triggerRepoCi).toHaveBeenCalledWith(101, expect.anything());
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
    expect(targets.find((t) => t.type === 'flow')?.pipelineId).toBe(1001);
    expect(targets.find((t) => t.type === 'flow')?.targetKey).toBe('flow:101:1001');
    expect(targets.find((t) => t.type === 'jenkins')?.connectionName).toBe('生产 Jenkins');
    expect(targets.find((t) => t.type === 'jenkins')?.targetKey).toBe('jenkins:202:j-prod:build-pay-service');
  });

  it('filters sensitive parameters from history', () => {
    const store = useQuickBuild.getState();
    const sensitiveParams = {
      branch: 'feature/login',
      userToken: 'secret-token-123',
      db_password: 'super-password',
      apiKey: 'api-key-xyz',
      client_credential: 'cred',
      ENVIRONMENT: 'production',
    };

    store.recordBuild(mockTarget, sensitiveParams);

    const history = useQuickBuild.getState().history;
    expect(history).toHaveLength(1);
    expect(history[0].parameters).toEqual({
      branch: 'feature/login',
      ENVIRONMENT: 'production',
    });
    expect(history[0].parameters).not.toHaveProperty('userToken');
    expect(history[0].parameters).not.toHaveProperty('db_password');
    expect(history[0].parameters).not.toHaveProperty('apiKey');
    expect(history[0].parameters).not.toHaveProperty('client_credential');
  });

  it('marks history stale if unconfigured', () => {
    const configuredTarget: QuickBuildTarget = {
      id: 'jenkins:101:conn-1:active-job',
      targetKey: 'jenkins:101:conn-1:active-job',
      type: 'jenkins',
      repoId: 101,
      repoName: 'active-repo',
      pipelineName: 'active-job',
    };

    const staleHistoryItem: QuickBuildTarget = {
      id: 'jenkins:999:conn-old:deleted-job',
      targetKey: 'jenkins:999:conn-old:deleted-job',
      type: 'jenkins',
      repoId: 999,
      repoName: 'deleted-repo',
      pipelineName: 'deleted-job',
    };

    const checked = markHistoryStaleness([configuredTarget, staleHistoryItem], [configuredTarget]);

    expect(checked[0].isStale).toBe(false);
    expect(checked[1].isStale).toBe(true);
  });

  it('Flow uses pipelineId and configured branch parameter', async () => {
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

    vi.mocked(api.startPipelineRun).mockResolvedValueOnce({ pipelineRunId: 777 });

    const flowTarget: QuickBuildTarget = {
      id: 'flow:101:8888',
      targetKey: 'flow:101:8888',
      type: 'flow',
      repoId: 101,
      repoName: 'custom-flow-repo',
      pipelineName: 'Custom Pipeline',
      pipelineId: 8888,
      branchParameter: 'custom_branch',
    };

    const store = useQuickBuild.getState();
    const res = await store.triggerQuickBuild(flowTarget, { custom_branch: 'release/v2' });

    expect(res).toMatchObject({
      provider: 'flow',
      runId: '777',
      targetKey: 'flow:101:8888',
    });
    expect(api.startPipelineRun).toHaveBeenCalledWith(8888, { custom_branch: 'release/v2' });
  });

  it('transitions Jenkins build from queued to running to success', async () => {
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
        jenkinsConnections: [{ id: 'conn-1', name: 'Jenkins', baseUrl: 'http://jenkins', username: 'admin', hasToken: true }],
        repoCiBindings: {},
        hasPat: true,
      },
      loadRepoCi: vi.fn(),
      markRepoCiActive: vi.fn(),
      setToast: vi.fn(),
    });

    vi.mocked(api.triggerJenkinsJob).mockResolvedValueOnce({
      queueUrl: 'http://jenkins/queue/item/42/',
      queueId: '42',
      repoId: 101,
      connectionId: 'conn-1',
      jobFullName: 'frontend-job',
    });

    const jenkinsTarget: QuickBuildTarget = {
      id: 'jenkins:101:conn-1:frontend-job',
      targetKey: 'jenkins:101:conn-1:frontend-job',
      type: 'jenkins',
      repoId: 101,
      repoName: 'frontend-repo',
      pipelineName: 'frontend-job',
      connectionId: 'conn-1',
      jobFullName: 'frontend-job',
    };

    const store = useQuickBuild.getState();
    const res = await store.triggerQuickBuild(jenkinsTarget, { branch: 'main' });

    expect(res).toMatchObject({
      provider: 'jenkins',
      queueId: '42',
    });

    // 1. Initial state is queued
    expect(useQuickBuild.getState().trackedBuilds).toHaveLength(1);
    expect(useQuickBuild.getState().trackedBuilds[0].state).toBe('queued');
    expect(useQuickBuild.getState().trackedBuilds[0].queueId).toBe('42');

    // 2. Poll: queue item started executing as build #105
    vi.mocked(api.getJenkinsQueueItem).mockResolvedValueOnce({
      queueId: '42',
      leftQueue: false,
      executableNumber: 105,
      executableUrl: 'http://jenkins/job/frontend-job/105/',
    });

    await store.pollTrackedBuilds();
    expect(useQuickBuild.getState().trackedBuilds[0].state).toBe('running');
    expect(useQuickBuild.getState().trackedBuilds[0].runId).toBe('105');

    // 3. Poll: build completed with SUCCESS
    vi.mocked(api.getJenkinsJobRuns).mockResolvedValueOnce([
      { runId: '105', status: 'SUCCESS' },
    ]);

    await store.pollTrackedBuilds();
    expect(useQuickBuild.getState().trackedBuilds[0].state).toBe('success');
    expect(useQuickBuild.getState().trackedBuilds[0].completedAt).toBeDefined();
  });
});
