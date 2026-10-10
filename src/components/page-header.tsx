import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/**
 * 统一页头（DESIGN.md heading-2 规格）：
 * - breadcrumb 槽（Notion 式）：面包屑行（含返回）+ 右侧动作，标题行紧凑——标题/徽章/描述同行截断；
 * - eyebrow 槽（legacy）：eyebrow + 大标题 + 描述 + 操作区。
 * h1 字号 / 字距由 theme.css base 层统一（1.625rem / -0.039rem / 700）。
 */
export function PageHeader({
  breadcrumb,
  eyebrow,
  title,
  titleBadge,
  description,
  actions,
  meta,
  className,
}: {
  breadcrumb?: React.ReactNode;
  eyebrow?: string;
  title: React.ReactNode;
  titleBadge?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** 标题下方的一行元信息（如需求详情的 编号/处理人/更新） */
  meta?: React.ReactNode;
  className?: string;
}) {
  if (breadcrumb) {
    return (
      <header className={cn('flex flex-col gap-2', className)}>
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="min-w-0">{breadcrumb}</div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {titleBadge}
          {description && (
            <span className="min-w-0 truncate text-xs text-muted-foreground">{description}</span>
          )}
        </div>
        {meta && <div className="border-t pt-3">{meta}</div>}
      </header>
    );
  }
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="mt-1 flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate">{title}</span>
            {titleBadge}
          </h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && <div className="border-t pt-3">{meta}</div>}
    </header>
  );
}

/** 便捷导出：状态徽章保持同一变体 */
export function PageStatusBadge({ children }: { children: React.ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>;
}
