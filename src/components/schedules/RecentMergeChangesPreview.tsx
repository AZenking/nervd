import { useState, useTransition } from 'react';
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileDiffIcon,
  GitCommitIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { CodeDiffDrawer } from '@/components/iteration/requirement/code-diff-drawer';
import { parseFileDiffs, type FileDiffItem } from '@/components/iteration/requirement/diff-utils';
import { comparisonDiffs } from '@/components/iteration/BranchDivergenceCheck';
import { parseCompareCommits } from '@/lib/branch-merge-runner';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { toast } from '@/components/ui/toast';
import type { MergeCommitItem, ScheduledTask } from '@/types/schedule';
import { cn } from '@/lib/utils';

export interface RecentMergeChangesPreviewProps {
  task: ScheduledTask;
  className?: string;
}

export function RecentMergeChangesPreview({
  task,
  className,
}: RecentMergeChangesPreviewProps) {
  const act = task.action;

  const [expanded, setExpanded] = useState(false);
  const [diffDrawerOpen, setDiffDrawerOpen] = useState(false);
  const [diffs, setDiffs] = useState<FileDiffItem[]>([]);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // 探测当前分支最新落差与待合入变更点
  const [probing, startProbing] = useTransition();
  const [probeResult, setProbeResult] = useState<{
    commits: MergeCommitItem[];
    diffsCount: number;
    hasConflict: boolean;
    probedAt: string;
  } | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  const items = useApp((s) => s.items);
  const settings = useApp((s) => s.settings);
  const openWorkitem = useUi((s) => s.openWorkitem);

  // hooks 必须无条件执行：非分支合并任务在这里统一退出，避免条件调用改变 hook 顺序
  if (act.type !== 'branch_merge') return null;

  const lastChanges = task.lastMergeChanges;
  // 变更点优先取最新探测结果，若无则使用上次执行产生的持久化变更点
  const displayCommits = probeResult ? probeResult.commits : lastChanges?.commits ?? [];
  const isProbeActive = probeResult !== null;
  const totalDiffs = probeResult ? probeResult.diffsCount : lastChanges?.diffsCount ?? 0;
  const firstCommit = displayCommits[0];

  // 点击需求号处理：优先打开工作项 Peek/工作台抽屉，未命中则复制到剪贴板
  const handleWorkitemClick = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const matched = items.find((i) => i.identifier.toUpperCase() === key.toUpperCase());
    if (matched) {
      openWorkitem(matched.workitemId, {
        workitemId: matched.workitemId,
        identifier: matched.identifier,
        subject: matched.subject,
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(key);
      toast.add({
        title: `已复制需求编号 ${key}`,
        type: 'default',
      });
    } catch {
      // ignore
    }
  };

  // 探测当前两分支最新落差（探测待合入变更点）
  const handleProbeChanges = () => {
    startProbing(async () => {
      setProbeError(null);
      try {
        const compareRes = await api.compareBranches(
          act.repoId,
          act.targetBranch,
          act.sourceBranch,
        );
        const linkPattern = settings?.linkPattern;
        const rawCommits =
          (compareRes as any)?.result?.commits ??
          (compareRes as any)?.data?.commits ??
          (compareRes as any)?.commits ??
          [];
        const rawDiffs = comparisonDiffs(compareRes);
        const parsedCommits = parseCompareCommits(rawCommits, linkPattern);

        setProbeResult({
          commits: parsedCommits,
          diffsCount: rawDiffs.length,
          hasConflict: Boolean((compareRes as any)?.hasConflict ?? (compareRes as any)?.result?.hasConflict),
          probedAt: new Date().toISOString(),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setProbeError(msg);
        toast.add({
          title: '探测分支变更点失败',
          description: msg,
          type: 'error',
        });
      }
    });
  };

  // 打开代码差异抽屉
  const handleOpenDiffDrawer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDiffDrawerOpen(true);
    setLoadingDiff(true);
    try {
      const compareRes = await api.compareBranches(
        act.repoId,
        act.targetBranch,
        act.sourceBranch,
      );
      const rawDiffs = comparisonDiffs(compareRes);
      const parsed = parseFileDiffs(rawDiffs);
      setDiffs(parsed);
    } catch (err) {
      toast.add({
        title: '获取代码差异失败',
        description: String(err),
        type: 'error',
      });
    } finally {
      setLoadingDiff(false);
    }
  };

  return (
    <div
      className={cn('flex flex-col gap-1 pt-0.5 text-xs select-none', className)}
      onClick={(e) => e.stopPropagation()} // 阻止向父级冒泡触发打开编辑
    >
      {/* 场景 1：有变更点提交时 —— 极致精简单行呈现 */}
      {displayCommits.length > 0 && firstCommit ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap sm:flex-nowrap">
            {/* 前置指示与状态 */}
            <span className="flex items-center gap-1 text-muted-foreground shrink-0 text-[11px] font-medium">
              <GitCommitIcon className="size-3 text-primary shrink-0" />
              <span>{isProbeActive ? `最新探测 (${displayCommits.length}):` : '最近合入:'}</span>
            </span>

            {/* 短 SHA */}
            <code className="font-mono text-primary font-semibold text-[11px] shrink-0">
              {firstCommit.shortId || firstCommit.id.slice(0, 7)}
            </code>

            {/* 提交标题 */}
            <OverflowTooltip
              text={firstCommit.title}
              className="truncate text-foreground/90 font-medium text-xs min-w-0"
            />

            {/* 提取的需求编号徽标 */}
            {firstCommit.workitems?.map((wi) => (
              <button
                key={wi}
                type="button"
                onClick={(e) => handleWorkitemClick(wi, e)}
                title={`查看或复制需求 ${wi}`}
                className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 bg-primary/10 text-primary hover:bg-primary/20 text-[9px] font-mono font-medium transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span>{wi}</span>
              </button>
            ))}

            {/* 提交作者 */}
            {firstCommit.authorName && (
              <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                · {firstCommit.authorName}
              </span>
            )}

            {/* 变动文件数 */}
            {totalDiffs > 0 && (
              <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                · {totalDiffs} 个文件变动
              </span>
            )}

            {/* 多条折叠展开按钮 */}
            {displayCommits.length > 1 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline font-mono shrink-0 ml-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span>{expanded ? '收起' : `+${displayCommits.length - 1} 条`}</span>
                {expanded ? (
                  <ChevronUpIcon className="size-2.5" />
                ) : (
                  <ChevronDownIcon className="size-2.5" />
                )}
              </button>
            )}

            {/* 右侧微型快捷操作 */}
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={loadingDiff}
                      className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                      onClick={handleOpenDiffDrawer}
                    >
                      {loadingDiff ? (
                        <Spinner className="size-2.5 text-primary animate-spin" />
                      ) : (
                        <FileDiffIcon className="size-2.5 text-primary" />
                      )}
                      <span>差异</span>
                    </Button>
                  }
                />
                <TooltipContent>在抽屉中查看代码改动差异</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={probing}
                      className="size-5 text-muted-foreground hover:text-foreground"
                      onClick={handleProbeChanges}
                      aria-label="探测最新分支落差与待合入变更点"
                    >
                      <RefreshCwIcon className={cn('size-2.5', probing && 'animate-spin text-primary')} />
                    </Button>
                  }
                />
                <TooltipContent>探测源分支相对目标分支当前的最新变更点与落差</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* 展开的更多变更点列表（带细线微缩进，极致干净） */}
          {expanded && displayCommits.length > 1 && (
            <div className="flex flex-col gap-1 pl-3.5 border-l border-border/50 ml-1.5 my-1">
              {displayCommits.slice(1).map((c) => (
                <div
                  key={c.id || c.shortId}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <code className="font-mono text-primary font-medium text-[10px] shrink-0">
                    {c.shortId || c.id.slice(0, 7)}
                  </code>
                  <span className="truncate text-foreground/85 font-medium">{c.title}</span>
                  {c.workitems?.map((wi) => (
                    <button
                      key={wi}
                      type="button"
                      onClick={(e) => handleWorkitemClick(wi, e)}
                      title={`查看或复制需求 ${wi}`}
                      className="inline-flex items-center rounded px-0.5 bg-primary/10 text-primary hover:bg-primary/20 text-[9px] font-mono cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      {wi}
                    </button>
                  ))}
                  {c.authorName && (
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                      · {c.authorName}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : lastChanges?.status === 'up_to_date' ? (
        /* 场景 2：两端已对齐，无改动 */
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CheckIcon className="size-3 text-success shrink-0" />
          <span>目标分支已对齐，无待合入改动</span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={probing}
                  className="size-5 text-muted-foreground hover:text-foreground"
                  onClick={handleProbeChanges}
                  aria-label="探测最新分支落差"
                >
                  <RefreshCwIcon className={cn('size-2.5', probing && 'animate-spin')} />
                </Button>
              }
            />
            <TooltipContent>探测最新分支落差</TooltipContent>
          </Tooltip>
        </div>
      ) : lastChanges?.status === 'conflict_aborted' ? (
        /* 场景 3：冲突中止 */
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertTriangleIcon className="size-3 shrink-0" />
          <span>检测到冲突已安全中止（原分支未受改动）</span>
        </div>
      ) : (
        /* 场景 4：尚未执行过合并 */
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="text-muted-foreground">尚未执行合并</span>
          <button
            type="button"
            onClick={handleProbeChanges}
            disabled={probing}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium cursor-pointer ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <RefreshCwIcon className={cn('size-2.5', probing && 'animate-spin text-primary')} />
            <span>探测待合入变更</span>
          </button>
        </div>
      )}

      {probeError && (
        <div className="text-[10px] text-destructive font-mono">
          探测报错: {probeError}
        </div>
      )}

      {/* 本地代码变更抽屉 */}
      <CodeDiffDrawer
        open={diffDrawerOpen}
        onOpenChange={setDiffDrawerOpen}
        title={`${act.sourceBranch} → ${act.targetBranch}`}
        sourceBranch={act.sourceBranch}
        targetBranch={act.targetBranch}
        diffs={diffs}
      />
    </div>
  );
}
