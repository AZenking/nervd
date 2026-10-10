import type { ReactNode } from 'react';

/**
 * Notion 式区块标题：小字号标题 + 计数/提示 + 右侧动作，底部 hairline 分割线。
 * 与 OverviewView 的 SectionHead 同形态，供各视图平铺化后统一使用。
 */
export function SectionHeader({
  title,
  count,
  hint,
  action,
}: {
  title: ReactNode;
  count?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
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
