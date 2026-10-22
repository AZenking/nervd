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
