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
  developerBranchState?: BaselineState,
): UseBranchDivergenceResult {
  const [check, setCheck] = useState<BranchCheckState>({ status: 'idle' });
  const [diffs, setDiffs] = useState<FileDiffItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const baseline = baselineBranch?.trim() ?? '';

  useEffect(() => {
    if (
      !baseline
      || baselineState !== 'exists'
      || !developmentBranch
      || developerBranchState === 'missing'
      || developerBranchState === 'loading'
    ) {
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
  }, [repoId, developmentBranch, baseline, baselineState, developerBranchState, refreshKey]);

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
  developerBranchState,
  onRetryBaseline,
}: {
  repoId: number;
  developmentBranch: string;
  baselineBranch?: string;
  baselineState: BaselineState;
  /** 开发分支远端存在性；缺失时跳过 compare，避免对不存在分支发起比较报错。 */
  developerBranchState?: BaselineState;
  onRetryBaseline: () => void;
}) {
  const { check, diffs, refetch } = useBranchDivergence(
    repoId,
    developmentBranch,
    baselineBranch,
    baselineState,
    developerBranchState,
  );
  const [diffDrawerOpen, setDiffDrawerOpen] = useState(false);
  const baseline = baselineBranch?.trim() ?? '';

  if (!baseline) {
    return <div className="py-1.5 text-xs text-muted-foreground">先选择分支模板</div>;
  }
  if (baselineState === 'missing') {
    return <div className="py-1.5 text-xs text-muted-foreground">迭代分支尚未创建</div>;
  }
  if (baselineState === 'error') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        基准查询失败
        <Button type="button" variant="ghost" size="xs" onPress={onRetryBaseline}>
          重试
        </Button>
      </span>
    );
  }
  if (baselineState !== 'exists') {
    return <Skeleton className="h-5 w-24 rounded" />;
  }
  if (developerBranchState === 'missing') {
    return <div className="py-1.5 text-xs text-muted-foreground">需求分支尚未创建</div>;
  }
  if (developerBranchState === 'loading') {
    return <Skeleton className="h-5 w-24 rounded" />;
  }

  const ready = check.status === 'ready';
  const aligned = ready && check.developmentOnly === 0 && check.baselineOnly === 0;
  const devOnly = ready ? (check.developmentOnly ?? 0) : 0;
  const baseOnly = ready ? (check.baselineOnly ?? 0) : 0;
  const leadLabel = aligned
    ? '与迭代分支已同步'
    : baseOnly > 0
      ? `迭代领先 ${baseOnly} 条提交`
      : `开发领先 ${devOnly} 条提交`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5 font-medium text-foreground">
          <GitCompareIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span>开发分支 ↔ 迭代分支</span>
        </div>
        <span className="hidden h-3 w-px shrink-0 bg-border sm:block" aria-hidden="true" />

        {check.status === 'loading' && <Skeleton className="h-4 w-28 rounded" />}

        {check.status === 'error' && (
          // 错误文案常驻并换行完整呈现（DESIGN G：错误原因优先换行，不能只靠悬停读全）
          <span className="inline-flex min-w-0 items-start gap-1 text-destructive">
            <AlertCircleIcon className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 whitespace-normal break-words">比较失败：{check.message}</span>
          </span>
        )}

        {ready && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 font-medium',
                aligned ? 'text-success' : 'text-warning',
              )}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
              {aligned ? <CheckIcon className="size-3 shrink-0" aria-hidden="true" /> : null}
              <span className="font-mono tabular-nums">{leadLabel}</span>
            </span>
            {!aligned && (
              <span className="text-[11px] text-muted-foreground">
                开发独有 <span className="font-mono tabular-nums">{devOnly}</span> ·
                迭代独有 <span className="font-mono tabular-nums">{baseOnly}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!aligned && diffs.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="cursor-pointer text-primary hover:text-primary/80"
            onPress={() => setDiffDrawerOpen(true)}
          >
            <FileCodeIcon className="size-3" aria-hidden="true" />
            查看差异
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger
            render={(
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-disabled={check.status === 'loading' || undefined}
                aria-label={`重新检查 ${developmentBranch} 与 ${baseline} 的落差`}
                onPress={() => {
                  if (check.status === 'loading') return;
                  refetch();
                }}
                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                <RefreshCwIcon className={cn('size-3', check.status === 'loading' && 'animate-spin text-primary')} />
              </Button>
            )}
          />
          <TooltipContent>
            {`重新检查 ${developmentBranch} 与 ${baseline} 的落差`}
          </TooltipContent>
        </Tooltip>
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
