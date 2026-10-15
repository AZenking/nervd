import { MessageSquareIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { EmptyHint } from '@/components/empty-hint';
import { SectionHeader } from '@/components/section-header';

export interface RequirementActivityProps {
  comments: unknown[];
  className?: string;
}

/** Activity / 评论讨论（1:1 对齐 Linear Activity 时间轴） */
export function RequirementActivity({ comments, className }: RequirementActivityProps) {
  const commentItems = comments as Record<string, unknown>[];

  return (
    <section className={cn('flex flex-col gap-4', className)}>
      <SectionHeader title="Activity" count={commentItems.length || undefined} hint="评论与讨论记录" />
      {commentItems.length ? (
        <div className="relative flex flex-col gap-5 pl-4 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-border/60">
          {commentItems.map((c, i) => (
            <article key={i} className="relative flex items-start gap-3">
              <Avatar className="size-6 shrink-0 mt-0.5 ring-2 ring-background">
                <AvatarFallback className="text-[10px] bg-muted text-muted-foreground font-medium">
                  {String((c.author as Record<string, unknown>)?.name ?? c.creator ?? '—').charAt(0) || '—'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xs font-medium text-foreground">
                    {String((c.author as Record<string, unknown>)?.name ?? c.creator ?? '—')}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{String(c.createdAt ?? c.gmtCreate ?? '')}</span>
                </div>
                <div className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
                  {String(c.content ?? '')}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyHint icon={MessageSquareIcon} title="暂无评论" className="py-6" />
      )}
    </section>
  );
}
