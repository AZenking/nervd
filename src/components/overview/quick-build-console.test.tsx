import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickBuildConsole } from './quick-build-console';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useQuickBuild } from '@/store/quick-build';
import { useApp } from '@/store/app';

vi.mock('@/lib/api', () => ({
  listBranches: vi.fn().mockResolvedValue(['master', 'feature/test-1']),
  getJenkinsJobParameters: vi.fn().mockResolvedValue([]),
  triggerRepoCi: vi.fn(),
  triggerJenkinsJob: vi.fn(),
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
      root?.render(
        <TooltipProvider>
          <QuickBuildConsole />
        </TooltipProvider>,
      );
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
      root?.render(
        <TooltipProvider>
          <QuickBuildConsole />
        </TooltipProvider>,
      );
    });

    const triggerBtn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('立即发起构建'),
    );
    expect(triggerBtn).toBeDefined();

    await act(async () => {
      triggerBtn?.click();
    });

    expect(triggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'jenkins:101:conn-1:build-job' }),
      expect.objectContaining({ branch: 'feature/order-v1' }),
    );
  });
});
