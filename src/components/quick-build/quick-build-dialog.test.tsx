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

  it('requires a second inline confirmation before triggering quick build', async () => {
    const triggerSpy = vi.fn().mockResolvedValue(true);
    useQuickBuild.setState({ triggerQuickBuild: triggerSpy });

    await act(async () => {
      root?.render(<QuickBuildDialog />);
    });

    const buttons = document.querySelectorAll('button');
    const tradeBtn = [...buttons].find((b) => b.textContent?.includes('trade-service'));
    expect(tradeBtn).toBeDefined();

    // 第一次点击只进入 4s 待确认态（AGENTS.md §5.2 两段式确认）
    await act(async () => {
      tradeBtn?.click();
    });
    expect(triggerSpy).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('确认触发 (4s)');

    // 第二次点击才真正提交
    await act(async () => {
      tradeBtn?.click();
    });
    expect(triggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'flow:101', repoName: 'trade-service' }),
    );
  });

  it('stops keydown propagation and supports typing Space without triggering build', async () => {
    const triggerSpy = vi.fn().mockResolvedValue(true);
    useQuickBuild.setState({ triggerQuickBuild: triggerSpy });

    await act(async () => {
      root?.render(<QuickBuildDialog />);
    });

    const input = document.querySelector('input') as HTMLInputElement;
    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(spaceEvent, 'stopPropagation');

    await act(async () => {
      input.dispatchEvent(spaceEvent);
    });

    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(triggerSpy).not.toHaveBeenCalled();
    expect(useUi.getState().quickBuildOpen).toBe(true);
  });

  it('does not trigger build when Enter is pressed during IME composition', async () => {
    const triggerSpy = vi.fn().mockResolvedValue(true);
    useQuickBuild.setState({ triggerQuickBuild: triggerSpy });

    await act(async () => {
      root?.render(<QuickBuildDialog />);
    });

    const input = document.querySelector('input') as HTMLInputElement;
    const imeEnterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(imeEnterEvent, 'isComposing', { value: true });

    await act(async () => {
      input.dispatchEvent(imeEnterEvent);
    });

    expect(triggerSpy).not.toHaveBeenCalled();
    expect(useUi.getState().quickBuildOpen).toBe(true);
  });

  it('renders title attributes for truncated repository and pipeline names', async () => {
    await act(async () => {
      root?.render(<QuickBuildDialog />);
    });

    const titleEl = document.querySelector('[title*="trade-service · Flow 生产发布"]');
    expect(titleEl).not.toBeNull();
  });
});
