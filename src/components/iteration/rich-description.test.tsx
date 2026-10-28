import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
const app = vi.hoisted(() => ({ settings: { allowWriteOps: true }, setToast: vi.fn(), updateWorkitemDescriptionOptimistic: vi.fn() }));
vi.mock('@/store/app', () => ({ useApp: () => app }));
vi.mock('@/components/ui/rich-editor', () => ({ RichEditor: ({ content, editable, onChange }: { content: string; editable: boolean; onChange?: (value: string) => void }) => <textarea value={content} readOnly={!editable} onChange={(e) => onChange?.(e.target.value)} /> }));
import { RichDescription } from './rich-description';

describe('description edit session', () => {
  it('keeps draft and edit mode across optimistic updates and failed rollback', async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    let resolveSave: (ok: boolean) => void = () => {};
    app.updateWorkitemDescriptionOptimistic.mockImplementation(() => new Promise<boolean>((resolve) => { resolveSave = resolve; }));
    try {
      await act(() => root.render(<RichDescription raw="original" workitemId="one" />));
      await act(() => host.querySelector<HTMLButtonElement>('button[title^="编辑描述"]')!.click());
      const draft = host.querySelector('textarea')!;
      await act(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(draft, '<p>my draft</p>');
        draft.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const save = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('保存描述'))!;
      await act(() => save.click());
      await act(() => root.render(<RichDescription raw="optimistic" workitemId="one" />));
      expect(host.querySelector('textarea')?.value).toBe('<p>my draft</p>');
      await act(() => { resolveSave(false); });
      await act(() => root.render(<RichDescription raw="original" workitemId="one" />));
      expect(host.querySelector('textarea')?.value).toBe('<p>my draft</p>');
      expect([...host.querySelectorAll('button')].some((button) => button.textContent?.includes('保存描述'))).toBe(true);
    } finally {
      await act(() => root.unmount()); host.remove();
    }
  });
});
