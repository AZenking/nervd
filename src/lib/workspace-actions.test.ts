import { beforeEach, describe, expect, it, vi } from 'vitest';
const ui = vi.hoisted(() => ({ back: vi.fn(), forward: vi.fn(), setCommandOpen: vi.fn() }));
vi.mock('@/store/ui', () => ({ useUi: { getState: () => ui } }));
import { hasWorkspaceOverlay, isEditing, performWorkspaceAction } from './workspace-actions';

beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

describe('workspace command routing', () => {
  it('preserves editing within nested editable content', () => {
    document.body.innerHTML = '<div contenteditable="true"><span>text</span></div>';
    expect(isEditing(document.querySelector('span'))).toBe(true);
  });
  it('routes back and forward through navigation state', () => {
    performWorkspaceAction('back'); performWorkspaceAction('forward');
    expect(ui.back).toHaveBeenCalledOnce(); expect(ui.forward).toHaveBeenCalledOnce();
  });
  it('does not navigate underneath an open menu', () => {
    document.body.innerHTML = '<div role="menu"></div>';
    expect(performWorkspaceAction('back')).toBe(false);
    expect(ui.back).not.toHaveBeenCalled();
    document.querySelector('div')!.setAttribute('data-closed', '');
    expect(hasWorkspaceOverlay()).toBe(false);
  });
  it('focuses only the current workspace search', () => {
    document.body.innerHTML = '<input placeholder="搜索全局"><section data-workspace-content><input type="search"></section>';
    performWorkspaceAction('find');
    expect(document.activeElement).toBe(document.querySelector('input[type="search"]'));
  });
  it('falls back to command search when a page has no search field', () => {
    expect(performWorkspaceAction('find')).toBe(true);
    expect(ui.setCommandOpen).toHaveBeenCalledWith(true);
  });
  it('refreshes using the page control and respects its write/disabled gate', () => {
    document.body.innerHTML = '<section data-workspace-content><button aria-label="刷新"></button></section>';
    const button = document.querySelector('button')!;
    const click = vi.fn(); button.addEventListener('click', click);
    expect(performWorkspaceAction('refresh')).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    button.setAttribute('aria-disabled', 'true');
    expect(performWorkspaceAction('refresh')).toBe(false);
    expect(click).toHaveBeenCalledOnce();
  });
  it('preserves text editing on refresh and back', () => {
    document.body.innerHTML = '<input>';
    document.querySelector('input')!.focus();
    expect(performWorkspaceAction('refresh')).toBe(false);
    expect(performWorkspaceAction('back')).toBe(false);
  });
});
