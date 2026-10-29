import { useState, useEffect } from 'react';
import {
  CheckIcon, CopyIcon, FileTextIcon, Loader2Icon, RefreshCwIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { aiGenerateReleaseNotes } from '@/lib/ai-api';
import { comparisonCommits } from '../iteration/BranchDivergenceCheck';
import { useApp } from '@/store/app';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

export interface AiReleaseNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: number;
  repoName: string;
  branchName: string;
  baseBranch: string;
  workitemKeys: string[];
}

export function AiReleaseNotesDialog({
  open,
  onOpenChange,
  repoId,
  repoName,
  branchName,
  baseBranch,
  workitemKeys,
}: AiReleaseNotesDialogProps) {
  const { items } = useApp();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'preview' | 'source'>('preview');

  const handleGenerate = async () => {
    setLoading(true);
    setCopied(false);
    try {
      let commitMessages: string[] = [];
      try {
        const compareResult = await api.compareBranches(repoId, baseBranch, branchName);
        const commits = comparisonCommits(compareResult) as Record<string, unknown>[];
        commitMessages = commits
          .map((c) => (typeof c.message === 'string' ? c.message.trim() : ''))
          .filter(Boolean);
      } catch {
        // compare 失败时回退直接生成
      }

      const matchedWorkitems = workitemKeys.map((key) => {
        const wi = items.find((i) => i.identifier.toUpperCase() === key.toUpperCase());
        return {
          identifier: key,
          subject: wi?.subject || '需求项',
        };
      });

      const markdown = await aiGenerateReleaseNotes({
        branchName,
        baseBranch,
        commits: commitMessages,
        workitems: matchedWorkitems,
      });

      setContent(markdown);
    } catch (err) {
      toast.add({
        title: '生成交付报告失败',
        description: String(err),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void handleGenerate();
    } else {
      setContent('');
    }
  }, [open, repoId, branchName, baseBranch]);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.add({
        title: '已复制 Release Notes 到剪贴板',
        type: 'success',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.add({ title: '复制失败，请手动选取复制', type: 'error' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-5 overflow-hidden">
        <DialogHeader className="shrink-0 pb-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileTextIcon className="size-4" />
            </span>
            <DialogTitle className="text-base font-semibold">
              集成分支发版交付报告 (Release Notes)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
            <span>仓库：<strong className="text-foreground">{repoName}</strong></span>
            <span>·</span>
            <span>分支：<code className="font-mono text-primary font-medium">{branchName}</code></span>
            <span>·</span>
            <span>基准：<code className="font-mono">{baseBranch}</code></span>
          </DialogDescription>
        </DialogHeader>

        {/* 顶部控制栏 */}
        <div className="flex items-center justify-between border-y border-border/60 py-2 shrink-0 bg-muted/20 -mx-5 px-5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'preview' | 'source')}>
            <TabsList size="sm">
              <TabsTrigger value="preview">
                格式化预览
              </TabsTrigger>
              <TabsTrigger value="source">
                Markdown 源码
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="ghost"
              disabled={loading}
              onClick={() => void handleGenerate()}
              className="h-7 text-xs"
            >
              <RefreshCwIcon className={`size-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '正在分析生成…' : '重新生成'}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={loading || !content}
              onClick={() => void handleCopy()}
              className="h-7 text-xs"
            >
              {copied ? <CheckIcon className="size-3.5 mr-1 text-emerald-500" /> : <CopyIcon className="size-3.5 mr-1" />}
              {copied ? '已复制' : '复制 Markdown'}
            </Button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto workspace-scroll py-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2Icon className="size-6 animate-spin text-primary" />
              <p className="text-xs">正在汇总关联工作项与超前提交，生成交付报告…</p>
            </div>
          ) : !content ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <p className="text-xs">暂无报告内容</p>
              <Button size="xs" variant="outline" onClick={() => void handleGenerate()}>
                点击生成
              </Button>
            </div>
          ) : tab === 'preview' ? (
            <div className="rounded-lg border border-border/50 bg-background/50 p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground select-text">
              {content}
            </div>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="h-full min-h-[350px] text-xs font-mono bg-background resize-none"
            />
          )}
        </div>

        {/* 底部关闭 */}
        <DialogFooter className="shrink-0 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-muted-foreground">
              关联需求：{workitemKeys.length > 0 ? workitemKeys.join(', ') : '无'}
            </span>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
