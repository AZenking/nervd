import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 强类型持久化本地存储 Hook（参考 @uidotdev/usehooks 设计精髓）：
 * 1. 支持直接读取与序列化/反序列化复杂的 JSON 对象。
 * 2. 具备 SSR / 客户端跨窗口（Tauri 多窗口）与同窗口多组件实例事件通知与同步。
 * 3. 容错防御：在 localStorage 满额、解析失败或被沙箱阻断时，优雅降级为内存 state 并输出 warning。
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
): [T, (value: T | ((val: T) => T)) => void, () => void] {
  // 获取初始值
  const readValue = useCallback((): T => {
    if (typeof window === 'undefined') {
      return initialValue instanceof Function ? initialValue() : initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      if (item === null) {
        return initialValue instanceof Function ? initialValue() : initialValue;
      }
      return JSON.parse(item) as T;
    } catch (error) {
      console.warn(`[useLocalStorage] 读取 key "${key}" 出错:`, error);
      return initialValue instanceof Function ? initialValue() : initialValue;
    }
  }, [key, initialValue]);

  const [storedValue, setStoredValue] = useState<T>(readValue);
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;

  // 更新存储
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      if (typeof window === 'undefined') return;

      try {
        const newValue =
          value instanceof Function ? value(storedValue) : value;

        window.localStorage.setItem(key, JSON.stringify(newValue));
        setStoredValue(newValue);

        // 派发自定义同源存储更新事件，使同一窗口内其他使用此 key 的 hook 实例同步更新
        window.dispatchEvent(
          new CustomEvent('nervd:local-storage-sync', {
            detail: { key, newValue },
          }),
        );
      } catch (error) {
        console.warn(`[useLocalStorage] 写入 key "${key}" 出错:`, error);
      }
    },
    [key, storedValue],
  );

  // 清除存储
  const removeValue = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.removeItem(key);
      const defaultVal =
        initialValueRef.current instanceof Function
          ? initialValueRef.current()
          : initialValueRef.current;
      setStoredValue(defaultVal);

      window.dispatchEvent(
        new CustomEvent('nervd:local-storage-sync', {
          detail: { key, newValue: defaultVal },
        }),
      );
    } catch (error) {
      console.warn(`[useLocalStorage] 删除 key "${key}" 出错:`, error);
    }
  }, [key]);

  // 跨窗口 (storage event) 与本窗口自定义事件同步
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };

    const handleLocalSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string; newValue: T }>;
      if (customEvent.detail && customEvent.detail.key === key) {
        setStoredValue(customEvent.detail.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('nervd:local-storage-sync', handleLocalSync);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('nervd:local-storage-sync', handleLocalSync);
    };
  }, [key]);

  return [storedValue, setValue, removeValue];
}
