import * as React from 'react';
import { ProgressBar, Label } from '@heroui/react';
import { cn } from '@/lib/utils';

export interface StartupSplashProps extends React.HTMLAttributes<HTMLDivElement> {
  fading?: boolean;
}

/**
 * 首次启动 / 冷启动居中 Logo 遮罩
 * 包含圆角图标、HeroUI 原生 ProgressBar + Label 进度条指示及渐隐退出状态。
 * 严格遵循 HeroUI v3 规范，零自定义 CSS 复写。
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
        className="relative flex aspect-square size-[76px] items-center justify-center rounded-[18px] bg-card border border-border/50 shadow-2xl shadow-black/30 dark:shadow-black/70 overflow-hidden"
      >
        <img
          src="/nervd-logo.png"
          alt="nervd logo"
          fetchPriority="high"
          loading="eager"
          className="size-full rounded-[18px] object-cover"
        />
      </div>

      <div data-no-drag className="mt-6 w-56">
        <ProgressBar
          isIndeterminate
          aria-label="正在加载 nervd..."
          size="sm"
          color="accent"
        >
          <Label className="text-xs text-muted-foreground">正在加载 nervd…</Label>
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      </div>
    </div>
  );
}
