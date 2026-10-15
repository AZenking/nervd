import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * 区块标题（Linear 语言：14px medium）：
 * - h2（默认）：主要区块，text-sm medium + hairline 分割；
 * - h3：次级/折叠区块，同为 text-sm medium、弱化色、无分割线——靠弱化色轻一档。
 */
export function SectionHeader({
  title,
  count,
  hint,
  action,
  level = 'h2',
}: {
  title: ReactNode;
  count?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  level?: 'h2' | 'h3';
}) {
  const headingClass = level === 'h3'
    ? 'text-sm font-medium text-foreground/75'
    : 'text-sm font-medium text-foreground';
  const Tag = (level === 'h3' ? 'h3' : 'h2') as 'h2';
  return (
    <div
      className={cn(
        'flex items-end justify-between gap-3',
        level === 'h2' && 'border-b border-border pb-2',
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <Tag className={cn('shrink-0', headingClass)}>{title}</Tag>
        {count !== undefined && <span className="shrink-0 font-mono text-xs text-muted-foreground">{count}</span>}
        {hint && <span className="min-w-0 truncate text-xs text-muted-foreground">{hint}</span>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
