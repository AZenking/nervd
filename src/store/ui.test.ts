import { beforeEach, describe, expect, it } from 'vitest';
import { useUi } from './ui';

const target = { kind: 'repo' as const, repoId: 101, title: 'nervd-web' };

beforeEach(() => {
  useUi.setState({
    buildWorkbenchOpen: false,
    buildWorkbenchTarget: null,
    buildWorkbenchPage: 'runs',
    buildWorkbenchHistory: [],
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

