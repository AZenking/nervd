import { useUi } from '@/store/ui';

export const WORKSPACE_OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-base-ui-popover-popup]';

export function isEditing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]'));
}

export function hasWorkspaceOverlay(): boolean {
  return [...document.querySelectorAll<HTMLElement>(WORKSPACE_OVERLAY_SELECTOR)]
    .some((el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true' && !el.hasAttribute('data-closed'));
}

/** Route menu and keyboard commands through the same existing controls. */
export function performWorkspaceAction(command: string): boolean {
  if (hasWorkspaceOverlay()) return false;
  const ui = useUi.getState();
  if (command === 'back' || command === 'forward') {
    if (isEditing(document.activeElement)) return false;
    if (command === 'back') ui.back();
    else ui.forward();
    return true;
  }
  const root = document.querySelector<HTMLElement>('[data-workspace-content]');
  if (command === 'find') {
    const input = root?.querySelector<HTMLInputElement>('[data-workspace-search], input[type="search"], input[placeholder*="搜索"]');
    if (input) { input.focus(); input.select(); }
    else ui.setCommandOpen(true);
    return true;
  }
  if (command === 'refresh') {
    if (isEditing(document.activeElement)) return false;
    const button = root?.querySelector<HTMLButtonElement>('button[data-workspace-refresh], button[aria-label="刷新"], button[aria-label="刷新工作项"]');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
    button.click();
    return true;
  }
  return false;
}
