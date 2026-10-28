import { useEffect, useRef } from 'react';

/**
 * 安全的 DOM 事件监听 Hook（参考 @uidotdev/usehooks 设计精髓）：
 * 1. 采用 Ref 缓存 listener 回调，保证回调函数即使频繁变化也不会导致 DOM 事件被无谓地解绑与重绑。
 * 2. 具备 SSR / 非浏览器环境容错（检查 target 是否存在 addEventListener）。
 * 3. 严格遵循组件生命周期，卸载时或 target 变化时自动安全清理。
 */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  element?: undefined,
  options?: boolean | AddEventListenerOptions,
): void;

export function useEventListener<K extends keyof DocumentEventMap>(
  eventName: K,
  handler: (event: DocumentEventMap[K]) => void,
  element: Document,
  options?: boolean | AddEventListenerOptions,
): void;

export function useEventListener<
  K extends keyof HTMLElementEventMap,
  T extends HTMLElement = HTMLElement,
>(
  eventName: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  element: T | null | React.RefObject<T | null>,
  options?: boolean | AddEventListenerOptions,
): void;

export function useEventListener<T extends Event = Event>(
  eventName: string,
  handler: (event: T) => void,
  element?: EventTarget | null | React.RefObject<EventTarget | null>,
  options?: boolean | AddEventListenerOptions,
): void;

export function useEventListener(
  eventName: string,
  handler: (event: any) => void,
  element?: EventTarget | null | React.RefObject<EventTarget | null>,
  options?: boolean | AddEventListenerOptions,
) {
  // 使用 useRef 保证每次事件触发时调用的都是最新传进来的 handler
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    // 默认 target 为 window
    const targetElement: EventTarget | null =
      element === undefined
        ? (typeof window !== 'undefined' ? window : null)
        : element && 'current' in element
        ? element.current
        : element;

    if (!targetElement?.addEventListener) return;

    const eventListener = (event: Event) => savedHandler.current(event);

    targetElement.addEventListener(eventName, eventListener, options);

    return () => {
      targetElement.removeEventListener(eventName, eventListener, options);
    };
  }, [eventName, element, options]);
}
