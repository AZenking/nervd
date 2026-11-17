import { useEffect, useState } from 'react';
import { AlertCircleIcon, CheckIcon, FileCodeIcon, GitCompareIcon, RefreshCwIcon } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
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
    return <span className="text-xs text-muted-foreground">先选择分支模板</span>;
  }
  if (baselineState === 'missing') {
    return <span className="text-xs text-muted-foreground">迭代分支尚未创建</span>;
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
    return <span className="text-xs text-muted-foreground">需求分支尚未创建</span>;
  }
  if (developerBranchState === 'loading') {
    return <Skeleton className="h-5 w-24 rounded" />;
  }

  const ready = check.status === 'ready';
  const aligned = ready && check.developmentOnly === 0 && check.baselineOnly === 0;

  return (
    <Surface variant="secondary" className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-1 font-medium text-foreground shrink-0">
          <GitCompareIcon className="size-3 text-muted-foreground" />
          <span>分支同步:</span>
        </div>

        {check.status === 'loading' && (
          <Skeleton className="h-4 w-28 rounded" />
        )}

        {check.status === 'error' && (
          // 错误文案常驻并换行完整呈现（DESIGN G：错误原因优先换行，不能只靠悬停读全；也不再挂原生 title 重复提示）
          <span className="inline-flex min-w-0 items-start gap-1 text-destructive">
            <AlertCircleIcon className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 whitespace-normal break-words">比较失败：{check.message}</span>
          </span>
        )}

        {ready && (
          <div className="flex flex-wrap items-center gap-1.5">
            {aligned ? (
              <Chip size="sm" variant="soft" color="success" className="gap-1">
                <CheckIcon className="size-3" />
                <Chip.Label>已同步迭代分支</Chip.Label>
              </Chip>
            ) : (
              <Chip size="sm" variant="soft" color="warning" className="gap-1">
                <Chip.Label>
                  有落差 (开发独有 <span className="font-mono tabular-nums">{check.developmentOnly}</span> · 迭代独有 <span className="font-mono tabular-nums">{check.baselineOnly}</span>)
                </Chip.Label>
              </Chip>
            )}

            {!aligned && diffs.length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      type="button"
                      variant="ghost"
                      size="2xs"
                      className="text-muted-foreground hover:text-foreground gap-1"
                      onPress={() => setDiffDrawerOpen(true)}
                    >
                      <FileCodeIcon className="size-3 text-primary" />
                      <span>差异 (<span className="font-mono tabular-nums">{diffs.length}</span>)</span>
                    </Button>
                  )}
                />
                <TooltipContent>
                  在本地抽屉中查看两分支代码差异
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
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
                className="text-muted-foreground hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
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
    </Surface>
  );
}
