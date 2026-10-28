import { useState, useCallback, useLayoutEffect, useEffect } from 'react';

export interface RectDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const defaultRect: RectDimensions = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

// 兼容 SSR 和浏览器环境的 LayoutEffect
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 测量 DOM 节点尺寸与位置的 Hook（参考 @uidotdev/usehooks 设计精髓）：
 * 1. 返回 [ref, rect]，使用 callback ref 支持动态挂载或条件渲染的 DOM 元素。
 * 2. 基于现代原生的 ResizeObserver，在桌面窗口缩放、分栏拖拽、侧栏折叠时极速响应。
 * 3. 尺寸发生微小变动时自动防抖/更新，为拓扑图谱（XYFlow）、Master-Detail 分栏提供精确像素计算。
 */
export function useMeasure<E extends HTMLElement = HTMLElement>(): [
  (node: E | null) => void,
  RectDimensions,
] {
  const [element, setElement] = useState<E | null>(null);
  const [rect, setRect] = useState<RectDimensions>(defaultRect);

  const ref = useCallback((node: E | null) => {
    setElement(node);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!element) return;

    if (typeof ResizeObserver === 'undefined') {
      const clientRect = element.getBoundingClientRect();
      setRect({
        x: clientRect.x,
        y: clientRect.y,
        width: clientRect.width,
        height: clientRect.height,
        top: clientRect.top,
        right: clientRect.right,
        bottom: clientRect.bottom,
        left: clientRect.left,
      });
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const { x, y, width, height, top, right, bottom, left } =
          entry.target.getBoundingClientRect();
        setRect({ x, y, width, height, top, right, bottom, left });
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element]);

  return [ref, rect];
}
