import { useCallback, useEffect, useRef, useState } from 'react';
import { useUi } from '@/store/ui';
import { useEventListener } from '@/hooks/use-event-listener';

export interface UseKeyboardListNavigationOptions<T = string> {
  /** 扁平可见项序列 */
  items: T[];
  /** 提取项 ID，默认作为字符串直接处理 */
  getId?: (item: T) => string;
  /** 是否禁用键盘监听 */
  disabled?: boolean;
  /** 按下 Enter 时触发 */
  onSelect?: (item: T, index: number) => void;
  /** 自定义按键处理器，返回 true 则阻止默认行为 */
  onKeyDown?: (e: KeyboardEvent, currentItem: T | undefined, currentIndex: number) => boolean | void;
}

/** 焦点是否在可编辑控件内 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * 列表全键盘导航与光标跟随 Hook（Linear 核心操作手感）：
 * - j / ↓ 与 k / ↑ 循环切换选中光标
 * - 自动平滑滚动对齐（scrollIntoView { block: 'nearest' }）
 * - 智能焦点避让（输入框、弹窗浮层让路）
 * - 列表动态过滤/分页时自动收敛光标索引
 */
export function useKeyboardListNavigation<T = string>(
  options: UseKeyboardListNavigationOptions<T>,
) {
  const {
    items,
    getId = (item) => String(item),
    disabled = false,
    onSelect,
    onKeyDown,
  } = options;

  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  const applyCursor = useCallback((next: number | ((prev: number) => number)) => {
    setCursor((prev) => {
      const val = typeof next === 'function' ? next(prev) : next;
      cursorRef.current = val;
      return val;
    });
  }, []);

  // 列表长度变动时自动收敛光标至合法边界
  useEffect(() => {
    applyCursor((prev) => (items.length ? Math.min(prev, items.length - 1) : 0));
  }, [items, applyCursor]);

  // 光标变化时滚动跟随
  useEffect(() => {
    const currentItem = items[cursor];
    if (currentItem) {
      const id = getId(currentItem);
      rowRefs.current.get(id)?.scrollIntoView({ block: 'nearest' });
    }
  }, [cursor, items, getId]);

  // 全局键盘监听（使用 useEventListener 避免无谓重绑与内存泄漏）
  useEventListener('keydown', (e: KeyboardEvent) => {
    if (disabled) return;
    if (isEditableTarget(e.target)) return;
    if (useUi.getState().commandOpen) return;

    const currentIndex = cursorRef.current;
    const currentItem = items[currentIndex];

    // 先允许外部自定义按键拦截
    if (onKeyDown) {
      const handled = onKeyDown(e, currentItem, currentIndex);
      if (handled) return;
    }

    // j / ↓ 下一项
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      applyCursor((prev) => (items.length ? (prev + 1) % items.length : 0));
      return;
    }

    // k / ↑ 上一项
    if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      applyCursor((prev) => (items.length ? (prev - 1 + items.length) % items.length : 0));
      return;
    }

    // Enter 激活当前行
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'BUTTON' || target.tagName === 'A')) {
        return; // 交还原生按钮或链接行为
      }
      if (currentItem && onSelect) {
        e.preventDefault();
        onSelect(currentItem, currentIndex);
      }
    }
  });

  /** 注册行元素引用 */
  const registerRowRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      rowRefs.current.set(id, el);
    } else {
      rowRefs.current.delete(id);
    }
  }, []);

  return {
    cursor,
    setCursor: applyCursor,
    registerRowRef,
    currentItem: items[cursor],
  };
}
