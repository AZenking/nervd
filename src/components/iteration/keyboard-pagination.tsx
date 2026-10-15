import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface KeyboardPaginationProps {
  /** 当前页码（1-indexed） */
  pageIndex: number;
  /** 总页数 */
  totalPages: number;
  /** 页码变更回调 */
  onPageChange: (page: number) => void;
  /** 是否展示键盘 [ / ] 快捷键提示 */
  showKeyboardHints?: boolean;
  /** 外层样式 */
  className?: string;
}

/**
 * 全键盘感知紧凑分页器（符合 Deep Linear Alignment 规范）：
 * - 紧凑小号无边框/轮廓按钮
 * - 等宽数字展示（tabular-nums font-mono）
 * - 可选键盘快捷键标识（kbd）
 */
export function KeyboardPagination({
  pageIndex,
  totalPages,
  onPageChange,
  showKeyboardHints = false,
  className,
}: KeyboardPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {showKeyboardHints && (
        <span className="text-[11px] text-muted-foreground select-none hidden sm:inline-block">
          翻页：<kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/60 border border-border/60">[</kbd> / <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/60 border border-border/60">]</kbd>
        </span>
      )}
      <Button
        variant="outline"
        size="xs"
        disabled={pageIndex <= 1}
        onClick={() => onPageChange(Math.max(1, pageIndex - 1))}
      >
        上一页
      </Button>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {pageIndex} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="xs"
        disabled={pageIndex >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, pageIndex + 1))}
      >
        下一页
      </Button>
    </div>
  );
}
