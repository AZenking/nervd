import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface OverflowTooltipProps {
  /** 文本内容 */
  text?: string;
  /** 可选自定义 Tooltip 悬浮展示内容（缺省使用 text 或 children 中的纯文本） */
  tooltip?: ReactNode;
  /** 子元素（若提供则作为文本/内容渲染，缺省为 text） */
  children?: ReactNode;
  /** 文本容器类名（默认包含 truncate） */
  className?: string;
  /** Tooltip 弹出方向 */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Tooltip 对齐方式 */
  align?: 'start' | 'center' | 'end';
  /** Tooltip 侧边偏移量 */
  sideOffset?: number;
  /** Tooltip 气泡容器类名 */
  contentClassName?: string;
  /** 容器渲染 HTML 标签，默认 span */
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'div' | 'p';
}

/**
 * 文本溢出优化展示组件：
 * 仅在文本由于容器宽度受限而发生截断（scrollWidth > clientWidth）时触发 Tooltip；
 * 未截断时保持轻量无气泡，兼顾整洁与超长标题的完整可读性。
 */
export function OverflowTooltip({
  text,
  tooltip,
  children,
  className,
  side = 'top',
  align = 'start',
  sideOffset = 4,
  contentClassName,
  as: Component = 'span',
}: OverflowTooltipProps) {
  const ref = useRef<HTMLElement>(null);
  const [overflowed, setOverflowed] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = ref.current;
    if (el) {
      // 容差 1px，避免浮点/子像素计算偏差
      setOverflowed(el.scrollWidth > el.clientWidth + 1);
    }
  }, []);

  const content = children ?? text;
  const tipText = tooltip ?? (typeof children === 'string' ? children : text);

  return (
    <Tooltip open={overflowed ? undefined : false}>
      <TooltipTrigger
        render={
          <Component
            ref={ref as any}
            className={cn('min-w-0 truncate', className)}
            onMouseEnter={checkOverflow}
            onFocus={checkOverflow}
          />
        }
      >
        {content}
      </TooltipTrigger>
      {overflowed && tipText && (
        <TooltipContent
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            'max-w-md break-words whitespace-normal text-xs leading-relaxed font-normal shadow-lg',
            contentClassName,
          )}
        >
          {tipText}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
