import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/store/app';

export interface UseClipboardOptions {
  /** 成功提示文案或根据复制内容生成的文案 */
  successMessage?: string | ((text: string) => string);
  /** 失败提示文案 */
  errorMessage?: string;
  /** 反馈持续毫秒数，默认 1500ms */
  duration?: number;
  /** 是否弹出 Toast，默认 true */
  showToast?: boolean;
}

/** 拷贝到剪贴板；兼容 Tauri WKWebView 及非安全上下文环境 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 降级尝试 execCommand
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * 统一剪贴板 Hook：
 * - 自动处理降级兜底方案与异常捕获
 * - 维护 copied 状态与定时复位
 * - 可选触发统一的 Toast 反馈
 */
export function useClipboard(options: UseClipboardOptions = {}) {
  const {
    successMessage = '已复制到剪贴板',
    errorMessage = '复制失败',
    duration = 1500,
    showToast = true,
  } = options;

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), duration);
    return () => window.clearTimeout(timer);
  }, [copied, duration]);

  const copy = useCallback(
    async (text: string, customSuccess?: string) => {
      if (!text) return false;
      const ok = await copyTextToClipboard(text);
      const setToast = useApp.getState().setToast;
      if (ok) {
        setCopied(true);
        if (showToast) {
          const msg = customSuccess
            ?? (typeof successMessage === 'function' ? successMessage(text) : successMessage);
          setToast({ text: msg, kind: 'ok' });
        }
      } else {
        setCopied(false);
        if (showToast) {
          setToast({ text: errorMessage, kind: 'fail' });
        }
      }
      return ok;
    },
    [errorMessage, showToast, successMessage],
  );

  return { copy, copied };
}
