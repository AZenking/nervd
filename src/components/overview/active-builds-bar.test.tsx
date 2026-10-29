import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '@/store/app';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ActiveBuildsBar } from './active-builds-bar';
import * as buildWorkbench from '@/components/build-workbench';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/build-workbench', () => ({
  openRepoBuildLogs: vi.fn(),
  openPipelineRunLogs: vi.fn(),
}));

describe('ActiveBuildsBar', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
    useApp.setState({
      repoCiByRepo: {},
      pipelines: [],
      runsByPipeline: {},
    });
  });

  it('无活跃构建时，组件返回 null，不渲染任何 DOM', () => {
    useApp.setState({
      repoCiByRepo: {},
      pipelines: [],
      runsByPipeline: {},
    });

    act(() => {
      root?.render(
        <TooltipProvider>
          <ActiveBuildsBar />
        </TooltipProvider>,
      );
    });

    expect(container?.innerHTML).toBe('');
  });

  it('存在正在执行的 Jenkins 任务时，置顶渲染活跃卡片并支持就地盯盘', () => {
    useApp.setState({
      repositories: [
        { id: 101, name: 'frontend-core', pathWithNamespace: 'org/frontend-core' },
      ],
      settings: {
        repoCiBindings: {
          '101': {
            provider: 'jenkins',
            connectionId: 'conn-1',
            jobFullName: 'frontend-deploy',
          },
        },
        jenkinsConnections: [
          { id: 'conn-1', name: 'DevJenkins', baseUrl: 'https://jenkins.example.com', username: 'admin' },
        ],
      } as never,
      repoCiByRepo: {
        101: {
          loading: false,
          snapshot: {
            provider: 'jenkins',
            name: 'frontend-deploy',
            status: 'RUNNING',
            runs: [
              {
                runId: '42',
                status: 'RUNNING',
                startTime: Date.now() - 65000, // 1m 5s ago
              },
            ],
          },
        },
      },
    });

    act(() => {
      root?.render(
        <TooltipProvider>
          <ActiveBuildsBar />
        </TooltipProvider>,
      );
    });

    expect(container?.textContent).toContain('活跃构建中');
    expect(container?.textContent).toContain('Jenkins');
    expect(container?.textContent).toContain('org/frontend-core');
    expect(container?.textContent).toContain('#42');
    expect(container?.textContent).toContain('就地盯盘');

    const logBtn = container?.querySelector('button') as HTMLButtonElement | null;
    expect(logBtn).not.toBeNull();
    act(() => {
      logBtn?.click();
    });
    expect(buildWorkbench.openRepoBuildLogs).toHaveBeenCalledWith(
      101,
      '42',
      'org/frontend-core · frontend-deploy #42',
    );
  });
});
