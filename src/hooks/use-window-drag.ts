import * as React from 'react';

/** 判断当前环境是否运行在 Tauri 桌面容器内 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** 交互式控件选择器：点击这些控件或其内部元素绝不触发窗口拖拽 */
const INTERACTIVE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'a',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="switch"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[data-no-drag]',
].join(',');

/** 检查点击位置是否属于顶部安全拖拽区域或已标记的拖拽区域 */
function isDraggableElement(target: HTMLElement, e: MouseEvent): boolean {
  // 1. 优先放行任何可交互元素及其子元素
  if (target.closest(INTERACTIVE_SELECTOR)) {
    return false;
  }

  // 2. 明确标记为 tauri 拖拽区域（如页头空隙、侧栏顶部 32px 交通灯占位等）
  if (target.closest('[data-tauri-drag-region]')) {
    return true;
  }

  // 3. 点击落在应用最顶部 8px 边缘（macOS 无边框沉浸式窗口的顶部微缝）
  if (e.clientY <= 8) {
    return true;
  }

  // 4. 点击落在侧边栏顶部最外层包装画布缝隙
  if (target.getAttribute('data-slot') === 'sidebar-wrapper' && e.clientY <= 36) {
    return true;
  }

  // 5. 点击落在非交互性的页头（header）空白区域
  const header = target.closest('header');
  if (header && !header.closest(INTERACTIVE_SELECTOR)) {
    return true;
  }

  return false;
}

/**
 * 桌面端窗口全景安全边距与页头拖拽能力：
 * 配合 macOS Overlay titleBarStyle，使四周 8px 安全边距、侧栏顶部交通灯空隙与页头空白处支持顺畅拖拽窗口与双击最大化。
 */
export function useWindowDrag() {
  React.useEffect(() => {
    if (!isTauri()) return;

    const handleMouseDown = async (e: MouseEvent) => {
      // 仅限鼠标主键（左键）
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (!isDraggableElement(target, e)) return;

      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().startDragging();
      } catch {
        // 静默降级
      }
    };

    const handleDoubleClick = async (e: MouseEvent) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (!isDraggableElement(target, e)) return;

      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().toggleMaximize();
      } catch {
        // 静默降级
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('dblclick', handleDoubleClick);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('dblclick', handleDoubleClick);
    };
  }, []);
}
