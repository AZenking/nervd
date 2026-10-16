import { useState, useEffect } from 'react';
import {
  ArrowRightIcon, CheckIcon, GitPullRequestIcon, Loader2Icon, SparklesIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { aiGenerateMergeRequest } from '@/lib/ai-api';
import { comparisonCommits } from '../BranchDivergenceCheck';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

export interface CreateMrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: number;
  repoName: string;
  identifier: string;
  subject: string;
  sourceBranch: string;
  targetBranch: string;
  onSuccess: () => void;
}

export function CreateMrDialog({
  open,
  onOpenChange,
  repoId,
  repoName,
  identifier,
  subject,
  sourceBranch,
  targetBranch,
  onSuccess,
}: CreateMrDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(`${identifier} ${subject}`.trim());
      setDescription(`### 关联工作项\n${identifier} ${subject}\n\n### 变更分支\n${sourceBranch} -> ${targetBranch}`);
    }
  }, [open, identifier, subject, sourceBranch, targetBranch]);

  const handleAiGenerate = async () => {
    setAiGenerating(true);
    try {
      let commitMessages: string[] = [];
      try {
        const compareResult = await api.compareBranches(repoId, targetBranch, sourceBranch);
        const commits = comparisonCommits(compareResult) as Record<string, unknown>[];
        commitMessages = commits
          .map((c) => (typeof c.message === 'string' ? c.message.trim() : ''))
          .filter(Boolean);
      } catch {
        // compare 失败时回退直接生成
      }

      const draft = await aiGenerateMergeRequest({
        identifier,
        subject,
        sourceBranch,
        targetBranch,
        commits: commitMessages,
      });

      setTitle(draft.title);
      setDescription(draft.description);
      toast.add({
        title: '已由 AI 生成规范 MR 标题与结构化描述',
        type: 'success',
      });
    } catch (err) {
      toast.add({
        title: 'AI 拟定 MR 失败',
        description: String(err),
        type: 'error',
      });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.add({ title: '请输入 MR 标题', type: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      await api.createMergeRequest({
        repoId,
        title: title.trim(),
        sourceBranch,
        targetBranch,
        description: description.trim(),
      });
      toast.add({
        title: 'Merge Request 已成功创建',
        description: `${sourceBranch} → ${targetBranch}`,
        type: 'success',
      });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.add({
        title: '创建 Merge Request 失败',
        description: String(err),
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl flex flex-col p-5">
        <DialogHeader className="shrink-0 pb-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitPullRequestIcon className="size-4" />
            </span>
            <DialogTitle className="text-base font-semibold">
              创建合并请求 (Merge Request)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            仓库：<span className="font-medium text-foreground">{repoName}</span>
          </DialogDescription>
        </DialogHeader>

        {/* 分支流转指示器 */}
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
          <span className="font-mono text-foreground font-medium truncate max-w-48">{sourceBranch}</span>
          <ArrowRightIcon className="size-3.5 text-muted-foreground shrink-0" />
          <span className="font-mono text-foreground font-medium truncate max-w-48">{targetBranch}</span>
          <div className="ml-auto">
            <Button
              size="xs"
              variant="outline"
              disabled={aiGenerating || submitting}
              onClick={() => void handleAiGenerate()}
              className="h-6 text-xs text-primary border-primary/30 hover:bg-primary/10"
            >
              {aiGenerating ? (
                <Loader2Icon className="size-3 animate-spin mr-1" />
              ) : (
                <SparklesIcon className="size-3 mr-1 text-primary" />
              )}
              {aiGenerating ? 'AI 拟定中…' : 'AI 智能生成描述'}
            </Button>
          </div>
        </div>

        {/* 表单内容 */}
        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">MR 标题</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="feat(REQ-xxx): 标题"
              disabled={submitting}
              className="h-8 text-xs font-mono bg-background"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">详细变更说明 (Markdown)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="变更背景、改动点与自测步骤…"
              rows={8}
              disabled={submitting}
              className="text-xs font-mono bg-background resize-none"
            />
          </div>
        </div>

        {/* 底部操作 */}
        <DialogFooter className="shrink-0 pt-3 border-t border-border/60">
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              disabled={submitting || !title.trim()}
              onClick={() => void handleSubmit()}
            >
              {submitting ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
                  提交中…
                </>
              ) : (
                <>
                  <CheckIcon className="size-3.5 mr-1.5" />
                  确认创建 MR
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
