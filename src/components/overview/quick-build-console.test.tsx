import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickBuildConsole } from './quick-build-console';
import { useQuickBuild } from '@/store/quick-build';
import { useApp } from '@/store/app';

vi.mock('@/lib/api', () => ({
  listBranches: vi.fn().mockResolvedValue(['master', 'feature/test-1']),
  getJenkinsJobParameters: vi.fn().mockResolvedValue([]),
  triggerRepoCi: vi.fn(),
  triggerJenkinsJob: vi.fn(),
}));

vi.mock('@/lib/jenkins-cache', () => ({
  getCachedJenkinsJobs: vi.fn().mockResolvedValue({
    jobs: [
      { name: 'build-job', fullName: 'build-job', color: 'blue' },
      { name: 'deploy-job', fullName: 'deploy-job', color: 'blue' },
    ],
    stale: false,
  }),
  hasCachedJobs: vi.fn().mockReturnValue(true),
  getCachedJenkinsJobParameters: vi.fn().mockResolvedValue([]),
}));

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('QuickBuildConsole', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useQuickBuild.setState({
      history: [
        {
          id: 'jenkins:101:conn-1:build-job',
          type: 'jenkins',
          repoId: 101,
          repoName: 'order-service',
          pipelineName: 'build-job',
          connectionId: 'conn-1',
          jobFullName: 'build-job',
          parameters: { branch: 'feature/order-v1', ENV: 'staging' },
          lastTriggeredAt: Date.now() - 60000,
        },
      ],
      trackedBuilds: [],
      triggeringIds: [],
      triggeringId: null,
    });

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
        jenkinsConnections: [{ id: 'conn-1', name: '主 Jenkins', baseUrl: '', username: '', hasToken: true }],
        repoCiBindings: {
          '101': {
            provider: 'jenkins',
            connectionId: 'conn-1',
            jobFullName: 'build-job',
            parameters: { branch: 'master' },
          },
        },
        hasPat: true,
      },
      repositories: [{ id: 101, name: 'order-service' }],
      repoCiByRepo: {},
    });
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });

  it('renders quick build console in-place with recent item and branch input', async () => {
    await act(async () => {
      root?.render(<QuickBuildConsole />);
    });
    expect(document.body.textContent).not.toContain('构建分支');
    act(() => {
      [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('发起构建'))?.click();
    });

    expect(document.body.textContent).toContain('快捷构建控制台');
    expect(document.body.textContent).toContain('order-service');
    expect(document.body.textContent).toContain('构建分支');

    const input = document.querySelector('input[placeholder*="填写构建分支"]') as HTMLInputElement | null;
    expect(input).toBeDefined();
    expect(input?.value).toBe('feature/order-v1');
  });

  it('allows editing branch and triggers build with custom parameters', async () => {
    const triggerSpy = vi.fn().mockResolvedValue(true);
    useQuickBuild.setState({ triggerQuickBuild: triggerSpy });

    await act(async () => {
      root?.render(<QuickBuildConsole />);
    });
    expect(document.body.textContent).not.toContain('构建目标');
    act(() => {
      [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('发起构建'))?.click();
    });

    const triggerBtn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('立即发起构建'),
    );
    expect(triggerBtn).toBeDefined();

    // 第一次点击进入二次确认倒计时
    await act(async () => {
      triggerBtn?.click();
    });
    expect(document.body.textContent).toContain('确认发起构建');

    // 第二次点击实际触发
    const confirmBtn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('确认发起构建'),
    );
    await act(async () => {
      confirmBtn?.click();
    });

    expect(triggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'jenkins:101:conn-1:build-job' }),
      expect.objectContaining({ branch: 'feature/order-v1' }),
    );
  });

  it('内嵌展示活跃构建流、方案 B 进度条与就地盯盘按钮', async () => {
    const now = Date.now();
    useApp.setState({
      repoCiByRepo: {
        101: {
          loading: false,
          snapshot: {
            provider: 'jenkins',
            name: 'build-job',
            status: 'RUNNING',
            runs: [
              {
                runId: '105',
                status: 'RUNNING',
                startTime: now - 30000, // 运行 30s
              },
              {
                runId: '104',
                status: 'SUCCESS',
                startTime: now - 120000,
                durationMs: 60000, // 历史基准 60s
              },
            ],
          },
        },
      },
    });

    await act(async () => {
      root?.render(<QuickBuildConsole />);
    });
    expect(document.body.textContent).toContain('活跃构建中 · 1');
    expect(document.body.textContent).not.toContain('状态 / 平台');
    expect(document.body.textContent).toContain('#105');
    expect(document.body.textContent).toContain('查看日志');
    expect(document.body.textContent).toContain('50%'); // 30s / 60s = 50%
  });

  it('多个活跃构建时保留紧凑表头与多行任务列表', async () => {
    const now = Date.now();
    useApp.setState({
      repositories: [
        { id: 101, name: 'order-service' },
        { id: 102, name: 'web-app' },
      ],
      repoCiByRepo: {
        101: {
          loading: false,
          snapshot: {
            provider: 'jenkins',
            name: 'build-job',
            status: 'RUNNING',
            runs: [{ runId: '105', status: 'RUNNING', startTime: now - 30000 }],
          },
        },
        102: {
          loading: false,
          snapshot: {
            provider: 'flow',
            name: 'release-flow',
            status: 'RUNNING',
            runs: [{ runId: '206', status: 'RUNNING', startTime: now - 10000 }],
          },
        },
      },
    });

    await act(async () => {
      root?.render(<QuickBuildConsole />);
    });

    expect(document.body.textContent).toContain('运行任务');
    expect(document.body.textContent).toContain('状态 / 平台');
    expect(document.body.textContent).toContain('#105');
    expect(document.body.textContent).toContain('#206');
  });

  it('提供自由选择与切换具体 Job 的下拉入口', async () => {
    await act(async () => {
      root?.render(<QuickBuildConsole />);
    });
    act(() => {
      [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('发起构建'))?.click();
    });

    expect(document.body.textContent).toContain('任务（Job）');
    expect(document.body.textContent).toContain('build-job');
  });

  it('自动根据 settings 的组织空间标识从 LocalStorage 加载隔离历史并恢复最近配置', async () => {
    const orgId = 'org-corp-x';
    const spaceId = 'space-team-alpha';
    const scopedKey = `nervd:quick-build-history:${orgId}:${spaceId}`;
    localStorage.setItem(
      scopedKey,
      JSON.stringify([
        {
          id: 'jenkins:101:conn-1:build-job',
          targetKey: 'jenkins:101:conn-1:build-job',
          type: 'jenkins',
          repoId: 101,
          repoName: 'order-service',
          pipelineName: 'build-job',
          connectionId: 'conn-1',
          jobFullName: 'build-job',
          parameters: { branch: 'release/v2.0', ENV: 'prod' },
          lastTriggeredAt: Date.now() - 5000,
        },
      ]),
    );

    useQuickBuild.setState({ history: [] });
    useApp.setState({
      settings: {
        organizationId: orgId,
        defaultSpaceIdentifier: spaceId,
        linkPattern: '',
        watchedRepos: [101],
        allowWriteOps: true,
        workitemRepos: {},
        branchRuleTemplates: [],
        workitemRepoBranchTemplates: {},
        jenkinsConnections: [{ id: 'conn-1', name: '主 Jenkins', baseUrl: '', username: '', hasToken: true }],
        repoCiBindings: {
          '101': {
            provider: 'jenkins',
            connectionId: 'conn-1',
            jobFullName: 'build-job',
            parameters: { branch: 'master' },
          },
        },
        hasPat: true,
      },
    });

    await act(async () => {
      root?.render(<QuickBuildConsole />);
    });

    expect(useQuickBuild.getState().history).toHaveLength(1);
    expect(useQuickBuild.getState().history[0].parameters?.branch).toBe('release/v2.0');
    expect(document.body.textContent).toContain('release/v2.0');
    expect(document.body.textContent).toContain('prod');
  });
});
