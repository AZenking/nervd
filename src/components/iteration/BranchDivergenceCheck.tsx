import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import * as api from '@/lib/api';

type BaselineState = 'loading' | 'exists' | 'missing' | 'error' | undefined;
type CheckState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; developmentOnly: number; baselineOnly: number }
  | { status: 'error'; message: string };

function comparisonCommits(value: unknown): unknown[] {
  let current = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) break;
    const object = current as Record<string, unknown>;
    if (Array.isArray(object.commits)) return object.commits;
    current = object.result ?? object.data ?? object.Result ?? object.Data;
  }
  throw new Error('云效返回的比较结果缺少提交列表');
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
  const [refreshKey, setRefreshKey] = useState(0);
  const baseline = baselineBranch?.trim() ?? '';

  useEffect(() => {
    if (!baseline || baselineState !== 'exists') {
      setCheck({ status: 'idle' });
      return;
    }
    let active = true;
    setCheck({ status: 'loading' });
    void (async () => {
      try {
        if (baseline === developmentBranch) {
          if (active) setCheck({ status: 'ready', developmentOnly: 0, baselineOnly: 0 });
          return;
        }
        const [developmentDiff, baselineDiff] = await Promise.all([
          api.compareBranches(repoId, baseline, developmentBranch),
          api.compareBranches(repoId, developmentBranch, baseline),
        ]);
        if (active) {
          setCheck({
            status: 'ready',
            developmentOnly: comparisonCommits(developmentDiff).length,
            baselineOnly: comparisonCommits(baselineDiff).length,
          });
        }
      } catch (error) {
        if (active) {
          setCheck({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      }
    })();

    return () => { active = false; };
  }, [repoId, developmentBranch, baseline, baselineState, refreshKey]);

  if (!baseline) {
    return <span className="text-[11px] text-muted-foreground">先选择分支模板</span>;
  }
  if (baselineState === 'missing') {
    return <span className="text-[11px] text-muted-foreground">迭代分支尚未创建</span>;
  }
  if (baselineState === 'error') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        基准查询失败
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={onRetryBaseline}>
          重试
        </Button>
      </span>
    );
  }
  if (baselineState !== 'exists') {
    return <span className="text-[11px] text-muted-foreground">正在核实迭代分支…</span>;
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
        className="h-6 px-2 text-[11px]"
        disabled={check.status === 'loading' || check.status === 'idle'}
        onClick={() => setRefreshKey((value) => value + 1)}
        title={`比较 ${developmentBranch} 与 ${baseline}`}
      >
        {check.status === 'loading' || check.status === 'idle' ? '自动查询中…' : '重新检查'}
      </Button>
      {ready && (
        <Badge
          variant="outline"
          className={aligned ? 'border-emerald-500/40 text-emerald-700' : 'border-amber-500/50 text-amber-700'}
        >
          {aligned ? '一致' : '有偏差'}
        </Badge>
      )}
      {summary && <span className="text-[11px] text-muted-foreground">{summary}</span>}
    </div>
  );
}
