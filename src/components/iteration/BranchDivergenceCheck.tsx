import { useEffect, useState } from 'react';
import { AlertCircleIcon, CheckIcon, FileCodeIcon, GitCompareIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import * as api from '@/lib/api';
import { errorLog, humanizeError } from '@/lib/error-format';
import { parseFileDiffs, type FileDiffItem } from './requirement/diff-utils';
import { CodeDiffDrawer } from './requirement/code-diff-drawer';

export type BaselineState = 'loading' | 'exists' | 'missing' | 'error' | undefined;
export type BranchCheckState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; developmentOnly: number; baselineOnly: number }
  | { status: 'error'; message: string };

export interface UseBranchDivergenceResult {
  check: BranchCheckState;
  diffs: FileDiffItem[];
  refreshKey: number;
  refetch: () => void;
}

/** 解析云效 compare 返回（多层包裹防御）为提交列表；BranchStateDiagram 复用同一口径 */
export function comparisonCommits(value: unknown): unknown[] {
  let current = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) break;
    const object = current as Record<string, unknown>;
    if (Array.isArray(object.commits)) return object.commits;
    current = object.result ?? object.data ?? object.Result ?? object.Data;
  }
  throw new Error('云效返回的比较结果缺少提交列表');
}

/** 解析云效 compare 返回（多层包裹防御）为文件差异列表 */
export function comparisonDiffs(value: unknown): unknown[] {
  let current = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) break;
    const object = current as Record<string, unknown>;
    if (Array.isArray(object.diffs)) return object.diffs;
    current = object.result ?? object.data ?? object.Result ?? object.Data;
  }
  return [];
}

/** 统一获取开发分支与迭代基准分支的落差及差异详情 */
export function useBranchDivergence(
  repoId: number,
  developmentBranch: string,
  baselineBranch?: string,
  baselineState?: BaselineState,
): UseBranchDivergenceResult {
  const [check, setCheck] = useState<BranchCheckState>({ status: 'idle' });
  const [diffs, setDiffs] = useState<FileDiffItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const baseline = baselineBranch?.trim() ?? '';

  useEffect(() => {
    if (!baseline || baselineState !== 'exists' || !developmentBranch) {
      setCheck({ status: 'idle' });
      setDiffs([]);
      return;
    }
    let active = true;
    setCheck({ status: 'loading' });
    void (async () => {
      try {
        if (baseline === developmentBranch) {
          if (active) {
            setCheck({ status: 'ready', developmentOnly: 0, baselineOnly: 0 });
            setDiffs([]);
          }
          return;
        }
        const [developmentDiff, baselineDiff] = await Promise.all([
          api.compareBranches(repoId, baseline, developmentBranch),
          api.compareBranches(repoId, developmentBranch, baseline),
        ]);
        if (active) {
          const parsed = parseFileDiffs(comparisonDiffs(developmentDiff));
          setDiffs(parsed);
          setCheck({
            status: 'ready',
            developmentOnly: comparisonCommits(developmentDiff).length,
            baselineOnly: comparisonCommits(baselineDiff).length,
          });
        }
      } catch (error) {
        if (active) {
          errorLog('branch-divergence', error);
          setDiffs([]);
          setCheck({ status: 'error', message: humanizeError(error, '分支差异检查失败') });
        }
      }
    })();

    return () => { active = false; };
  }, [repoId, developmentBranch, baseline, baselineState, refreshKey]);

  return {
    check,
    diffs,
    refreshKey,
    refetch: () => setRefreshKey((k) => k + 1),
  };
}

export function BranchDivergenceCheck({
  repoId,
  developmentBranch,
  baselineBranch,
  baselineState,
  onRetryBaseline,
}: {
  repoId: number;
  developmentBranch: string;
  baselineBranch?: string;
  baselineState: BaselineState;
  onRetryBaseline: () => void;
}) {
  const { check, diffs, refetch } = useBranchDivergence(
    repoId,
    developmentBranch,
    baselineBranch,
    baselineState,
  );
  const [diffDrawerOpen, setDiffDrawerOpen] = useState(false);
  const baseline = baselineBranch?.trim() ?? '';

  if (!baseline) {
    return <span className="text-xs text-muted-foreground">先选择分支模板</span>;
  }
  if (baselineState === 'missing') {
    return <span className="text-xs text-muted-foreground">迭代分支尚未创建</span>;
  }
  if (baselineState === 'error') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        基准查询失败
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={onRetryBaseline}>
          重试
        </Button>
      </span>
    );
  }
  if (baselineState !== 'exists') {
    return <Skeleton className="h-5 w-24 rounded" />;
  }

  const ready = check.status === 'ready';
  const aligned = ready && check.developmentOnly === 0 && check.baselineOnly === 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/30 bg-muted/15 px-2.5 py-1.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-1 font-medium text-foreground shrink-0">
          <GitCompareIcon className="size-3 text-muted-foreground" />
          <span>分支同步:</span>
        </div>

        {check.status === 'loading' && (
          <Skeleton className="h-4 w-28 rounded" />
        )}

        {check.status === 'error' && (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex items-center gap-1 text-destructive truncate cursor-help" />}>
              <AlertCircleIcon className="size-3 shrink-0" />比较失败
            </TooltipTrigger>
            <TooltipContent>{check.message}</TooltipContent>
          </Tooltip>
        )}

        {ready && (
          <div className="flex flex-wrap items-center gap-1.5">
            {aligned ? (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckIcon className="size-3" />已同步迭代分支
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                有落差 (开发独有 {check.developmentOnly} · 迭代独有 {check.baselineOnly})
              </span>
            )}

            {!aligned && diffs.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                onClick={() => setDiffDrawerOpen(true)}
                title="在本地抽屉中查看两分支代码差异"
              >
                <FileCodeIcon className="size-3 text-primary" />
                <span>差异 ({diffs.length})</span>
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          disabled={check.status === 'loading'}
          onClick={refetch}
          className="text-muted-foreground hover:text-foreground disabled:opacity-40 p-1 rounded transition-colors cursor-pointer"
          title={`重新检查 ${developmentBranch} 与 ${baseline} 的落差`}
        >
          <RefreshCwIcon className={cn('size-3', check.status === 'loading' && 'animate-spin text-primary')} />
        </button>
      </div>

      {/* 本地代码分支差异抽屉 */}
      <CodeDiffDrawer
        open={diffDrawerOpen}
        onOpenChange={setDiffDrawerOpen}
        title={`分支落差对比`}
        sourceBranch={developmentBranch}
        targetBranch={baseline}
        diffs={diffs}
      />
    </div>
  );
}
