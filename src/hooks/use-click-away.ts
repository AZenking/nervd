import { useEffect, useRef } from 'react';

/**
 * 点击外部自动关闭的 Hook（参考 @uidotdev/usehooks 设计精髓）：
 * 1. 采用 Ref 引用挂载节点，支持单元素或多元素排除（比如点击触发按钮时不关闭）。
 * 2. 同时捕获 mousedown 与 touchstart，适配所有指针事件。
 * 3. 使用 Ref 缓存回调，防止由于外部函数重建而造成事件反复重绑。
 */
export function useClickAway<T extends HTMLElement = HTMLElement>(
  cb: (e: MouseEvent | TouchEvent) => void,
  ignoredElements?: Array<HTMLElement | null | React.RefObject<HTMLElement | null>>,
): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  const refCb = useRef(cb);

  useEffect(() => {
    refCb.current = cb;
  }, [cb]);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      const element = ref.current;
      if (!element) return;

      const target = e.target as Node | null;
      if (!target) return;

      // 如果点击在当前挂载元素内部，不触发
      if (element.contains(target)) return;

      // 如果点击在忽略元素列表内（例如对应的 Trigger 按钮），不触发
      if (ignoredElements && ignoredElements.length > 0) {
        for (const item of ignoredElements) {
          const el = item && 'current' in item ? item.current : item;
          if (el && el.contains(target)) return;
        }
      }

      refCb.current(e);
    };

    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);

    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [ignoredElements]);

  return ref;
}
