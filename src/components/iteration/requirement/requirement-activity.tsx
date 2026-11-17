import { useState } from 'react';
import {
  MessageSquareIcon, SendIcon, Loader2Icon, SparklesIcon, CopyIcon,
  CheckIcon, RocketIcon, FlaskConicalIcon, Wand2Icon, ChevronUpIcon, ChevronDownIcon, KeyboardIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, getAvatarColorClass } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { IconHint } from '@/components/ui/icon-hint';
import { Kbd } from '@/components/ui/kbd';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RichEditor } from '@/components/ui/rich-editor';
import { cn } from '@/lib/utils';
import { formatCompactDateTime, formatDateTime } from '@/lib/format';
import { READONLY_BTN_CLASS } from '@/components/WriteOpButton';
import { EmptyHint } from '@/components/empty-hint';
import { SectionHeader } from '@/components/section-header';
import { useApp } from '@/store/app';
import { useShallow } from 'zustand/react/shallow';
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

/** 评论正文折叠阈值（纯文本字符数）：超过后默认收起，避免长评论挤占活动流 */
const COMMENT_COLLAPSE_THRESHOLD = 400;

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
  const { settings, reloadComments } = useApp(
    useShallow((s) => ({ settings: s.settings, reloadComments: s.reloadComments })),
  );
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

  // 长评论折叠：仅对超过阈值的正文提供「展开 / 收起」
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());

  const toggleCommentExpanded = (index: number) => {
    setExpandedComments((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

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
    if (!allowWrite) {
      toast.add({
        title: '当前处于只读模式',
        description: '发表评论是写操作。可在「设置 → 安全与权限」中开启写权限后执行。',
        type: 'warning',
        actionProps: {
          children: '前往设置',
          onClick: () => openSettings('security'),
        },
      });
      return;
    }
    const trimmed = commentDraft.replace(/<[^>]*>/g, '').trim();
    if (!trimmed) {
      toast.add({ title: '请输入评论内容', type: 'warning' });
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

  // 润色入口的可用性以纯文本为准：富文本空段落（如 <p></p>）不算已有输入
  const draftPlainText = commentDraft.replace(/<[^>]*>/g, '').trim();

  return (
    <section className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between">
        <SectionHeader title="动态" count={commentItems.length || undefined} hint="评论与讨论记录" />
        {commentItems.length > 0 && (
          <Button
            size="xs"
            variant="ghost"
            disabled={summarizing}
            onPress={() => void handleSummarize()}
            className="text-primary transition-colors"
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
        <Card variant="secondary" className="p-3.5 text-xs flex flex-col gap-2.5 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <SparklesIcon className="size-3.5" />
              <span>讨论纪要 TL;DR</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="2xs"
                onPress={() => void handleCopySummary()}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                {copiedSummary ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
                {copiedSummary ? '已复制' : '复制纪要'}
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onPress={() => setSummaryExpanded(!summaryExpanded)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={summaryExpanded ? '收起纪要' : '展开纪要'}
                    >
                      {summaryExpanded ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
                    </Button>
                  )}
                />
                <TooltipContent>
                  {summaryExpanded ? '收起纪要' : '展开纪要'}
                </TooltipContent>
              </Tooltip>
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
        </Card>
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
            const rawTime = c.createdAt ?? c.createTime ?? c.gmtCreate ?? '';
            const occurredAt = new Date(
              typeof rawTime === 'number' ? rawTime : String(rawTime),
            );
            const hasTime = rawTime !== '' && rawTime !== null && rawTime !== undefined
              && !Number.isNaN(occurredAt.getTime());
            const plainText = String(c.content ?? '').replace(/<[^>]*>/g, '').trim();
            const isLong = plainText.length > COMMENT_COLLAPSE_THRESHOLD;
            const expanded = expandedComments.has(i);

            return (
              <article key={i} className="relative flex items-start gap-3">
                <Avatar className={cn('size-6 shrink-0 mt-0.5 ring-2 ring-background border', getAvatarColorClass(authorName))}>
                  <AvatarFallback className="text-[10px] bg-transparent font-medium">
                    {authorName.charAt(0) || '—'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-xs font-medium text-foreground">{authorName}</span>
                    {hasTime && (
                      <time
                        dateTime={occurredAt.toISOString()}
                        title={formatDateTime(occurredAt.getTime())}
                        className="text-[11px] text-muted-foreground font-mono tabular-nums"
                      >
                        {formatCompactDateTime(occurredAt)}
                      </time>
                    )}
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-sm leading-relaxed text-foreground/85',
                      isLong && !expanded && 'max-h-36 overflow-hidden',
                    )}
                  >
                    <RichEditor content={richHtml} editable={false} className="cursor-default" />
                  </div>
                  {isLong && (
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="mt-0.5 text-muted-foreground hover:text-foreground"
                      onPress={() => toggleCommentExpanded(i)}
                      aria-expanded={expanded}
                    >
                      {expanded ? '收起' : '展开全文'}
                    </Button>
                  )}
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
          {/* AI 辅助：三种生成场景全部常驻，收进同一个 HeroUI ButtonGroup
              （图标 + 文案 + 加载态；禁用原因与用途说明交给 Tooltip）。 */}
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-border/50">
            <ButtonGroup variant="tertiary" aria-label="AI 辅助">
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      type="button"
                      size="xs"
                      variant="tertiary"
                      data-testid="ai-menu-progress"
                      disabled={Boolean(generatingDraft)}
                      onPress={() => void handleGenerateDraft('progress')}
                      className="gap-1"
                      aria-label="AI 辅助：研发进度同步"
                    />
                  )}
                >
                  {generatingDraft === 'progress'
                    ? <Loader2Icon className="size-3.5 animate-spin" />
                    : <RocketIcon className="size-3.5" />}
                  <span>研发进度同步</span>
                </TooltipTrigger>
                <TooltipContent>
                  {generatingDraft === 'progress' ? '生成中…' : '按需求当前状态播报研发进度'}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      type="button"
                      size="xs"
                      variant="tertiary"
                      data-testid="ai-menu-test-delivery"
                      disabled={Boolean(generatingDraft)}
                      onPress={() => void handleGenerateDraft('test_delivery')}
                      className="gap-1"
                      aria-label="AI 辅助：提测交付说明"
                    />
                  )}
                >
                  {generatingDraft === 'test_delivery'
                    ? <Loader2Icon className="size-3.5 animate-spin" />
                    : <FlaskConicalIcon className="size-3.5" />}
                  <span>提测交付说明</span>
                </TooltipTrigger>
                <TooltipContent>
                  {generatingDraft === 'test_delivery' ? '生成中…' : '生成提测交付说明'}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      type="button"
                      size="xs"
                      variant="tertiary"
                      data-testid="ai-menu-polish"
                      disabled={Boolean(generatingDraft) || !draftPlainText}
                      onPress={() => void handleGenerateDraft('polish')}
                      className="gap-1"
                      aria-label="AI 辅助：智能润色"
                    />
                  )}
                >
                  {generatingDraft === 'polish'
                    ? <Loader2Icon className="size-3.5 animate-spin" />
                    : <Wand2Icon className="size-3.5" />}
                  <span>智能润色</span>
                </TooltipTrigger>
                <TooltipContent>
                  {generatingDraft === 'polish'
                    ? '生成中…'
                    : draftPlainText
                      ? '润色当前输入'
                      : '先输入要点再润色'}
                </TooltipContent>
              </Tooltip>
            </ButtonGroup>
          </div>

          <RichEditor
            content={commentDraft}
            editable={allowWrite}
            showToolbar={false}
            placeholder={
              allowWrite
                ? '写下评论，支持 Markdown 语法与快捷指令 (按 ⌘ + Enter 发送)…'
                : '当前处于只读模式，无法发表评论（可在「设置 → 安全与权限」开启写权限）'
            }
            onChange={setCommentDraft}
            onSubmit={() => void handleSendComment()}
            editorClassName="min-h-[3.5rem]"
          />
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <IconHint
              icon={<KeyboardIcon className="size-3.5" />}
              label={<>按 <Kbd className="px-1 text-[10px]">⌘ + Enter</Kbd> 快速发送</>}
              ariaLabel="按 ⌘ + Enter 快速发送"
            />
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    type="button"
                    variant={allowWrite ? 'default' : 'outline'}
                    size="xs"
                    onPress={() => void handleSendComment()}
                    aria-disabled={!allowWrite || submitting || undefined}
                    className={cn((!allowWrite || submitting) && READONLY_BTN_CLASS, 'gap-1.5')}
                  >
                    {submitting ? (
                      <Loader2Icon className="size-3 mr-1 animate-spin" />
                    ) : (
                      <SendIcon className="size-3 mr-1" />
                    )}
                    发送评论
                  </Button>
                )}
              />
              <TooltipContent>
                {!allowWrite
                  ? '写操作已关闭：需在「设置 → 安全与权限」中开启（需写权限令牌）'
                  : submitting
                    ? '正在发布评论…'
                    : '发送评论 (⌘+Enter)'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </section>
  );
}
