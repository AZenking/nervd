import { useState, type ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/**
 * 可折叠侧栏分组：
 * - 标题行 hover 出现小 chevron（展开态常驻指示方向），点击标题折叠/展开整组；
 * - action（如「＋」）仅在标题行 hover 时显示，点击不触发折叠；
 * - 折叠状态为会话内记忆（useState）。
 */
export function NavCollapsibleGroup({
  label,
  labelClassName,
  action,
  defaultOpen = true,
  className,
  children,
}: {
  label: ReactNode;
  /** 标题样式（各分组保持原有字号/字距） */
  labelClassName?: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<SidebarGroup className={className} />}>
      <CollapsibleTrigger
        render={
          <SidebarGroupLabel
            className={cn(
              'group/label flex w-full cursor-pointer select-none items-center gap-1 hover:text-sidebar-foreground/70',
              labelClassName,
            )}
          />
        }
      >
        <ChevronRightIcon
          aria-hidden
          className={cn(
            'size-3 shrink-0 text-sidebar-foreground/45 transition-transform duration-200',
            open ? 'rotate-90' : 'opacity-0 group-hover/label:opacity-100',
          )}
        />
        <span className="min-w-0 flex-1 text-left">{label}</span>
        {action && (
          <span
            className="opacity-0 transition-opacity group-hover/label:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            {action}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
