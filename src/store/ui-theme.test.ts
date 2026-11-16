import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoredTheme, getSystemTheme, initThemeListener, resolveTheme, useUi } from './ui';

describe('UI Store Theme Runtime Synchronization', () => {
  const originalMatchMedia = window.matchMedia;

  /**
   * 系统偏好模拟：'dark' / 'light' 明确声明；'none' 表示系统未声明偏好
   * （dark 与 light 两个媒体查询均不匹配），此时应用须回退深色（DESIGN §2.4）。
   */
  const mockMatchMedia = (mode: 'dark' | 'light' | 'none') => {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const createMql = (matches: boolean, media: string) => ({
      matches,
      media,
      onchange: null,
      addListener: vi.fn((cb: any) => listeners.add(cb)),
      removeListener: vi.fn((cb: any) => listeners.delete(cb)),
      addEventListener: vi.fn((event: string, cb: any) => {
        if (event === 'change') listeners.add(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: any) => {
        if (event === 'change') listeners.delete(cb);
      }),
      dispatchEvent: vi.fn(),
    });
    const darkMql = createMql(mode === 'dark', '(prefers-color-scheme: dark)') as ReturnType<
      typeof createMql
    > & { _dispatchChange: (matches: boolean) => void };
    const lightMql = createMql(mode === 'light', '(prefers-color-scheme: light)');
    // Helper to trigger media change in tests（同步两个查询的 matches，保持可再次解析）
    darkMql._dispatchChange = (matches: boolean) => {
      darkMql.matches = matches;
      lightMql.matches = !matches;
      const event = { matches, media: '(prefers-color-scheme: dark)' } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(event);
      }
    };

    window.matchMedia = vi.fn((query: string) => {
      if (query.includes('dark')) {
        return darkMql as any;
      }
      if (query.includes('light')) {
        return lightMql as any;
      }
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as any;
    }) as any;

    return darkMql;
  };

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    useUi.setState({
      theme: 'system',
      resolvedTheme: 'dark',
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("switching to 'dark' sets data-theme=\"dark\" and classList.contains('dark') === true", () => {
    useUi.getState().setTheme('dark');

    expect(useUi.getState().theme).toBe('dark');
    expect(useUi.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('nervd-theme')).toBe('dark');
  });

  it("switching to 'light' sets data-theme=\"light\" and classList.contains('dark') === false", () => {
    // First set to dark
    useUi.getState().setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Switch to light
    useUi.getState().setTheme('light');

    expect(useUi.getState().theme).toBe('light');
    expect(useUi.getState().resolvedTheme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('nervd-theme')).toBe('light');
  });

  describe('system theme resolution with mock window.matchMedia', () => {
    it('resolves system theme to dark when prefers-color-scheme is dark', () => {
      mockMatchMedia('dark');

      useUi.getState().setTheme('system');

      expect(useUi.getState().theme).toBe('system');
      expect(useUi.getState().resolvedTheme).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('nervd-theme')).toBe('system');
    });

    it('resolves system theme to light when prefers-color-scheme is light', () => {
      mockMatchMedia('light');

      useUi.getState().setTheme('system');

      expect(useUi.getState().theme).toBe('system');
      expect(useUi.getState().resolvedTheme).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem('nervd-theme')).toBe('system');
    });

    it('dynamically updates data-theme and classList when system theme changes', () => {
      const mql = mockMatchMedia('dark');
      const unlisten = initThemeListener();

      useUi.getState().setTheme('system');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Simulate system switching to light
      mql._dispatchChange(false);

      expect(useUi.getState().resolvedTheme).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      // Simulate system switching back to dark
      mql._dispatchChange(true);

      expect(useUi.getState().resolvedTheme).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      unlisten();
    });

    it('does not alter explicit user theme when system theme changes', () => {
      const mql = mockMatchMedia('dark');
      const unlisten = initThemeListener();

      // User explicitly set 'light'
      useUi.getState().setTheme('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      // System changes to dark
      mql._dispatchChange(true);

      // Explicit user preference is preserved
      expect(useUi.getState().theme).toBe('light');
      expect(useUi.getState().resolvedTheme).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      unlisten();
    });
  });

  describe('setResolvedTheme', () => {
    it('synchronizes data-theme and dark class directly', () => {
      useUi.getState().setResolvedTheme('dark');
      expect(useUi.getState().resolvedTheme).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      useUi.getState().setResolvedTheme('light');
      expect(useUi.getState().resolvedTheme).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('startup HTML and helper function contracts', () => {
    it('resolveTheme returns expected theme', () => {
      expect(resolveTheme('dark')).toBe('dark');
      expect(resolveTheme('light')).toBe('light');

      mockMatchMedia('dark');
      expect(resolveTheme('system')).toBe('dark');

      mockMatchMedia('light');
      expect(resolveTheme('system')).toBe('light');

      // 系统未声明偏好（深/浅媒体查询皆不匹配）→ 回退深色（DESIGN §2.4）
      mockMatchMedia('none');
      expect(resolveTheme('system')).toBe('dark');
    });

    it('getSystemTheme reads system preference correctly', () => {
      mockMatchMedia('dark');
      expect(getSystemTheme()).toBe('dark');

      mockMatchMedia('light');
      expect(getSystemTheme()).toBe('light');

      // 无系统偏好 / 不支持 → 回退深色（DESIGN §2.4）
      mockMatchMedia('none');
      expect(getSystemTheme()).toBe('dark');
    });

    it('getStoredTheme retrieves valid theme or defaults to system', () => {
      expect(getStoredTheme()).toBe('system');

      localStorage.setItem('nervd-theme', 'dark');
      expect(getStoredTheme()).toBe('dark');

      localStorage.setItem('nervd-theme', 'light');
      expect(getStoredTheme()).toBe('light');

      localStorage.setItem('nervd-theme', 'invalid-theme');
      expect(getStoredTheme()).toBe('system');
    });
  });
});
