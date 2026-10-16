import * as React from 'react';
import { cn } from '@/lib/utils';

export interface StartupSplashProps extends React.HTMLAttributes<HTMLDivElement> {
  fading?: boolean;
}

/**
 * 首次启动 / 冷启动居中 Logo 遮罩
 * 包含圆角图标、呼吸动效、品牌紫色微光呼吸进度条及渐隐退出状态。
 */
export function StartupSplash({ fading = false, className, ...props }: StartupSplashProps) {
  return (
    <div
      data-tauri-drag-region
      role="status"
      aria-label="正在加载 nervd..."
      className={cn(
        'fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-background select-none',
        'transition-all duration-450 ease-[cubic-bezier(0.16,1,0.3,1)]',
        fading && 'pointer-events-none opacity-0 scale-95 invisible',
        className,
      )}
      {...props}
    >
      <div
        data-no-drag
        className="relative flex aspect-square size-[76px] items-center justify-center rounded-[18px] bg-card border border-border/50 shadow-2xl shadow-black/30 dark:shadow-black/70 overflow-hidden animate-pulse"
      >
        <img
          src="/nervd-logo.png"
          alt="nervd logo"
          fetchPriority="high"
          loading="eager"
          className="size-full rounded-[18px] object-cover"
        />
        {/* 底部 Linear 强调色微光条 */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
        />
      </div>
    </div>
  );
}
