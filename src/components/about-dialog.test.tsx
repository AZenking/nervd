import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';
import { AboutDialog } from './about-dialog';

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

describe('AboutDialog 关闭按钮', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUi.setState({ aboutOpen: true, shortcutsOpen: false });
    useApp.setState({
      settings: {
        hasPat: true,
        organizationId: 'org_test',
        defaultSpaceIdentifier: 'space_test',
        linkPattern: '',
        watchedRepos: [],
        allowWriteOps: false,
        workitemRepos: {},
      } as never,
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
  });

  it('点击右上角关闭按钮时关闭弹窗（aboutOpen 置为 false）', () => {
    act(() => {
      root!.render(<AboutDialog />);
    });

    const closeTrigger = document.querySelector('[data-slot="modal-close-trigger"]');
    expect(closeTrigger).not.toBeNull();

    act(() => {
      (closeTrigger as HTMLElement).click();
    });

    expect(useUi.getState().aboutOpen).toBe(false);
  });
});
