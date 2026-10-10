import type { LucideIcon } from 'lucide-react';
import { InboxIcon } from 'lucide-react';
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

/**
 * 统一空态（shadcn Empty 封装）：图标 + 标题 + 描述，全应用同一形态，
 * 取代各处手写的 dashed/empty-state div。
 */
export function EmptyHint({
  icon: Icon = InboxIcon,
  title,
  description,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Empty className={cn(
      'border-border bg-muted/15',
      compact && 'flex-none flex-row justify-start gap-3 px-3 py-2 text-left',
      className,
    )}>
      <EmptyHeader className={compact ? 'items-start gap-0' : undefined}>
        <EmptyMedia className={compact ? 'mb-0' : undefined}>
          <Icon />
        </EmptyMedia>
        {title && <EmptyTitle>{title}</EmptyTitle>}
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}
