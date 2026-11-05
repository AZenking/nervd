import { useUi } from '@/store/ui';

export const WORKSPACE_OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-base-ui-popover-popup]';

export function isEditing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]'));
}

/**
 * 收集当前可见浮层元素（排除 hidden / aria-hidden / 关闭动画中的 data-closed）。
 * 常驻页面内的原生集合容器（如迭代列表 HeroUI ListBox 渲染的 role="listbox"）不是浮层：
 * 仅统计 portal 到工作区内容根（[data-workspace-content]）之外的浮层；
 * 已被 inert 化的元素（React Aria 弹层开启时对底层内容的处理）同样不算可见。
 */
function visibleWorkspaceOverlays(): HTMLElement[] {
  const workspaceRoot = document.querySelector<HTMLElement>('[data-workspace-content]');
  return [...document.querySelectorAll<HTMLElement>(WORKSPACE_OVERLAY_SELECTOR)]
    .filter((el) => !el.hidden
      && el.getAttribute('aria-hidden') !== 'true'
      && !el.hasAttribute('data-closed')
      && !(workspaceRoot && workspaceRoot.contains(el))
      && !el.closest('[inert]'));
}

export function hasWorkspaceOverlay(): boolean {
  return visibleWorkspaceOverlays().length > 0;
}

/**
 * 可见浮层是否「仅有」工作项 Peek 抽屉（Dialog 带 data-workspace-peek-drawer 标记）。
 * 迭代列表在该态下放行 j/k 连续检视导航；Esc 与其余按键仍由抽屉及上层浮层原生接管。
 */
export function isWorkspacePeekDrawerOnly(): boolean {
  const overlays = visibleWorkspaceOverlays();
  return overlays.length === 1 && overlays[0].hasAttribute('data-workspace-peek-drawer');
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
