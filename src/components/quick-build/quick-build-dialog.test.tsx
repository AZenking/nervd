import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickBuildDialog } from './quick-build-dialog';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';
import { useQuickBuild } from '@/store/quick-build';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('QuickBuildDialog', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUi.setState({ quickBuildOpen: true });
    useQuickBuild.setState({
      history: [
        {
          id: 'flow:101',
          type: 'flow',
          repoId: 101,
          repoName: 'trade-service',
          pipelineName: 'Flow 生产发布',
        },
      ],
      triggeringId: null,
    });
    useApp.setState({
      settings: {
        organizationId: 'org-test',
        defaultSpaceIdentifier: 'space-1',
        linkPattern: '',
        watchedRepos: [101, 102],
        allowWriteOps: true,
        workitemRepos: {},
        branchRuleTemplates: [],
        workitemRepoBranchTemplates: {},
        jenkinsConnections: [],
        repoCiBindings: {
          '102': { provider: 'flow', pipelineId: 2, pipelineName: 'Auth CI' },
        },
        hasPat: true,
      },
      repositories: [
        { id: 101, name: 'trade-service' },
        { id: 102, name: 'auth-service' },
      ],
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

  it('renders recent and configured pipelines', async () => {
    await act(async () => {
      root?.render(<QuickBuildDialog />);
    });

    expect(document.body.textContent).toContain('最近触发 (Recent Builds)');
    expect(document.body.textContent).toContain('trade-service');
    expect(document.body.textContent).toContain('auth-service');
  });

  it('triggers quick build on click', async () => {
    const triggerSpy = vi.fn().mockResolvedValue(true);
    useQuickBuild.setState({ triggerQuickBuild: triggerSpy });

    await act(async () => {
      root?.render(<QuickBuildDialog />);
    });

    const buttons = document.querySelectorAll('button');
    const tradeBtn = [...buttons].find((b) => b.textContent?.includes('trade-service'));
    expect(tradeBtn).toBeDefined();

    await act(async () => {
      tradeBtn?.click();
    });

    expect(triggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'flow:101', repoName: 'trade-service' }),
    );
  });
});
