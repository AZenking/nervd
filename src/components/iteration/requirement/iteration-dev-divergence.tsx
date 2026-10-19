import { useEffect, useState } from 'react';
import { CheckIcon, GitBranchIcon, RefreshCwIcon, AlertCircleIcon } from 'lucide-react';
import * as api from '@/lib/api';
import { findRemoteBranch } from '@/lib/iteration-branches';
import { comparisonCommits } from '../BranchDivergenceCheck';
import { getCustomDevBranch } from '@/lib/dev-branch-settings';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface IterationDevDivergenceProps {
  repoId: number;
  /** 迭代基准分支名，如 iteration/2026-10/core */
  baselineBranch?: string;
  /** 模板中配置的来源分支，如 master 或 test */
  sourceBranch?: string;
  /** 迭代基准分支的存在状态 */
  baselineState?: 'loading' | 'exists' | 'missing' | 'error';
  className?: string;
}

type CheckStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'dev-missing'; checkedDevBranch: string }
  | { state: 'ready'; devBranch: string; aheadDev: number; behindDev: number }
  | { state: 'error'; message: string };

/**
 * 监控当前迭代基准分支与仓库 dev/集成主干分支的差异与合入状态。
 * 符合 Linear 极简流式状态设计：状态胶囊 + 统计徽标 + 微型刷新按键。
 */
export function IterationDevDivergence({
  repoId,
  baselineBranch,
  sourceBranch,
  baselineState,
  className,
}: IterationDevDivergenceProps) {
  const [status, setStatus] = useState<CheckStatus>({ state: 'idle' });
  const [refreshKey, setRefreshKey] = useState(0);

  const baseline = baselineBranch?.trim() || '';

  useEffect(() => {
    let active = true;

    if (!baseline || baselineState !== 'exists') {
      setStatus({ state: 'idle' });
      return () => { active = false; };
    }

    setStatus({ state: 'loading' });

    void (async () => {
      try {
        const configuredDev = getCustomDevBranch();
        // 1. 先探测配置的 dev 分支是否存在
        let targetBranch = configuredDev;
        const devExists = await findRemoteBranch(repoId, targetBranch);

        if (!devExists) {
          // 若配置的 dev 不存在，尝试模板源分支（如 master），仍无则标记 dev-missing
          if (sourceBranch && sourceBranch !== targetBranch) {
            const fallbackExists = await findRemoteBranch(repoId, sourceBranch);
            if (fallbackExists) {
              targetBranch = sourceBranch;
            } else {
              if (active) setStatus({ state: 'dev-missing', checkedDevBranch: configuredDev });
              return;
            }
          } else {
            if (active) setStatus({ state: 'dev-missing', checkedDevBranch: configuredDev });
            return;
          }
        }

        if (baseline === targetBranch) {
          if (active) {
            setStatus({
              state: 'ready',
              devBranch: targetBranch,
              aheadDev: 0,
              behindDev: 0,
            });
          }
          return;
        }

        // 2. 比较 baselineBranch 与 targetBranch
        // baseline 相比 targetBranch 多出的提交：aheadDev (待合入 targetBranch 的提交数)
        // targetBranch 相比 baseline 多出的提交：behindDev
        const [aheadDiff, behindDiff] = await Promise.all([
          api.compareBranches(repoId, targetBranch, baseline),
          api.compareBranches(repoId, baseline, targetBranch),
        ]);

        if (active) {
          const aheadDev = comparisonCommits(aheadDiff).length;
          const behindDev = comparisonCommits(behindDiff).length;
          setStatus({
            state: 'ready',
            devBranch: targetBranch,
            aheadDev,
            behindDev,
          });
        }
      } catch (err) {
        if (active) {
          setStatus({
            state: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    return () => { active = false; };
  }, [repoId, baseline, sourceBranch, baselineState, refreshKey]);

  // 监听全局 dev-branch-changed 自定义事件，配置变动时自愈刷新
  useEffect(() => {
    const handleChanged = () => setRefreshKey((k) => k + 1);
    window.addEventListener('nervd:dev-branch-changed', handleChanged);
    return () => window.removeEventListener('nervd:dev-branch-changed', handleChanged);
  }, []);

  if (!baseline || baselineState !== 'exists') {
    return null;
  }

  return (
    <div className={cn('flex items-center justify-between gap-1.5 text-[11px]', className)}>
      <div className="flex min-w-0 items-center gap-1.5 flex-1">
        <GitBranchIcon className="size-3 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground shrink-0">主干同步:</span>

        {status.state === 'loading' && (
          <Skeleton className="h-4 w-20 rounded" />
        )}

        {status.state === 'dev-missing' && (
          <Tooltip>
            <TooltipTrigger render={<span className="truncate text-muted-foreground cursor-help" />}>
              无 {status.checkedDevBranch} 分支
            </TooltipTrigger>
            <TooltipContent>
              仓库线上未检测到「{status.checkedDevBranch}」分支，请确认分支名或在设置中修改。
            </TooltipContent>
          </Tooltip>
        )}

        {status.state === 'error' && (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex items-center gap-1 text-destructive truncate cursor-help" />}>
              <AlertCircleIcon className="size-3 shrink-0" />比较失败
            </TooltipTrigger>
            <TooltipContent>{status.message}</TooltipContent>
          </Tooltip>
        )}

        {status.state === 'ready' && (
          <div className="flex min-w-0 items-center gap-1.5">
            {status.aheadDev === 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.2 font-medium text-emerald-600 dark:text-emerald-400">
                <CheckIcon className="size-3 shrink-0" />
                <span>已合入 {status.devBranch}</span>
              </span>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.2 font-medium text-amber-600 dark:text-amber-400 cursor-help truncate" />
                  }
                >
                  <span>待合入 {status.devBranch} ({status.aheadDev} 条)</span>
                </TooltipTrigger>
                <TooltipContent>
                  迭代分支有 {status.aheadDev} 条提交尚未合入 {status.devBranch}
                  {status.behindDev > 0 && `；同时落后 ${status.behindDev} 条提交`}
                </TooltipContent>
              </Tooltip>
            )}

            {status.behindDev > 0 && status.aheadDev === 0 && (
              <span className="text-[10px] text-muted-foreground/80 font-mono">
                落后 {status.behindDev}
              </span>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={status.state === 'loading'}
        onClick={() => setRefreshKey((k) => k + 1)}
        className="text-muted-foreground hover:text-foreground disabled:opacity-40 p-0.5 rounded transition-colors cursor-pointer shrink-0"
        title="刷新与 dev/集成主干的差异检测"
      >
        <RefreshCwIcon className={cn('size-3', status.state === 'loading' && 'animate-spin text-primary')} />
      </button>
    </div>
  );
}
