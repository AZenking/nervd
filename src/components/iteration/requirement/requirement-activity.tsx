import { useState } from 'react';
import { MessageSquareIcon, SendIcon, Loader2Icon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { RichEditor } from '@/components/ui/rich-editor';
import { cn } from '@/lib/utils';
import { EmptyHint } from '@/components/empty-hint';
import { SectionHeader } from '@/components/section-header';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { toast } from '@/components/ui/toast';
import * as api from '@/lib/api';

export interface RequirementActivityProps {
  comments: unknown[];
  workitemId?: string;
  className?: string;
}

/** Activity / 评论讨论（1:1 对齐 Linear Activity 时间轴与快速发表） */
export function RequirementActivity({ comments, workitemId, className }: RequirementActivityProps) {
  const { settings, reloadComments } = useApp();
  const openSettings = useUi((s) => s.openSettings);
  const allowWrite = settings?.allowWriteOps ?? false;

  const [commentDraft, setCommentDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const commentItems = comments as Record<string, unknown>[];

  const handleSendComment = async () => {
    if (!workitemId || submitting) return;
    const trimmed = commentDraft.replace(/<[^>]*>/g, '').trim();
    if (!trimmed) {
      toast.add({ title: '请输入评论内容', type: 'warning' });
      return;
    }
    if (!allowWrite) {
      toast.add({
        title: '当前处于只读模式',
        description: '发表评论是写操作。可在「设置 → 安全」中开启写权限后执行。',
        type: 'warning',
        actionProps: {
          children: '前往设置',
          onClick: () => openSettings('security'),
        },
      });
      return;
    }
    setSubmitting(true);
    try {
      await api.createWorkitemComment(workitemId, commentDraft, 'RICHTEXT');
      toast.add({ title: '评论已发布', type: 'success' });
      setCommentDraft('');
      await reloadComments(workitemId);
    } catch (err) {
      toast.add({ title: '评论发布失败', description: String(err), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={cn('flex flex-col gap-4', className)}>
      <SectionHeader title="Activity" count={commentItems.length || undefined} hint="评论与讨论记录" />

      {/* 历史评论时间轴 */}
      {commentItems.length ? (
        <div className="relative flex flex-col gap-5 pl-4 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-border/60">
          {commentItems.map((c, i) => {
            const authorName = String(
              (c.author as Record<string, unknown>)?.name
                ?? (c.user as Record<string, unknown>)?.realName
                ?? (c.user as Record<string, unknown>)?.name
                ?? c.creator
                ?? '—',
            );
            const content = String(c.content ?? '');
            const isHtml = content.includes('<') && content.includes('>');

            return (
              <article key={i} className="relative flex items-start gap-3">
                <Avatar className="size-6 shrink-0 mt-0.5 ring-2 ring-background">
                  <AvatarFallback className="text-[10px] bg-muted text-muted-foreground font-medium">
                    {authorName.charAt(0) || '—'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-xs font-medium text-foreground">{authorName}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {String(c.createdAt ?? c.createTime ?? c.gmtCreate ?? '')}
                    </span>
                  </div>
                  <div className="mt-1 text-sm leading-relaxed text-foreground/85">
                    {isHtml ? (
                      <RichEditor content={content} editable={false} className="cursor-default" />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{content}</div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyHint icon={MessageSquareIcon} title="暂无评论" className="py-6" />
      )}

      {/* 底部 Linear 风格评论快速发表框 */}
      {workitemId && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-border/80 bg-background/50 p-3 focus-within:border-primary/50 transition-colors">
          <RichEditor
            content={commentDraft}
            editable={allowWrite}
            showToolbar={false}
            placeholder={
              allowWrite
                ? '写下评论，支持 Markdown 语法与快捷指令 (按 ⌘ + Enter 发送)…'
                : '当前处于只读模式，无法发表评论（可在「设置 → 安全」开启写权限）'
            }
            onChange={setCommentDraft}
            onSubmit={handleSendComment}
            editorClassName="min-h-[3.5rem]"
          />
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <span className="text-[11px] text-muted-foreground">
              按 <kbd className="font-mono px-1 py-0.5 rounded bg-muted text-[10px]">⌘ + Enter</kbd> 快速发送
            </span>
            <Button
              type="button"
              variant={allowWrite ? 'default' : 'outline'}
              size="xs"
              onClick={handleSendComment}
              disabled={submitting}
              className={cn(!allowWrite && 'opacity-60 cursor-not-allowed')}
              title={allowWrite ? '发送评论 (⌘+Enter)' : '只读模式不可用'}
            >
              {submitting ? (
                <Loader2Icon className="size-3 mr-1 animate-spin" />
              ) : (
                <SendIcon className="size-3 mr-1" />
              )}
              发送评论
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
