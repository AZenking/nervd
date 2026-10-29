import { MoreHorizontalIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * 统一页头（Apple HIG 排列 + nervd 产品约定）：
 * 「导航与标题 → 当前范围 → 弹性空隙 → 页面操作 → 工具行」
 * - 主行：navigation（SidebarTrigger / 返回 / 面包屑）｜title（min-w-0 + truncate）｜scope（min-w-0
 *   max-w-[40%] truncate）｜flex-1 空隙｜actions（主要操作，永不收入「更多」）｜secondaryActions
 *   （宽屏内联，容器查询阈值以下收入「更多」菜单）；
 * - 主行永不换行（flex-nowrap）：空间不足时先截断标题与范围，操作区保持固定宽度、
 *   完整可达，避免长标题把整组按钮挤到第二行；
 * - toolbar 行：筛选与分类控件，位于页头底部（吸顶时保持可见，正文在下方独立滚动）；
 * - 降级顺序：先截断标题与范围名称，再把次要操作收入「更多」（页头根 @container +
 *   Tailwind v4 容器查询 @[520px] 变体），主要操作始终保持可达；
 * - h1 字号 / 字距由 theme.css base 层统一（1.625rem / -0.039rem / 700），组件不覆写字号
 *   （紧凑标题由调用方通过 titleClassName 传入，与既有页面一致）。
 *
 * secondaryActions 内联阈值取 520px（页头根 @container 的内容宽度）：
 * - ≥520px 时，扣除 SidebarTrigger（28px）+ 可截断标题（≥~120px）+ 主要操作（一个 sm 主按钮
 *   + 一个 icon-sm ≈ 140px）+ 间距后，仍能容纳 1–2 个典型次要操作（ghost icon+label ~100px/个）；
 * - <520px 时若继续内联，标题将被压缩到不可读长度，此时收入「更多」可一次性释放 ~200px；
 * - 不取 600px：桌面工作区常见宽度下（含 master-detail 分栏 ~620px 档）次要操作仍放得下，
 *   过早收纳反而降低可达性；不取 480px：两枚次要按钮内联时标题剩余空间不足。
 */

/** secondaryActions 内联展示阈值（px，页头根 @container 内容宽度）。注意：类名需保持字面量以被 Tailwind 扫描 */
const SECONDARY_INLINE_CLASSES = {
  inline: 'hidden shrink-0 items-center gap-2 @[520px]:flex',
  more: 'flex shrink-0 items-center @[520px]:hidden',
} as const;

export interface PageHeaderSecondaryAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  /** 宽屏内联渲染的自定义节点（如 WriteOpButton、SettingsAutoSaveStatus）；未提供时用默认 ghost 按钮形态（icon+label） */
  render?: React.ReactNode;
}

export interface PageHeaderProps {
  /** 导航行前缀：SidebarTrigger（窄窗口侧栏入口）/ 返回按钮 / 面包屑 */
  navigation?: React.ReactNode;
  title: React.ReactNode;
  titleBadge?: React.ReactNode;
  /** 当前范围（迭代名/分区名/分类等）；组件为其提供 min-w-0 + truncate 容器 */
  scope?: React.ReactNode;
  /** 筛选与分类行（位于页头底部，吸顶时保持可见） */
  toolbar?: React.ReactNode;
  /** 主要操作：永不收入「更多」 */
  actions?: React.ReactNode;
  /** 次要操作：宽屏内联、容器查询阈值以下收入「更多」菜单 */
  secondaryActions?: PageHeaderSecondaryAction[];
  /** 'compact' = 嵌入详情紧凑模式 */
  density?: 'regular' | 'compact';
  /** true 时附加 STICKY_PAGE_HEADER_CLASS */
  sticky?: boolean;
  // —— 兼容保留（现有调用不破）——
  eyebrow?: string;
  description?: React.ReactNode;
  /** 标题下方的一行元信息（如需求详情的 编号/处理人/更新） */
  meta?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  /** 覆写 h1 的类（如详情页 24px/medium 标题） */
  titleClassName?: string;
  className?: string;
}

/**
 * 次要操作双形态渲染：
 * 宽屏（≥@[520px]）内联展示（render 优先 / 默认 ghost icon+label），
 * 阈值以下收入「更多」菜单（有 render 的项降级为 label + icon）。
 */
function PageHeaderSecondaryActions({ items }: { items: PageHeaderSecondaryAction[] }) {
  if (!items.length) return null;
  return (
    <>
      <div
        data-slot="page-header-secondary-inline"
        data-no-drag
        className={SECONDARY_INLINE_CLASSES.inline}
      >
        {items.map((item) => (
          <span key={item.key} className="flex items-center">
            {item.render ?? (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={item.onSelect}>
                {item.icon}
                <span>{item.label}</span>
              </Button>
            )}
          </span>
        ))}
      </div>
      <div
        data-slot="page-header-secondary-more"
        data-no-drag
        className={SECONDARY_INLINE_CLASSES.more}
      >
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="更多操作" />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {items.map((item) => (
              <DropdownMenuItem key={item.key} onClick={() => item.onSelect?.()}>
                {item.icon}
                <span className="truncate">{item.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

export function PageHeader({
  navigation,
  breadcrumb,
  eyebrow,
  title,
  titleClassName,
  titleBadge,
  scope,
  toolbar,
  actions,
  secondaryActions,
  density = 'regular',
  sticky = false,
  description,
  meta,
  className,
}: PageHeaderProps) {
  const compact = density === 'compact';
  const hasSecondary = Boolean(secondaryActions?.length);

  const rootClassName = cn(
    '@container flex select-none',
    breadcrumb || compact ? 'flex-col gap-2' : 'flex-col gap-3',
    sticky && STICKY_PAGE_HEADER_CLASS,
    // compact 吸顶时收紧上下留白：pt-7（28px）仍满足 macOS 红绿灯避让下限
    sticky && compact && 'pt-7 pb-2.5',
    className,
  );

  const toolbarRow = toolbar != null && (
    <div
      data-no-drag
      className={cn('flex min-w-0 flex-wrap items-center gap-2.5', compact ? 'pt-0.5' : 'pt-1')}
    >
      {toolbar}
    </div>
  );

  // 仅为原始字符串加溢出提示；调用方传入的 ReactNode 可能已经包含
  // Tooltip/OverflowTooltip（例如需求详情标题），避免重复嵌套浮层。
  const isPlainText = (value: React.ReactNode): value is string | number =>
    typeof value === 'string' || typeof value === 'number';

  // —— breadcrumb 模式（legacy）：独立详情页 / 面包屑导航调用方（RequirementDetails 等），
  //    结构保持与历史版本一致，仅追加 navigation / toolbar / secondaryActions 槽位支持 ——
  if (breadcrumb) {
    return (
      <header data-tauri-drag-region className={rootClassName}>
        <div className="flex min-w-0 items-center justify-between gap-4" data-tauri-drag-region>
          <div className="flex min-w-0 items-center gap-2" data-no-drag>
            {navigation != null && (
              <div className="flex shrink-0 items-center gap-2" data-no-drag>{navigation}</div>
            )}
            {breadcrumb}
          </div>
          {(actions != null || hasSecondary) && (
            <div className="flex shrink-0 flex-nowrap items-center gap-2" data-no-drag>
              {actions}
              {hasSecondary && <PageHeaderSecondaryActions items={secondaryActions ?? []} />}
            </div>
          )}
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
        {toolbarRow}
        {meta && <div className="border-t pt-3" data-no-drag>{meta}</div>}
      </header>
    );
  }

  // —— 统一标准模式：主行「导航与标题 → 当前范围 → 弹性空隙 → 页面操作」+ toolbar 行 ——
  return (
    <header data-tauri-drag-region className={rootClassName}>
      {eyebrow && <p className="eyebrow select-none cursor-default" data-tauri-drag-region>{eyebrow}</p>}
      <div
        className={cn('flex min-w-0 flex-nowrap items-center gap-2.5', compact ? 'min-h-8' : 'min-h-9')}
        data-tauri-drag-region
      >
        {navigation != null && (
          <div className="flex shrink-0 items-center gap-2" data-no-drag>{navigation}</div>
        )}
        <div
          className={cn('flex min-w-0 items-center gap-2', scope == null ? 'flex-1' : 'flex-initial max-w-[60%]')}
          data-tauri-drag-region
        >
          {isPlainText(title) ? (
            <OverflowTooltip
              as="h1"
              text={String(title)}
              className={cn('min-w-0 truncate select-none cursor-default', titleClassName)}
            />
          ) : (
            <h1 className={cn('min-w-0 truncate select-none cursor-default', titleClassName)}>{title}</h1>
          )}
          {titleBadge != null && <div className="shrink-0" data-no-drag>{titleBadge}</div>}
        </div>
        {scope != null && (
          <div className="flex min-w-0 max-w-[40%] items-center gap-2" data-tauri-drag-region>
            <span
              aria-hidden
              className="select-none text-xs text-muted-foreground/50 cursor-default"
            >
              /
            </span>
            {isPlainText(scope) ? (
              <OverflowTooltip
                text={String(scope)}
                className="min-w-0 truncate text-sm text-muted-foreground select-none cursor-default"
              />
            ) : (
              <span className="min-w-0 truncate text-sm text-muted-foreground select-none cursor-default">
                {scope}
              </span>
            )}
          </div>
        )}
        {/* 弹性空隙：basis 0，空间不足时先压缩标题（title 已 min-w-0 truncate） */}
        {scope != null && <div className="min-w-0 flex-1" data-tauri-drag-region />}
        {actions != null && (
          <div className="flex shrink-0 flex-nowrap items-center gap-2" data-no-drag>{actions}</div>
        )}
        {hasSecondary && <PageHeaderSecondaryActions items={secondaryActions ?? []} />}
      </div>
      {description != null && (
        <p className="min-w-0 truncate text-sm text-muted-foreground select-none cursor-default" data-tauri-drag-region>
          {description}
        </p>
      )}
      {toolbarRow}
      {meta != null && <div className="border-t pt-3" data-no-drag>{meta}</div>}
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
