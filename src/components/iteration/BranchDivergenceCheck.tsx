import { useEffect, useState } from 'react';
import { FileCodeIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import * as api from '@/lib/api';
import { errorLog, humanizeError } from '@/lib/error-format';
import { parseFileDiffs, type FileDiffItem } from './requirement/diff-utils';
import { CodeDiffDrawer } from './requirement/code-diff-drawer';

type BaselineState = 'loading' | 'exists' | 'missing' | 'error' | undefined;
type CheckState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; developmentOnly: number; baselineOnly: number }
  | { status: 'error'; message: string };

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
  const [check, setCheck] = useState<CheckState>({ status: 'idle' });
  const [diffs, setDiffs] = useState<FileDiffItem[]>([]);
  const [diffDrawerOpen, setDiffDrawerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const baseline = baselineBranch?.trim() ?? '';

  useEffect(() => {
    if (!baseline || baselineState !== 'exists') {
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
  const summary = check.status === 'error'
    ? `比较失败：${check.message}`
    : ready
      ? aligned
        ? '两边提交一致'
        : `开发分支独有 ${check.developmentOnly} 条 · 迭代分支独有 ${check.baselineOnly} 条`
      : '';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs"
        disabled={check.status === 'loading' || check.status === 'idle'}
        onClick={() => setRefreshKey((value) => value + 1)}
        title={`比较 ${developmentBranch} 与 ${baseline}`}
      >
        {check.status === 'loading' || check.status === 'idle' ? '自动查询中…' : '重新检查'}
      </Button>
      {ready && (
        <Badge
          variant="outline"
          className={aligned ? 'border-sig-ok/40 text-foreground' : 'border-sig-run/50 text-foreground'}
        >
          {aligned ? '一致' : '有偏差'}
        </Badge>
      )}
      {!aligned && diffs.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground gap-1"
          onClick={() => setDiffDrawerOpen(true)}
          title="在本地抽屉中查看两分支代码差异"
        >
          <FileCodeIcon className="size-3 text-primary" />
          <span>查看差异 ({diffs.length})</span>
        </Button>
      )}
      {summary && <span className="text-xs text-muted-foreground">{summary}</span>}

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
