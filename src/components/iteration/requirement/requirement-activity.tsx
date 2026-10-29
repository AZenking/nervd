import { useState } from 'react';
import {
  MessageSquareIcon, SendIcon, Loader2Icon, SparklesIcon, CopyIcon,
  CheckIcon, RocketIcon, FlaskConicalIcon, Wand2Icon, ChevronDownIcon,
  ChevronUpIcon,
} from 'lucide-react';
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
import { aiSummarizeComments, aiGenerateCommentDraft } from '@/lib/ai-api';
import { extractRichHtml, markdownToHtml, sanitizeForYunxiao } from '@/lib/richtext';
import type { AiCommentSummary } from '@/types/ai';

export interface RequirementActivityProps {
  comments: unknown[];
  workitemId?: string;
  identifier?: string;
  subject?: string;
  branch?: string;
  ciStatus?: string;
  subtaskStats?: { total: number; done: number };
  className?: string;
}

/** Activity / 评论讨论（1:1 对齐 Linear Activity 时间轴、AI 纪要与智能草稿） */
export function RequirementActivity({
  comments,
  workitemId,
  identifier = '',
  subject = '',
  branch,
  ciStatus,
  subtaskStats,
  className,
}: RequirementActivityProps) {
  const { settings, reloadComments } = useApp();
  const openSettings = useUi((s) => s.openSettings);
  const allowWrite = settings?.allowWriteOps ?? false;

  const [commentDraft, setCommentDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // AI 纪要相关状态
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<AiCommentSummary | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // AI 草稿生成中状态
  const [generatingDraft, setGeneratingDraft] = useState<string | null>(null);

  const commentItems = comments as Record<string, unknown>[];

  // 触发 AI 讨论纪要提炼
  const handleSummarize = async () => {
    if (commentItems.length === 0 || summarizing) return;
    setSummarizing(true);
    try {
      const formattedComments = commentItems.map((c) => {
        const author = String(
          (c.author as Record<string, unknown>)?.name
            ?? (c.user as Record<string, unknown>)?.realName
            ?? (c.user as Record<string, unknown>)?.name
            ?? c.creator
            ?? '匿名成员',
        );
        const time = String(c.createdAt ?? c.createTime ?? c.gmtCreate ?? '');
        const content = String(c.content ?? '').replace(/<[^>]*>/g, '').trim();
        return { author, time, content };
      });

      const res = await aiSummarizeComments(subject || identifier, formattedComments);
      setSummary(res);
      setSummaryExpanded(true);
      toast.add({ title: '已提炼讨论纪要', type: 'success' });
    } catch (err) {
      toast.add({
        title: '提炼纪要失败',
        description: String(err),
        type: 'error',
      });
    } finally {
      setSummarizing(false);
    }
  };

  // 复制纪要内容
  const handleCopySummary = async () => {
    if (!summary) return;
    const text = [
      `【讨论纪要 TL;DR】${identifier} ${subject}`,
      summary.rawSummary ? `\n概括：${summary.rawSummary}` : '',
      summary.consensus?.length ? `\n核心共识：\n${summary.consensus.map((c) => `- ${c}`).join('\n')}` : '',
      summary.blockers?.length ? `\n阻塞卡点：\n${summary.blockers.map((b) => `- ${b}`).join('\n')}` : '',
      summary.actionItems?.length ? `\n待办事项：\n${summary.actionItems.map((a) => `- ${a}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
      toast.add({ title: '纪要已复制到剪贴板', type: 'info' });
    } catch {
      toast.add({ title: '复制失败', type: 'error' });
    }
  };

  // 生成快捷草稿
  const handleGenerateDraft = async (type: 'progress' | 'test_delivery' | 'polish') => {
    setGeneratingDraft(type);
    try {
      const generated = await aiGenerateCommentDraft({
        type,
        identifier,
        subject,
        branch,
        ciStatus,
        subtaskStats,
        draftText: commentDraft.replace(/<[^>]*>/g, '').trim(),
      });
      // 云效服务端底层不支持 Emoji 字符，生成后即时清洗
      const cleanDraft = sanitizeForYunxiao(generated);
      setCommentDraft(markdownToHtml(cleanDraft));
      toast.add({ title: '已生成评论草稿', type: 'success' });
    } catch (err) {
      toast.add({
        title: '生成草稿失败',
        description: String(err),
        type: 'error',
      });
    } finally {
      setGeneratingDraft(null);
    }
  };

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
      // 提交前过滤 Emoji 和特殊控制字符，防止云效 400 校验拦截
      const cleanComment = sanitizeForYunxiao(commentDraft);
      if (!cleanComment.replace(/<[^>]*>/g, '').trim()) {
        toast.add({ title: '评论内容不能全为特殊字符或表情', type: 'warning' });
        return;
      }
      await api.createWorkitemComment(workitemId, cleanComment, 'RICHTEXT');
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
      <div className="flex items-center justify-between">
        <SectionHeader title="动态" count={commentItems.length || undefined} hint="评论与讨论记录" />
        {commentItems.length > 0 && (
          <Button
            size="xs"
            variant="ghost"
            disabled={summarizing}
            onClick={() => void handleSummarize()}
            className="h-7 text-xs text-primary hover:bg-primary/10 transition-colors"
          >
            {summarizing ? (
              <>
                <Loader2Icon className="size-3.5 mr-1.5 animate-spin" />
                正在提炼纪要…
              </>
            ) : (
              <>
                <SparklesIcon className="size-3.5 mr-1.5" />
                AI 提炼纪要
              </>
            )}
          </Button>
        )}
      </div>

      {/* AI 纪要面板 */}
      {summary && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-xs flex flex-col gap-2.5 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <SparklesIcon className="size-3.5" />
              <span>讨论纪要 TL;DR</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleCopySummary()}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/60 transition-colors cursor-pointer"
              >
                {copiedSummary ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
                {copiedSummary ? '已复制' : '复制纪要'}
              </button>
              <button
                type="button"
                onClick={() => setSummaryExpanded(!summaryExpanded)}
                className="p-1 text-muted-foreground hover:text-foreground rounded cursor-pointer"
              >
                {summaryExpanded ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
              </button>
            </div>
          </div>

          {summaryExpanded && (
            <div className="flex flex-col gap-2 pt-1 border-t border-primary/15 text-foreground/90">
              {summary.rawSummary && (
                <p className="text-muted-foreground italic leading-relaxed">{summary.rawSummary}</p>
              )}
              {summary.consensus && summary.consensus.length > 0 && (
                <div>
                  <div className="font-semibold text-xs text-foreground flex items-center gap-1 mb-1">
                    核心共识
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground pl-1">
                    {summary.consensus.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.blockers && summary.blockers.length > 0 && (
                <div>
                  <div className="font-semibold text-xs text-destructive flex items-center gap-1 mb-1">
                    阻塞卡点
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground pl-1">
                    {summary.blockers.map((b, idx) => (
                      <li key={idx}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.actionItems && summary.actionItems.length > 0 && (
                <div>
                  <div className="font-semibold text-xs text-foreground flex items-center gap-1 mb-1">
                    待跟进事项
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground pl-1">
                    {summary.actionItems.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
            const richHtml = extractRichHtml(c.content) || markdownToHtml(String(c.content ?? ''));

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
                    <RichEditor content={richHtml} editable={false} className="cursor-default" />
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
          {/* AI 快捷生成助手胶囊栏 */}
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-border/50">
            <span className="text-[11px] text-muted-foreground mr-1 flex items-center gap-1">
              <SparklesIcon className="size-3 text-primary" />
              AI 助手:
            </span>
            <button
              type="button"
              disabled={Boolean(generatingDraft)}
              onClick={() => void handleGenerateDraft('progress')}
              className="cursor-pointer inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {generatingDraft === 'progress' ? <Loader2Icon className="size-3 animate-spin" /> : <RocketIcon className="size-3" />}
              研发进度同步
            </button>
            <button
              type="button"
              disabled={Boolean(generatingDraft)}
              onClick={() => void handleGenerateDraft('test_delivery')}
              className="cursor-pointer inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {generatingDraft === 'test_delivery' ? <Loader2Icon className="size-3 animate-spin" /> : <FlaskConicalIcon className="size-3" />}
              提测交付说明
            </button>
            <button
              type="button"
              disabled={Boolean(generatingDraft) || !commentDraft.trim()}
              onClick={() => void handleGenerateDraft('polish')}
              className={cn(
                'cursor-pointer inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2.5 py-0.5 text-[11px] transition-colors',
                commentDraft.trim() ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground/50 opacity-60 cursor-not-allowed',
              )}
              title={commentDraft.trim() ? '将当前输入框内容整理润色为专业评论' : '先输入要点后再点击润色'}
            >
              {generatingDraft === 'polish' ? <Loader2Icon className="size-3 animate-spin" /> : <Wand2Icon className="size-3" />}
              智能润色
            </button>
          </div>

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
            onSubmit={() => void handleSendComment()}
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
              onClick={() => void handleSendComment()}
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
