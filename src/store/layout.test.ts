// 布局 store 契约测试：默认值 / clamp / 防御式水合 / reset / debounce 持久化。
// 初始 state 在模块加载时从 localStorage 水合一次，因此每个用例用 vi.resetModules + 动态 import 取新实例。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'nervd-layout';

const importFreshLayout = async () => {
  vi.resetModules();
  return import('./layout');
};

const readStoredRecord = (): Record<string, unknown> => {
  const raw = localStorage.getItem(STORAGE_KEY);
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as Record<string, unknown>;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('layout store constants and defaults', () => {
  it('exports pane specs and breakpoint constants matching the contract', async () => {
    const layout = await importFreshLayout();
    expect(layout.SIDEBAR_PANE).toEqual({ default: 256, min: 200, max: 300 });
    expect(layout.LIST_PANE).toEqual({ default: 360, min: 280, max: 480 });
    expect(layout.DETAIL_PANE_MIN).toBe(480);
    expect(layout.NARROW_CONTAINER_WIDTH).toBe(1180);
    expect(layout.SINGLE_COLUMN_WORKSPACE_WIDTH).toBe(760);
  });

  it('hydrates defaults when no persisted record exists', async () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    const { useLayout } = await importFreshLayout();
    expect(useLayout.getState().sidebarWidth).toBe(256);
    expect(useLayout.getState().listWidth).toBe(360);
  });
});

describe('layout store hydration', () => {
  it('adopts in-range persisted widths', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, sidebarWidth: 220, listWidth: 410,
    }));
    const { useLayout } = await importFreshLayout();
    expect(useLayout.getState().sidebarWidth).toBe(220);
    expect(useLayout.getState().listWidth).toBe(410);
  });

  it('clamps out-of-range but finite persisted widths (tolerant)', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, sidebarWidth: 999, listWidth: 1,
    }));
    const { useLayout } = await importFreshLayout();
    expect(useLayout.getState().sidebarWidth).toBe(300);
    expect(useLayout.getState().listWidth).toBe(280);
  });

  it('falls back to defaults on broken JSON, missing fields, wrong version and non-object records', async () => {
    const cases = [
      '{broken',
      'null',
      '[]',
      JSON.stringify({ version: 2, sidebarWidth: 220, listWidth: 410 }),
      JSON.stringify({ version: 1 }),
      JSON.stringify({ version: 1, sidebarWidth: '220', listWidth: true }),
      JSON.stringify({ version: 1, sidebarWidth: null, listWidth: null }),
      JSON.stringify({ version: 1, sidebarWidth: -10, listWidth: 0 }),
    ];
    for (const serialized of cases) {
      localStorage.setItem(STORAGE_KEY, serialized);
      const { useLayout } = await importFreshLayout();
      expect(useLayout.getState().sidebarWidth, serialized).toBe(256);
      expect(useLayout.getState().listWidth, serialized).toBe(360);
    }
  });

  it('validates fields independently so one bad field keeps the other', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, sidebarWidth: 'corrupt', listWidth: 410,
    }));
    const { useLayout } = await importFreshLayout();
    expect(useLayout.getState().sidebarWidth).toBe(256);
    expect(useLayout.getState().listWidth).toBe(410);
  });
});

describe('layout store setters clamp before writing state', () => {
  it('clamps out-of-range and non-finite suggestions', async () => {
    const { useLayout } = await importFreshLayout();
    useLayout.getState().setSidebarWidth(120);
    expect(useLayout.getState().sidebarWidth).toBe(200);
    useLayout.getState().setSidebarWidth(4000);
    expect(useLayout.getState().sidebarWidth).toBe(300);
    useLayout.getState().setSidebarWidth(Number.NaN);
    expect(useLayout.getState().sidebarWidth).toBe(256);
    useLayout.getState().setListWidth(100);
    expect(useLayout.getState().listWidth).toBe(280);
    useLayout.getState().setListWidth(Number.POSITIVE_INFINITY);
    expect(useLayout.getState().listWidth).toBe(360);
  });
});

describe('layout store persistence', () => {
  it('debounces writes by at least 150ms and stores the full record', async () => {
    const { useLayout } = await importFreshLayout();
    useLayout.getState().setSidebarWidth(220);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(149);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(readStoredRecord()).toEqual({ version: 1, sidebarWidth: 220, listWidth: 360 });
  });

  it('coalesces rapid drag updates into a single write with the latest value', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { useLayout } = await importFreshLayout();
    useLayout.getState().setSidebarWidth(220);
    useLayout.getState().setSidebarWidth(230);
    useLayout.getState().setSidebarWidth(210);
    vi.advanceTimersByTime(150);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(readStoredRecord()).toEqual({ version: 1, sidebarWidth: 210, listWidth: 360 });
  });

  it('skips persistence when the clamped value is unchanged', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { useLayout } = await importFreshLayout();
    useLayout.getState().setSidebarWidth(256); // 已是默认值
    vi.advanceTimersByTime(150);
    expect(setItem).not.toHaveBeenCalled();

    useLayout.getState().setSidebarWidth(999); // clamp 到 300（有变化，写入）
    vi.advanceTimersByTime(150);
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockClear();

    useLayout.getState().setSidebarWidth(4000); // clamp 后仍为 300（未变化，不写）
    vi.advanceTimersByTime(150);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('persists both panes from the latest state on a debounced write', async () => {
    const { useLayout } = await importFreshLayout();
    useLayout.getState().setSidebarWidth(210);
    useLayout.getState().setListWidth(470);
    vi.advanceTimersByTime(150);
    expect(readStoredRecord()).toEqual({ version: 1, sidebarWidth: 210, listWidth: 470 });
  });

  it('keeps the in-memory state working when storage writes throw', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const { useLayout } = await importFreshLayout();
    expect(() => useLayout.getState().setListWidth(470)).not.toThrow();
    vi.advanceTimersByTime(150);
    expect(useLayout.getState().listWidth).toBe(470);
  });
});

describe('layout store reset', () => {
  it('restores pane defaults and persists immediately without waiting for the debounce window', async () => {
    const { useLayout } = await importFreshLayout();
    useLayout.getState().setSidebarWidth(300);
    useLayout.getState().setListWidth(470);
    vi.advanceTimersByTime(150);

    useLayout.getState().resetSidebarWidth();
    expect(useLayout.getState().sidebarWidth).toBe(256);
    expect(useLayout.getState().listWidth).toBe(470);
    expect(readStoredRecord()).toEqual({ version: 1, sidebarWidth: 256, listWidth: 470 });

    useLayout.getState().resetListWidth();
    expect(useLayout.getState().listWidth).toBe(360);
    expect(readStoredRecord()).toEqual({ version: 1, sidebarWidth: 256, listWidth: 360 });
  });

  it('skips the write when the pane already sits at its default', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { useLayout } = await importFreshLayout();
    useLayout.getState().resetSidebarWidth();
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(setItem).not.toHaveBeenCalled();
  });
});
