import { cn } from '@/lib/utils';

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
      <header
        data-tauri-drag-region
        className={cn('flex flex-col gap-2 select-none', className)}
      >
        <div className="flex min-w-0 items-center justify-between gap-4" data-tauri-drag-region>
          <div className="min-w-0 flex items-center" data-no-drag>{breadcrumb}</div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2" data-no-drag>{actions}</div>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2" data-tauri-drag-region>
          {/* B2：不再覆写字号，页面标题统一走 theme.css base h1（26px/700/−0.625px） */}
          <h1 className={cn('select-none cursor-default', titleClassName)}>{title}</h1>
          <div data-no-drag>{titleBadge}</div>
          {description && (
            <span className="min-w-0 truncate text-xs text-muted-foreground select-none cursor-default">
              {description}
            </span>
          )}
        </div>
        {meta && <div className="border-t pt-3" data-no-drag>{meta}</div>}
      </header>
    );
  }
  return (
    <header
      data-tauri-drag-region
      className={cn('flex flex-col gap-3 select-none', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4" data-tauri-drag-region>
        <div className="min-w-0" data-tauri-drag-region>
          {eyebrow && <p className="eyebrow select-none cursor-default">{eyebrow}</p>}
          <h1 className="mt-1 flex flex-wrap items-center gap-2 select-none cursor-default">
            <span className="min-w-0 truncate">{title}</span>
            <span data-no-drag>{titleBadge}</span>
          </h1>
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground select-none cursor-default">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2" data-no-drag>{actions}</div>}
      </div>
      {meta && <div className="border-t pt-3" data-no-drag>{meta}</div>}
    </header>
  );
}

/**
 * 吸顶页头统一形态（迭代页 / 需求详情共用）：
 * - 顶部留白由页头自身 pt-8 提供（包含 macOS 沉浸式窗口红绿灯避让与安全边距）；
 * - 负水平边距对冲滚动容器的 px-*，背景与下边框全宽贴边，窄屏下滚动内容不会从页头两侧穿出。
 */
export const STICKY_PAGE_HEADER_CLASS =
  'sticky top-0 z-10 -mx-5 border-b border-border bg-background px-5 pt-8 pb-3.5 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10';
