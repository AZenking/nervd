import { useEffect, useState } from 'react';
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitPullRequestIcon,
} from 'lucide-react';
import type { MrSummary } from '@/types';
import * as api from '@/lib/api';
import { buildCodeupMergeRequestUrl, openExternal } from '@/lib/yunxiao-link';
import { comparisonCommits } from '../BranchDivergenceCheck';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { WriteOpButton } from '@/components/WriteOpButton';
import { useApp } from '@/store/app';
import { cn } from '@/lib/utils';

export interface MrInlineItemProps {
  mr: MrSummary;
  repoId: number;
  repoPathWithNamespace?: string;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}

interface CommitSummaryItem {
  id: string;
  shortId: string;
  title: string;
  authorName?: string;
}

export function MrInlineItem({
  mr,
  repoId,
  repoPathWithNamespace,
  isExpanded,
  onToggle,
  onRefresh,
}: MrInlineItemProps) {
  const organizationId = useApp((s) => s.settings?.organizationId);
  const [commits, setCommits] = useState<CommitSummaryItem[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);

  const mrState = mr.state?.toLowerCase();
  const isMerged = mrState === 'merged';
  const isClosed = mrState === 'closed';
  const isOpen = !isMerged && !isClosed;

  const mrUrl = buildCodeupMergeRequestUrl({
    organizationId,
    repoPathWithNamespace,
    repoId,
    localId: mr.localId,
  });

  // 展开时按需异步拉取分支落差提交记录 (Commits)
  useEffect(() => {
    if (!isExpanded) return;

    let cancelled = false;
    setLoadingCommits(true);
    setCommitsError(null);

    api
      .compareBranches(repoId, mr.targetBranch, mr.sourceBranch)
      .then((res) => {
        if (cancelled) return;
        try {
          const raw = comparisonCommits(res) as Record<string, unknown>[];
          const mapped: CommitSummaryItem[] = raw.map((c) => {
            const sha = String(c.id ?? c.sha ?? '');
            const msg = String(c.message ?? c.title ?? '').trim();
            const author =
              typeof c.author === 'object' && c.author != null
                ? (c.author as { name?: string }).name
                : typeof c.author_name === 'string'
                  ? c.author_name
                  : typeof c.authorName === 'string'
                    ? c.authorName
                    : undefined;
            return {
              id: sha,
              shortId: sha ? sha.slice(0, 7) : '',
              title: msg.split('\n')[0] || 'Commit',
              authorName: author,
            };
          });
          setCommits(mapped);
        } catch {
          setCommits([]);
        }
      })
      .catch((err) => {
        if (!cancelled) setCommitsError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingCommits(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isExpanded, repoId, mr.localId, mr.sourceBranch, mr.targetBranch]);

  const handleMerge = async () => {
    try {
      await api.mergeMergeRequest(repoId, mr.localId);
      toast.add({
        title: `MR !${mr.localId} 已成功合入`,
        description: `${mr.sourceBranch} → ${mr.targetBranch}`,
        type: 'success',
      });
      onRefresh();
    } catch (err) {
      toast.add({
        title: '合并失败',
        description: String(err),
        type: 'error',
      });
      throw err;
    }
  };

  return (
    <div className="flex flex-col rounded-md border border-border/40 bg-background/50 transition-colors hover:border-border/70 overflow-hidden">
      {/* 紧凑列表标题行：支持点击展开/折叠，严格防止横向溢出 */}
      <div
        onClick={onToggle}
        className="flex cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-xs select-none hover:bg-muted/40 transition-colors"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="font-mono font-bold text-primary shrink-0">
            !{mr.localId}
          </span>
          <span
            className="truncate font-medium text-foreground hover:text-primary transition-colors"
            title={mr.title}
          >
            {mr.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isMerged ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckIcon className="size-3" />已合并
            </span>
          ) : isClosed ? (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              已关闭
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              <GitPullRequestIcon className="size-3" />开放中
            </span>
          )}
          <ChevronDownIcon
            className={cn(
              'size-3.5 text-muted-foreground transition-transform duration-200',
              isExpanded && 'rotate-180 text-foreground',
            )}
          />
        </div>
      </div>

      {/* 就地展开的闭环检视面板（无需弹窗与抽屉，直接就地查看与合入） */}
      {isExpanded && (
        <div className="flex flex-col gap-2.5 border-t border-border/40 bg-muted/20 px-3 py-2.5 text-xs">
          {/* 分支流向 */}
          <div className="flex items-center justify-between gap-2 rounded border border-border/30 bg-background/70 px-2 py-1.5 text-[11px] font-mono">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
              <GitBranchIcon className="size-3 text-muted-foreground shrink-0" />
              <span className="truncate text-foreground font-semibold" title={mr.sourceBranch}>
                {mr.sourceBranch}
              </span>
              <ArrowRightIcon className="size-3 text-muted-foreground shrink-0" />
              <span className="truncate text-primary font-semibold" title={mr.targetBranch}>
                {mr.targetBranch}
              </span>
            </div>
            <CopyButton text={`${mr.sourceBranch} -> ${mr.targetBranch}`} label="复制分支" />
          </div>

          {/* Commits 提交列表 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1 font-medium text-foreground">
                <GitCommitIcon className="size-3 text-primary" />
                <span>代码变更提交 ({loadingCommits ? '…' : commits.length})</span>
              </div>
              {mr.author?.name && <span>创建人：{mr.author.name}</span>}
            </div>

            {loadingCommits ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Spinner className="size-3 text-primary" />
                <span>读取变更提交中…</span>
              </div>
            ) : commitsError ? (
              <div className="rounded bg-destructive/10 p-2 text-[11px] text-destructive">
                读取提交失败：{commitsError}
              </div>
            ) : commits.length === 0 ? (
              <div className="rounded bg-muted/20 p-2 text-center text-[11px] text-muted-foreground">
                无差异提交记录（两分支内容已同步）
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border/30 rounded border border-border/30 bg-background/50 max-h-36 overflow-y-auto">
                {commits.slice(0, 5).map((c, i) => (
                  <div key={c.id || i} className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <code className="font-mono text-muted-foreground shrink-0">{c.shortId}</code>
                      <span className="truncate text-foreground" title={c.title}>
                        {c.title}
                      </span>
                    </div>
                    {c.authorName && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{c.authorName}</span>
                    )}
                  </div>
                ))}
                {commits.length > 5 && (
                  <div className="py-1 text-center text-[10px] text-muted-foreground bg-muted/10">
                    …还有 {commits.length - 5} 个提交
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 底部操作条：云效直达 + 就地直接合并 */}
          <div className="flex items-center justify-between pt-1 border-t border-border/30">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="gap-1 text-muted-foreground hover:text-foreground h-6 px-1.5"
              onClick={() => void openExternal(mrUrl)}
              title="在云效 Codeup 中查看完整讨论与差异"
            >
              <span>云效直达</span>
              <ExternalLinkIcon className="size-3" />
            </Button>

            <div className="flex items-center gap-2">
              {isOpen && (
                <WriteOpButton
                  label="确认合并"
                  title={`将 ${mr.sourceBranch} 合入 ${mr.targetBranch}`}
                  variant="default"
                  confirm="dialog"
                  confirmLabel="确认合并"
                  onAction={handleMerge}
                />
              )}
              {isMerged && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <CheckIcon className="size-3" />已合入目标基准
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
