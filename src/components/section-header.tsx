import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { OverflowTooltip } from '@/components/overflow-tooltip';

/**
 * 区块标题（DESIGN.md §2.3 / 第三部分 B：h2 15px/600、h3 13px/500）：
 * - h2（默认）：主要区块，15px semibold + hairline 分割；
 * - h3：次级/折叠区块，13px medium、弱化色、无分割线——靠字号与弱化色轻一档。
 *
 * 空间分配（窄面板友好）：
 * - 标题块占剩余宽度（flex-1 + min-w 下限），标题与 hint 各自截断；
 * - 操作组 shrink-0 + flex-nowrap，永不零散换行；
 * - 极窄面板放不下时，操作组作为整体换到独立第二行（flex-wrap + ml-auto 右对齐），
 *   阈值由标题块的 min-w-[6ch] 下限决定。
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
    : 'text-[15px] font-semibold text-foreground';
  const Tag = (level === 'h3' ? 'h3' : 'h2') as 'h2';
  const isPlainText = (value: ReactNode): value is string | number =>
    typeof value === 'string' || typeof value === 'number';
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-3 gap-y-2',
        level === 'h2' && 'border-b border-border pb-2',
      )}
    >
      <div className="flex min-w-[6ch] flex-1 items-baseline gap-2">
        {isPlainText(title) ? (
          <OverflowTooltip
            as={level}
            text={String(title)}
            className={cn('min-w-0 truncate', headingClass)}
          />
        ) : (
          <Tag className={cn('min-w-0 truncate', headingClass)}>{title}</Tag>
        )}
        {count !== undefined && <span className="shrink-0 font-mono text-xs text-muted-foreground">{count}</span>}
        {hint && <span className="min-w-0 truncate text-xs text-muted-foreground">{hint}</span>}
      </div>
      {action && <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">{action}</div>}
    </div>
  );
}
