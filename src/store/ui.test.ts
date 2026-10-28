import { beforeEach, describe, expect, it } from 'vitest';
import { useApp } from './app';
import { parseNavigationRecord, restoreNavigation, useUi } from './ui';

const target = { kind: 'repo' as const, repoId: 101, title: 'nervd-web' };

beforeEach(() => {
  useUi.setState({
    buildWorkbenchOpen: false,
    buildWorkbenchTarget: null,
    buildWorkbenchPage: 'runs',
    buildWorkbenchHistory: [],
  });
});

it('starts on overview when no navigation record exists', () => {
  expect(localStorage.getItem('nervd-navigation')).toBeNull();
  expect(useUi.getState().view).toBe('overview');
});

describe('workspace navigation history', () => {
  beforeEach(() => {
    localStorage.removeItem('nervd-navigation');
    useUi.setState({
      view: 'iteration',
      settingsSection: 'connection',
      iterationKey: 'Benz-20261016',
      filters: { assignees: [], related: [], statuses: [] },
      listContext: {
        pageIndex: 1,
        cursorWorkitemId: null,
        collapsedStatuses: [],
        selectedWorkitemIds: [],
        splitWorkitemId: null,
        splitParentWorkitemId: null,
        viewTab: 'workitems',
      },
      listSearch: '',
      history: [],
      forwardHistory: [],
      chain: [],
      restoreScroll: null,
    });
    useApp.setState({
      booting: true,
      category: 'Req',
      selectedId: null,
      detail: null,
    });
  });

  it('round-trips full list context through back and forward and clears the forward stack on new navigation', async () => {
    const scroll = document.createElement('div');
    scroll.className = 'workspace-scroll';
    document.body.appendChild(scroll);
    scroll.scrollTop = 180;

    const listContext = {
      pageIndex: 4,
      cursorWorkitemId: 'BUG-17',
      collapsedStatuses: ['已完成', '已完成'],
      selectedWorkitemIds: ['BUG-17', 'BUG-18', 'BUG-17'],
      splitWorkitemId: 'BUG-17',
      splitParentWorkitemId: 'BUG-1',
      viewTab: 'branches' as const,
    };
    useApp.setState({
      category: 'Bug',
      selectedId: 'BUG-17',
      detail: { workitemId: 'BUG-17' },
    });
    useUi.setState({
      iterationKey: 'not-yet-loaded-iteration',
      filters: { assignees: ['Alice'], related: ['未关联'], statuses: ['处理中'] },
    });
    useUi.getState().setListSearch('urgent');
    useUi.getState().updateListContext(listContext);

    useUi.getState().setView('overview');
    scroll.scrollTop = 42;
    useUi.getState().setView('integration');

    await useUi.getState().back();
    await useUi.getState().back();
    expect(useUi.getState().view).toBe('iteration');
    expect(useUi.getState().iterationKey).toBe('not-yet-loaded-iteration');
    expect(useUi.getState().filters).toEqual({
      assignees: ['Alice'], related: ['未关联'], statuses: ['处理中'],
    });
    expect(useUi.getState().listSearch).toBe('urgent');
    expect(useUi.getState().listContext).toEqual({
      ...listContext,
      collapsedStatuses: ['已完成'],
      selectedWorkitemIds: ['BUG-17', 'BUG-18'],
    });
    expect(useUi.getState().restoreScroll).toBe(180);

    await useUi.getState().forward();
    expect(useUi.getState().view).toBe('overview');
    await useUi.getState().forward();
    expect(useUi.getState().view).toBe('integration');
    expect(useUi.getState().forwardHistory).toEqual([]);

    await useUi.getState().back();
    useUi.getState().setView('recents');
    expect(useUi.getState().forwardHistory).toEqual([]);

    const stored = parseNavigationRecord(localStorage.getItem('nervd-navigation'));
    expect(stored.status).toBe('valid');
    if (stored.status === 'valid') {
      expect(stored.value.current.view).toBe('recents');
      expect(stored.value.history.some((snapshot) => snapshot.view === 'iteration')).toBe(true);
    }

    scroll.scrollTop = 91;
    window.dispatchEvent(new Event('pagehide'));
    const afterPageHide = parseNavigationRecord(localStorage.getItem('nervd-navigation'));
    expect(afterPageHide.status).toBe('valid');
    if (afterPageHide.status === 'valid') expect(afterPageHide.value.current.scrollTop).toBe(91);
    scroll.remove();
  });

  it('validates schema without rejecting IDs that may load after startup', () => {
    const record = {
      version: 1,
      current: {
        view: 'iteration',
        settingsSection: 'connection',
        iterationKey: 'not-yet-loaded-iteration',
        category: 'Bug',
        filters: { assignees: [], related: [], statuses: [] },
        selectedId: 'not-yet-loaded-workitem',
        chain: [],
        listSearch: '',
        listContext: {
          pageIndex: 8,
          cursorWorkitemId: 'not-yet-loaded-workitem',
          collapsedStatuses: [],
          selectedWorkitemIds: ['not-yet-loaded-workitem'],
          splitWorkitemId: null,
          splitParentWorkitemId: null,
          viewTab: 'workitems',
        },
        scrollTop: 320,
      },
      history: [],
      forwardHistory: [],
    };
    const parsed = parseNavigationRecord(JSON.stringify(record));
    expect(parsed.status).toBe('valid');
    if (parsed.status === 'valid') {
      expect(parsed.value.current.iterationKey).toBe('not-yet-loaded-iteration');
      expect(parsed.value.current.listContext.cursorWorkitemId).toBe('not-yet-loaded-workitem');
    }

    record.current.listContext.pageIndex = 0;
    expect(parseNavigationRecord(JSON.stringify(record)).status).toBe('invalid');
    expect(parseNavigationRecord('{broken').status).toBe('invalid');
    expect(parseNavigationRecord(null).status).toBe('missing');
  });

  it('restores category before selected detail and is idempotent', async () => {
    const crumb = { workitemId: 'BUG-17', identifier: 'BUG-17', subject: 'Persisted detail' };
    localStorage.setItem('nervd-navigation', JSON.stringify({
      version: 1,
      current: {
        view: 'requirement',
        settingsSection: 'connection',
        iterationKey: 'not-yet-loaded-iteration',
        category: 'Bug',
        filters: { assignees: [], related: [], statuses: [] },
        selectedId: 'BUG-17',
        chain: [crumb],
        listSearch: 'urgent',
        listContext: {
          pageIndex: 3,
          cursorWorkitemId: 'not-yet-loaded-workitem',
          collapsedStatuses: [],
          selectedWorkitemIds: [],
          splitWorkitemId: null,
          splitParentWorkitemId: null,
          viewTab: 'workitems',
        },
        scrollTop: 137,
      },
      history: [],
      forwardHistory: [],
    }));

    const callOrder: string[] = [];
    const originalSetCategory = useApp.getState().setCategory;
    const originalSelect = useApp.getState().select;
    useApp.setState({
      booting: false,
      category: 'Req',
      selectedId: null,
      detail: null,
      setCategory: async (category) => {
        callOrder.push(`category:${category}`);
        useApp.setState({ category, selectedId: null, detail: null });
      },
      select: async (id) => {
        callOrder.push(`select:${id}`);
        useApp.setState({ selectedId: id, detail: { workitemId: id }, loadingDetail: false });
      },
    });

    try {
      await restoreNavigation();
      expect(callOrder).toEqual(['category:Bug', 'select:BUG-17']);
      expect(useUi.getState().view).toBe('requirement');
      expect(useUi.getState().chain).toEqual([crumb]);
      expect(useUi.getState().restoreScroll).toBe(137);

      useUi.setState({ view: 'overview' });
      await restoreNavigation();
      expect(useUi.getState().view).toBe('overview');
      expect(callOrder).toEqual(['category:Bug', 'select:BUG-17']);
    } finally {
      useApp.setState({ setCategory: originalSetCategory, select: originalSelect });
    }
  });
});

describe('build workbench navigation', () => {
  it('keeps an internal back stack and closes only after returning from the root page', () => {
    useUi.getState().openBuildWorkbench(target, 'parameters');
    expect(useUi.getState().buildWorkbenchHistory).toEqual(['runs']);

    useUi.getState().navigateBuildWorkbench('logs');
    expect(useUi.getState().buildWorkbenchHistory).toEqual(['runs', 'parameters']);

    useUi.getState().backBuildWorkbench();
    expect(useUi.getState().buildWorkbenchPage).toBe('parameters');
    expect(useUi.getState().buildWorkbenchOpen).toBe(true);

    useUi.getState().backBuildWorkbench();
    expect(useUi.getState().buildWorkbenchPage).toBe('runs');
    expect(useUi.getState().buildWorkbenchOpen).toBe(true);

    useUi.getState().backBuildWorkbench();
    expect(useUi.getState().buildWorkbenchOpen).toBe(false);
    expect(useUi.getState().buildWorkbenchTarget).toBeNull();
  });

  it('gives direct parameter/log entry a return path to the run list', () => {
    useUi.getState().openBuildWorkbench(target, 'logs');
    expect(useUi.getState().buildWorkbenchPage).toBe('logs');
    expect(useUi.getState().buildWorkbenchHistory).toEqual(['runs']);

    useUi.getState().closeBuildWorkbench();
    expect(useUi.getState().buildWorkbenchTarget).toBeNull();
    expect(useUi.getState().buildWorkbenchHistory).toEqual([]);
  });
});

describe('theme system preference and mode management', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('sets explicit theme (dark / light) and updates document class and localStorage', () => {
    useUi.getState().setTheme('light');
    expect(useUi.getState().theme).toBe('light');
    expect(useUi.getState().resolvedTheme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('nervd-theme')).toBe('light');

    useUi.getState().setTheme('dark');
    expect(useUi.getState().theme).toBe('dark');
    expect(useUi.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('nervd-theme')).toBe('dark');
  });

  it('resolves system theme mode dynamically', () => {
    // Mock matchMedia for system dark preference
    window.matchMedia = ((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as any;

    useUi.getState().setTheme('system');
    expect(useUi.getState().theme).toBe('system');
    expect(useUi.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('nervd-theme')).toBe('system');
  });

  it('cycles through theme modes with toggleTheme', () => {
    // Mock system theme as dark
    window.matchMedia = ((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as any;

    // Start at system mode (system = dark)
    useUi.getState().setTheme('system');
    expect(useUi.getState().theme).toBe('system');
    expect(useUi.getState().resolvedTheme).toBe('dark');

    // 1st toggle: from system (currently dark), switch to opposite (light)
    useUi.getState().toggleTheme();
    expect(useUi.getState().theme).toBe('light');
    expect(useUi.getState().resolvedTheme).toBe('light');

    // 2nd toggle: from light (opposite of system), switch to explicit dark (same as system)
    useUi.getState().toggleTheme();
    expect(useUi.getState().theme).toBe('dark');
    expect(useUi.getState().resolvedTheme).toBe('dark');

    // 3rd toggle: from explicit dark (same as system), switch back to system
    useUi.getState().toggleTheme();
    expect(useUi.getState().theme).toBe('system');
    expect(useUi.getState().resolvedTheme).toBe('dark');
  });
});

