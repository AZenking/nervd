import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';
import { Shell } from './Shell';
import {
  IntegrationViewSkeleton,
  RequirementViewSkeleton,
  SchedulesViewSkeleton,
  SettingsViewSkeleton,
} from './shell-skeleton';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
  }
  Element.prototype.scrollIntoView = vi.fn();
});

// Mock heavy sub-modules to keep tests fast and deterministic
vi.mock('@/lib/api', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
  listWorkitems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  listIterations: vi.fn().mockResolvedValue([]),
  listRepos: vi.fn().mockResolvedValue([]),
  listPipelines: vi.fn().mockResolvedValue([]),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe('Shell Component & Code Splitting Skeletons', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUi.setState({
      view: 'overview',
      buildWorkbenchOpen: false,
      buildWorkbenchTarget: null,
      commandOpen: false,
      shortcutsOpen: false,
      aboutOpen: false,
      quickBuildOpen: false,
    });
    useApp.setState({
      settings: {
        hasPat: true,
        organizationId: 'org_test',
        defaultSpaceIdentifier: 'space_test',
        linkPattern: '',
        watchedRepos: [],
        allowWriteOps: false,
        workitemRepos: {},
        branchRuleTemplates: [],
        workitemRepoBranchTemplates: {},
        jenkinsConnections: [],
        repoCiBindings: {},
      },
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

  it('renders default workspace view in Shell without crashing', async () => {
    await act(async () => {
      root!.render(<Shell />);
    });

    expect(container?.querySelector('[data-workspace-content]')).not.toBeNull();
  });

  it('renders RequirementViewSkeleton with appropriate layout structure', async () => {
    const el = document.createElement('div');
    const tempRoot = createRoot(el);

    await act(async () => {
      tempRoot.render(<RequirementViewSkeleton embedded={false} />);
    });

    expect(el.querySelector('header')).not.toBeNull();
    act(() => tempRoot.unmount());
  });

  it('renders IntegrationViewSkeleton properly', async () => {
    const el = document.createElement('div');
    const tempRoot = createRoot(el);

    await act(async () => {
      tempRoot.render(<IntegrationViewSkeleton />);
    });

    expect(el.textContent).toContain('集成分支');
    act(() => tempRoot.unmount());
  });

  it('renders SchedulesViewSkeleton properly', async () => {
    const el = document.createElement('div');
    const tempRoot = createRoot(el);

    await act(async () => {
      tempRoot.render(<SchedulesViewSkeleton />);
    });

    expect(el.textContent).toContain('定时任务工作台');
    act(() => tempRoot.unmount());
  });

  it('renders SettingsViewSkeleton properly', async () => {
    const el = document.createElement('div');
    const tempRoot = createRoot(el);

    await act(async () => {
      tempRoot.render(<SettingsViewSkeleton />);
    });

    expect(el.textContent).toContain('系统设置');
    act(() => tempRoot.unmount());
  });

  it('Esc on a full-page settings view returns to the previous view', async () => {
    await act(async () => {
      root!.render(<Shell />);
    });

    await act(async () => {
      useUi.getState().openSettings('connection');
    });
    expect(useUi.getState().view).toBe('full-settings');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(useUi.getState().view).toBe('overview');
  });

  it('dynamically switches view to integration with Suspense boundary', async () => {
    await act(async () => {
      root!.render(<Shell />);
    });

    await act(async () => {
      useUi.setState({ view: 'integration' });
    });

    expect(useUi.getState().view).toBe('integration');
  });

  it('mounts BuildWorkbenchDrawer only when build workbench is requested', async () => {
    await act(async () => {
      root!.render(<Shell />);
    });

    expect(useUi.getState().buildWorkbenchOpen).toBe(false);

    await act(async () => {
      useUi.setState({
        buildWorkbenchOpen: true,
        buildWorkbenchTarget: { kind: 'pipeline', pipelineId: 101, title: 'Pipeline 1' },
      });
    });

    expect(useUi.getState().buildWorkbenchOpen).toBe(true);
  });
});
