import { useEffect, useState, useCallback } from 'react';
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  FileDiffIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  RefreshCwIcon,
} from 'lucide-react';
import type { MrSummary } from '@/types';
import * as api from '@/lib/api';
import { buildCodeupMergeRequestUrl, openExternal } from '@/lib/yunxiao-link';
import { comparisonCommits, comparisonDiffs } from '../BranchDivergenceCheck';
import { parseFileDiffs, type FileDiffItem } from './diff-utils';
import { CodeDiffViewer } from './code-diff-viewer';
import { CodeDiffDrawer } from './code-diff-drawer';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { WriteOpButton } from '@/components/WriteOpButton';
import { useApp } from '@/store/app';
import { cn } from '@/lib/utils';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { getMrStatusInfo } from './types';

export interface MrInlineItemProps {
  mr: MrSummary;
  repoId: number;
  repoPathWithNamespace?: string;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onCreateMr?: () => void;
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
  onCreateMr,
}: MrInlineItemProps) {
  const organizationId = useApp((s) => s.settings?.organizationId);
  const [commits, setCommits] = useState<CommitSummaryItem[]>([]);
  const [diffs, setDiffs] = useState<FileDiffItem[]>([]);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [inlineDiffOpen, setInlineDiffOpen] = useState(false);
  const [diffDrawerOpen, setDiffDrawerOpen] = useState(false);

  const mrState = mr.state?.toLowerCase();
  const isMerged = mrState === 'merged';
  const isClosed = mrState === 'closed';
  const isOpen = !isMerged && !isClosed;
  const statusInfo = getMrStatusInfo(mr.state, (mr as unknown as Record<string, unknown>).hasConflict as boolean | undefined);

  const totalAdditions = diffs.reduce((acc, f) => acc + f.additions, 0);
  const totalDeletions = diffs.reduce((acc, f) => acc + f.deletions, 0);

  const mrUrl = buildCodeupMergeRequestUrl({
    webUrl: (mr as { webUrl?: string }).webUrl,
    organizationId,
    repoPathWithNamespace,
    repoId,
    localId: mr.localId,
  });

  // 按需异步拉取当前分支落差提交与文件差异
  const fetchDivergence = useCallback(() => {
    if (!isExpanded) return;

    // 刷新或切换条目时立即清除过期结果
    setLoadingDiff(true);
    setDiffError(null);
    setCommits([]);
    setDiffs([]);

    let cancelled = false;

    api
      .compareBranches(repoId, mr.targetBranch, mr.sourceBranch)
      .then((res) => {
        if (cancelled) return;
        try {
          const rawCommits = comparisonCommits(res) as Record<string, unknown>[];
          const mapped: CommitSummaryItem[] = rawCommits.map((c) => {
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

          const rawDiffs = comparisonDiffs(res);
          const parsedDiffs = parseFileDiffs(rawDiffs);
          setDiffs(parsedDiffs);
        } catch (e) {
          setDiffError(String(e));
        }
      })
      .catch((err) => {
        if (!cancelled) setDiffError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingDiff(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isExpanded, repoId, mr.sourceBranch, mr.targetBranch]);

  useEffect(() => {
    const cleanup = fetchDivergence();
    return cleanup;
  }, [fetchDivergence]);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      id={`mr-item-${mr.localId}`}
      className="flex flex-col rounded-md border border-border/40 bg-background/50 transition-colors hover:border-border/70 overflow-hidden"
    >
      {/* 紧凑列表标题行：支持点击/键盘展开折叠 */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className="flex cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-xs select-none hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="font-mono font-bold text-primary shrink-0">
            !{mr.localId}
          </span>
          <OverflowTooltip
            text={mr.title}
            className="min-w-0 truncate font-medium text-foreground hover:text-primary transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border', statusInfo.badgeClass)}>
            {statusInfo.tone === 'emerald' && <CheckIcon className="size-3" />}
            {statusInfo.tone === 'amber' && <GitPullRequestIcon className="size-3" />}
            {statusInfo.label}
          </span>
          <ChevronDownIcon
            className={cn(
              'size-3.5 text-muted-foreground transition-transform duration-200',
              isExpanded && 'rotate-180 text-foreground',
            )}
          />
        </div>
      </div>

      {/* 就地展开的闭环检视面板 */}
      {isExpanded && (
        <div className="flex flex-col gap-2.5 border-t border-border/40 bg-muted/20 px-3 py-2.5 text-xs">
          {/* 分支流向与基本元数据 */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/30 bg-background/70 px-2 py-1.5 text-[11px] font-mono">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
              <GitBranchIcon className="size-3 text-muted-foreground shrink-0" />
              <OverflowTooltip
                text={mr.sourceBranch}
                className="min-w-0 truncate text-foreground font-semibold"
              />
              <ArrowRightIcon className="size-3 text-muted-foreground shrink-0" />
              <OverflowTooltip
                text={mr.targetBranch}
                className="min-w-0 truncate text-primary font-semibold"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {mr.author?.name && (
                <span className="text-muted-foreground text-[10px]">创建人: {mr.author.name}</span>
              )}
              <CopyButton text={`${mr.sourceBranch} -> ${mr.targetBranch}`} label="复制分支" />
            </div>
          </div>

          {/* 差异状态区域：区分活跃 MR 与历史 MR */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1 font-medium text-foreground">
                <GitCommitIcon className="size-3 text-primary" />
                <span>
                  {isOpen
                    ? `当前待合入提交 (${loadingDiff ? '…' : commits.length})`
                    : `当前分支差异提交 (${loadingDiff ? '…' : commits.length})`}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                disabled={loadingDiff}
                onClick={fetchDivergence}
                title="重新比较两分支最新状态"
              >
                <RefreshCwIcon className={cn('size-2.5', loadingDiff && 'animate-spin')} />
                <span>刷新差异</span>
              </Button>
            </div>

            {loadingDiff ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Spinner className="size-3 text-primary" />
                <span>对比分支最新变动中…</span>
              </div>
            ) : diffError ? (
              <div className="flex items-center justify-between rounded bg-destructive/10 p-2 text-[11px] text-destructive">
                <span>差异加载失败：{diffError}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="h-5 px-1.5 text-[10px]"
                  onClick={fetchDivergence}
                >
                  重试
                </Button>
              </div>
            ) : commits.length === 0 ? (
              <div className="rounded bg-muted/20 p-2 text-center text-[11px] text-muted-foreground">
                {isOpen ? (
                  '两分支内容已同步，无待合入提交'
                ) : (
                  <span>
                    两分支当前已对齐。历史完整变更请通过下方
                    <button
                      type="button"
                      onClick={() => void openExternal(mrUrl)}
                      className="ml-1 text-primary hover:underline cursor-pointer"
                    >
                      「云效直达」
                    </button>
                    查看。
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border/30 rounded border border-border/30 bg-background/50 max-h-36 overflow-y-auto">
                {commits.slice(0, 5).map((c, i) => (
                  <div key={c.id || i} className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <code className="font-mono text-muted-foreground shrink-0">{c.shortId}</code>
                      <OverflowTooltip text={c.title} className="min-w-0 truncate text-foreground" />
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

          {/* 文件改动与本地 Diff 预览入口 */}
          {diffs.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-border/20">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <FileDiffIcon className="size-3 text-primary" />
                  <span>当前分支差异文件 ({diffs.length})</span>
                  <span className="font-mono text-[10px]">
                    {totalAdditions > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{totalAdditions} </span>
                    )}
                    {totalDeletions > 0 && (
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">-{totalDeletions}</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setInlineDiffOpen((v) => !v)}
                  >
                    {inlineDiffOpen ? '收起改动' : '展开改动'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="h-5 px-1.5 text-[10px] gap-1"
                    onClick={() => setDiffDrawerOpen(true)}
                  >
                    <span>抽屉检视</span>
                    <FileCodeIcon className="size-2.5" />
                  </Button>
                </div>
              </div>

              {inlineDiffOpen && (
                <div className="mt-1">
                  <CodeDiffViewer diffs={diffs} maxInitialFiles={5} />
                </div>
              )}
            </div>
          )}

          {/* 底部操作条：云效直达 + 本地查看差异 + 就地合入 */}
          <div className="flex items-center justify-between pt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="gap-1 text-muted-foreground hover:text-foreground h-6 px-1.5"
                onClick={() => void openExternal(mrUrl)}
                title="在云效 Codeup 中查看完整讨论、历史评审与原始 Diff"
              >
                <span>云效直达</span>
                <ExternalLinkIcon className="size-3" />
              </Button>

              {diffs.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="gap-1 text-muted-foreground hover:text-foreground h-6 px-1.5 text-xs"
                  onClick={() => setDiffDrawerOpen(true)}
                  title="在本地抽屉中完整查看当前分支差异"
                >
                  <FileCodeIcon className="size-3 text-primary" />
                  <span>查看差异 ({diffs.length})</span>
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isOpen && (
                <WriteOpButton
                  label="确认合入"
                  title={`将 ${mr.sourceBranch} 合入 ${mr.targetBranch}`}
                  variant="default"
                  confirm="dialog"
                  confirmLabel="确认合入"
                  onAction={handleMerge}
                />
              )}
              {!isOpen && isMerged && commits.length > 0 && onCreateMr && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    分支有 {commits.length} 条新提交未合入
                  </span>
                  <Button
                    type="button"
                    variant="default"
                    size="xs"
                    className="h-6 px-2 text-xs"
                    onClick={onCreateMr}
                  >
                    创建新 MR
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 本地代码变更抽屉 (Linear Peek View) */}
      <CodeDiffDrawer
        open={diffDrawerOpen}
        onOpenChange={setDiffDrawerOpen}
        title={mr.title}
        sourceBranch={mr.sourceBranch}
        targetBranch={mr.targetBranch}
        diffs={diffs}
        mrUrl={mrUrl}
        onOpenExternal={openExternal}
        actionNode={
          isOpen ? (
            <WriteOpButton
              label="确认合入"
              title={`将 ${mr.sourceBranch} 合入 ${mr.targetBranch}`}
              variant="default"
              confirm="dialog"
              confirmLabel="确认合入"
              onAction={handleMerge}
            />
          ) : !isOpen && isMerged && commits.length > 0 && onCreateMr ? (
            <Button
              type="button"
              variant="default"
              size="xs"
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                setDiffDrawerOpen(false);
                onCreateMr();
              }}
            >
              创建新 MR
            </Button>
          ) : null
        }
      />
    </div>
  );
}
