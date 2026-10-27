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

/**
 * 桌面端窗口顶部安全边缘拖拽能力：
 * 配合 macOS Overlay titleBarStyle，仅在点击应用最顶部的 8px 系统边缘微缝时，
 * 允许用户抓取窗口边缘进行拖拽。
 *
 * 架构防线：
 * 1. 严禁在 JavaScript 层全局监听 dblclick 调用 toggleMaximize()：
 *    macOS 系统本身会对标题栏拖拽区（data-tauri-drag-region）原生执行连按缩放，
 *    若在 JS 再次调用，会在毫秒级内产生系统动作与 JS 动作冲突，导致“全屏 -> 放大 -> 又全屏”严重震颤。
 * 2. 严禁在带有 data-tauri-drag-region 的元素上重复发起 startDragging()：
 *    Tauri Webview 底层已有原生事件挂钩，JS 再次调用会导致拖拽锁冲突。
 */
export function useWindowDrag() {
  React.useEffect(() => {
    if (!isTauri()) return;

    const handleMouseDown = async (e: MouseEvent) => {
      // 仅限鼠标主键（左键）
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 交互式元素绝不拖拽
      if (target.closest(INTERACTIVE_SELECTOR)) return;

      // 若元素已声明 data-tauri-drag-region，由 Tauri 底层原生接管，JS 不介入
      if (target.closest('[data-tauri-drag-region]')) return;

      // 兜底保护：当在应用最顶部 38px（标准 macOS 沉浸式 Titlebar 高度）内的非交互式空白区域点击时，
      // 若该区域未显式声明 data-tauri-drag-region，依然触发窗口拖拽
      if (e.clientY <= 38) {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().startDragging();
        } catch {
          // 静默降级
        }
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);
}
