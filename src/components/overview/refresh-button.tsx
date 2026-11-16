import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 总览页统一刷新按钮（审计 §2.4 P1-46：同一页面 3 种刷新形态收口）。
 *
 * 统一约定：
 * - variant 固定 ghost、size 固定 sm（iconOnly 时 icon-sm），不再各写 size-7 / size-8 / px-1.5；
 * - 文案固定「刷新 / 重试」，进行中统一追加「中…」；
 * - 旋转反馈统一由 `loading` 驱动 RefreshCwIcon，不再各地手写 animate-spin 条件。
 */
export interface RefreshButtonProps {
  /** 可见文案；iconOnly 时同时作为无障碍名 */
  label?: string;
  /** 需要更完整的无障碍名（如「重试 xxx CI 查询」）时覆盖 */
  ariaLabel?: string;
  onPress: () => void;
  /** 刷新进行中：图标旋转 + aria-busy，并暂时禁用重复点击 */
  loading?: boolean;
  iconOnly?: boolean;
  className?: string;
}

export function RefreshButton({
  label = '刷新',
  ariaLabel,
  onPress,
  loading = false,
  iconOnly = false,
  className,
}: RefreshButtonProps) {
  const text = loading ? `${label}中…` : label;

  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon-sm' : 'sm'}
      aria-label={iconOnly ? (ariaLabel ?? text) : ariaLabel}
      aria-busy={loading || undefined}
      isDisabled={loading}
      onPress={onPress}
      className={cn(
        'gap-1.5 text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <RefreshCwIcon className={cn('size-3.5 shrink-0', loading && 'animate-spin')} aria-hidden="true" />
      {!iconOnly && <span>{text}</span>}
    </Button>
  );
}