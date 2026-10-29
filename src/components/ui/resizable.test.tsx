// PaneSeparator 组件测试：遵循 descriptions.test.tsx 的 createRoot + DOM 断言模式（无 @testing-library）。
// 覆盖：aria 语义（含 clamp 后的 aria-valuenow）、键盘调整建议值（growDirection / step / Shift ×4 / Home / End）、
// 双击复位、Enter/Space 无操作不阻止默认、聚焦时对全局单键快捷键的隔离（⌘ 等修饰组合仍放行）。
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaneSeparator, type PaneSeparatorProps } from './resizable';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

interface RenderResult {
  el: HTMLDivElement;
  onChange: ReturnType<typeof vi.fn>;
  onReset: ReturnType<typeof vi.fn>;
}

async function renderSeparator(overrides: Partial<PaneSeparatorProps> = {}): Promise<RenderResult> {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const props: PaneSeparatorProps = {
    'aria-label': '调整工作项列表宽度，280 到 480 像素',
    value: 360,
    min: 280,
    max: 480,
    onChange,
    onReset,
    ...overrides,
  };
  await act(() => root.render(<PaneSeparator {...props} />));
  const el = host.querySelector<HTMLDivElement>('[role="separator"]');
  expect(el).not.toBeNull();
  return { el: el!, onChange, onReset };
}

function pressKey(el: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

describe('PaneSeparator semantics', () => {
  it('exposes separator role, range attributes, accessible name and focusability', async () => {
    const { el } = await renderSeparator();
    expect(el.getAttribute('aria-orientation')).toBe('vertical');
    expect(el.getAttribute('aria-valuemin')).toBe('280');
    expect(el.getAttribute('aria-valuemax')).toBe('480');
    expect(el.getAttribute('aria-valuenow')).toBe('360');
    expect(el.getAttribute('aria-label')).toBe('调整工作项列表宽度，280 到 480 像素');
    expect(el.tabIndex).toBe(0);
  });

  it('clamps aria-valuenow into [min, max]', async () => {
    const high = await renderSeparator({ value: 999 });
    expect(high.el.getAttribute('aria-valuenow')).toBe('480');
    const low = await renderSeparator({ value: 10 });
    expect(low.el.getAttribute('aria-valuenow')).toBe('280');
  });

  it('never opts into the tauri window drag region', async () => {
    const { el } = await renderSeparator();
    expect(el.hasAttribute('data-tauri-drag-region')).toBe(false);
  });
});

describe('PaneSeparator keyboard adjustments', () => {
  it('suggests unclamped widths for arrow keys with Shift acceleration', async () => {
    const { el, onChange } = await renderSeparator();
    act(() => pressKey(el, 'ArrowRight'));
    expect(onChange).toHaveBeenNthCalledWith(1, 368);
    act(() => pressKey(el, 'ArrowLeft'));
    expect(onChange).toHaveBeenNthCalledWith(2, 352);
    act(() => pressKey(el, 'ArrowRight', { shiftKey: true }));
    expect(onChange).toHaveBeenNthCalledWith(3, 392);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('honours growDirection="left" and custom step sizes', async () => {
    const { el, onChange } = await renderSeparator({ growDirection: 'left', step: 10 });
    act(() => pressKey(el, 'ArrowLeft'));
    expect(onChange).toHaveBeenNthCalledWith(1, 370);
    act(() => pressKey(el, 'ArrowRight'));
    expect(onChange).toHaveBeenNthCalledWith(2, 350);
    act(() => pressKey(el, 'ArrowLeft', { shiftKey: true }));
    expect(onChange).toHaveBeenNthCalledWith(3, 400);
  });

  it('jumps to the range bounds with Home and End', async () => {
    const { el, onChange, onReset } = await renderSeparator();
    act(() => pressKey(el, 'Home'));
    expect(onChange).toHaveBeenNthCalledWith(1, 280);
    act(() => pressKey(el, 'End'));
    expect(onChange).toHaveBeenNthCalledWith(2, 480);
    expect(onReset).not.toHaveBeenCalled();
  });
});

describe('PaneSeparator reset and shortcut isolation', () => {
  it('resets through double click without emitting a width suggestion', async () => {
    const { el, onChange, onReset } = await renderSeparator();
    await act(() => el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps Enter and Space inert without preventing default', async () => {
    const { el, onChange, onReset } = await renderSeparator();
    const enter = pressKey(el, 'Enter');
    const space = pressKey(el, ' ');
    expect(onChange).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(false);
    expect(space.defaultPrevented).toBe(false);
  });

  it('stops plain-key propagation while focused but lets modifier combos through', async () => {
    const { el } = await renderSeparator();
    const globalKeydown = vi.fn();
    document.addEventListener('keydown', globalKeydown);
    try {
      act(() => pressKey(el, 'j'));
      act(() => pressKey(el, 'k'));
      expect(globalKeydown).not.toHaveBeenCalled();

      act(() => pressKey(el, 'k', { metaKey: true }));
      expect(globalKeydown).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', globalKeydown);
    }
  });
});
