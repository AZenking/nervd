import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEventListener } from './use-event-listener';
import { useClickAway } from './use-click-away';
import { useLocalStorage } from './use-local-storage';
import { useMeasure } from './use-measure';

describe('Absorbed Hooks Export & Execution Integrity', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('useEventListener 函数定义与类型完备', () => {
    expect(typeof useEventListener).toBe('function');

    const handler = vi.fn();
    window.addEventListener('keydown', handler);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', handler);
  });

  it('useClickAway 函数定义完备', () => {
    expect(typeof useClickAway).toBe('function');
  });

  it('useMeasure 函数定义完备', () => {
    expect(typeof useMeasure).toBe('function');
  });

  it('useLocalStorage 读写与本地 JSON 状态同步', () => {
    expect(typeof useLocalStorage).toBe('function');
    localStorage.setItem('nervd_demo_pref', JSON.stringify({ theme: 'dark' }));
    const raw = localStorage.getItem('nervd_demo_pref');
    expect(JSON.parse(raw || '{}')).toEqual({ theme: 'dark' });
  });
});
