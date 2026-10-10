import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Notion 式区块标题（三级层级体系）：
 * - h2（默认）：主要区块，15px semibold + hairline 分割；
 * - h3：次级/折叠区块，13px medium、弱化色、无分割线——明显轻一档。
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
    ? 'text-[13px] font-medium text-foreground/75'
    : 'text-[15px] font-semibold tracking-tight text-foreground';
  const Tag = (level === 'h3' ? 'h3' : 'h2') as 'h2';
  return (
    <div
      className={cn(
        'flex items-end justify-between gap-3',
        level === 'h2' && 'border-b border-border pb-2',
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <Tag className={cn('min-w-0 truncate', headingClass)}>{title}</Tag>
        {count !== undefined && <span className="shrink-0 font-mono text-xs text-muted-foreground">{count}</span>}
        {hint && <span className="min-w-0 truncate text-xs text-muted-foreground">{hint}</span>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/** Notion 式属性行：icon + 字段名（左列固定宽） + 值；行 hover 高亮 */
export function PropertyRow({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
      <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <div className="min-w-0 flex-1 truncate text-sm text-foreground">{children}</div>
    </div>
  );
}
