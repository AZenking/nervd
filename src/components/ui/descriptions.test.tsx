import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Descriptions } from './descriptions';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); });

describe('inline property saving', () => {
  it('retains draft after rejection and closes only after a successful retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    await act(() => root.render(<Descriptions variant="plain" items={[{ label: '名称', children: 'old', editable: { onSave: save } }]} />));
    await act(() => host.querySelector<HTMLButtonElement>('button[aria-label="编辑"]')!.click());
    const input = host.querySelector('input')!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'draft');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => host.querySelector<HTMLButtonElement>('button[aria-label="保存"]')!.click());
    expect(host.querySelector('input')?.value).toBe('draft');
    await act(() => host.querySelector<HTMLButtonElement>('button[aria-label="保存"]')!.click());
    expect(save).toHaveBeenNthCalledWith(2, 'draft');
    expect(host.querySelector('input')).toBeNull();
  });
  it('ignores Enter used to confirm IME composition', async () => {
    const save = vi.fn();
    await act(() => root.render(<Descriptions variant="plain" items={[{ label: '名称', children: 'old', editable: { onSave: save } }]} />));
    await act(() => host.querySelector<HTMLButtonElement>('button[aria-label="编辑"]')!.click());
    await act(() => host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
    expect(host.querySelector('input')).not.toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});
