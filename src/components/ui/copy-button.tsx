import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';

/** 拷贝到剪贴板；Tauri WKWebView 等环境 navigator.clipboard 不可用时降级 execCommand */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
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
}

/**
 * 拷贝按钮（Descriptions 值操作位 / 卡片 meta 行共用）：
 * 图标切换式反馈（复制 → 对勾 1.6s），不依赖全局状态。
 */
export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={copied ? '已复制' : label}
      title={copied ? '已复制' : label}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={() => {
        void copyToClipboard(text).then((ok) => setCopied(ok));
      }}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </button>
  );
}
