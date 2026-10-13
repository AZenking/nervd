import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/**
 * 统一页头（DESIGN.md heading-2 规格）：
 * - breadcrumb 槽：面包屑行（含返回）+ 右侧动作，标题行紧凑——标题/徽章/描述同行截断；
 * - eyebrow 槽（legacy）：eyebrow + 大标题 + 描述 + 操作区。
 * h1 字号 / 字距由 theme.css base 层统一（1.625rem / -0.039rem / 700）。
 */
export function PageHeader({
  breadcrumb,
  eyebrow,
  title,
  /** 覆写 h1 的类（如详情页 24px/medium 标题） */
  titleClassName,
  titleBadge,
  description,
  actions,
  meta,
  className,
}: {
  breadcrumb?: React.ReactNode;
  eyebrow?: string;
  title: React.ReactNode;
  /** 覆写 h1 的类（如详情页 24px/medium 标题） */
  titleClassName?: string;
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
          {/* B2：不再覆写字号，页面标题统一走 theme.css base h1（26px/700/−0.625px） */}
          <h1 className={titleClassName}>{title}</h1>
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

/**
 * 吸顶页头统一形态（迭代页 / 需求详情共用）：
 * - 顶部留白由页头自身 pt-5 提供（滚动容器不再带 pt），top-0 严格贴住可视顶部——
 *   修复 WKWebView 下吸顶后顶部留出一条滚动容器 padding 缝隙、滚过的内容从缝隙露出的缺陷；
 * - 负水平边距对冲滚动容器的 px-*，背景与下边框全宽贴边，窄屏下滚动内容不会从页头两侧穿出。
 */
export const STICKY_PAGE_HEADER_CLASS =
  'sticky top-0 z-10 -mx-5 border-b border-border bg-background px-5 pt-5 pb-4 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10';

/** 便捷导出：状态徽章保持同一变体 */
export function PageStatusBadge({ children }: { children: React.ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>;
}
