import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import * as api from '@/lib/api';
import { errorLog, humanizeError } from '@/lib/error-format';
import { comparisonCommits } from './BranchDivergenceCheck';
import { useMeasure } from '@/hooks/use-measure';
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow,
  type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

/**
 * 分支同步树（真实数据）：根 = 当前需求 → 关联仓库 → 各自的 基准分支(源) / 迭代分支 / 开发分支。
 * 树边描述分支的派生关系（切基准、拉开发），左侧上行箭头描述合并状态：
 *   开发分支 → 迭代分支（合并 MR）、迭代分支 → 基准分支（迭代合入），
 * 状态来自对每组分支的真实双向 compare（与行内 BranchDivergenceCheck 同一口径）。
 */

type Tone = 'ok' | 'warn' | 'err' | 'muted';

export interface BranchSyncRepo {
  /** 稳定键：repoId 或 repoId:branch */
  key: string;
  repoId: number;
  repoName: string;
  /** 模板源分支（基准分支）；缺失时不绘制该层 */
  sourceBranch?: string;
  /** 需求开发分支；未匹配到时为 undefined（节点显示占位） */
  developmentBranch?: string;
  /** 迭代基准分支 */
  baselineBranch?: string;
  baselineState: 'loading' | 'exists' | 'missing' | 'error';
}

interface ReadyResult { status: 'ready'; toOnly: number; fromOnly: number }
interface ErrorResult { status: 'error'; message: string }
type ResultEntry = ReadyResult | ErrorResult;

interface MergeState { label: string; tone: Tone }

/** from=上游 to=下游：下游有、上游没有 → 待合入；双方一致 → 已合入/一致 */
function mergeState(toOnly: number, fromOnly: number, sameLabel: string): MergeState {
  if (toOnly === 0 && fromOnly === 0) return { label: sameLabel, tone: 'ok' };
  if (toOnly === 0) return { label: `已合入（上游多 ${fromOnly} 条）`, tone: 'ok' };
  if (fromOnly === 0) return { label: `待合入 ${toOnly} 条`, tone: 'warn' };
  return { label: `分叉 ${toOnly} · ${fromOnly}`, tone: 'warn' };
}

const shortRepoName = (name: string) => (name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name);

// ---------------------------------------------------------------- 画布节点

const HIDDEN_HANDLE = {
  visibility: 'hidden', width: 0, height: 0, minWidth: 0, minHeight: 0, border: 'none',
} as const;

interface RootData extends Record<string, unknown> { identifier: string; subject: string }
interface RepoData extends Record<string, unknown> { name: string; fullName: string }
interface BranchData extends Record<string, unknown> {
  kind: '基准分支（源）' | '迭代分支' | '开发分支';
  name: string;
  missing?: boolean;
  stateLabel?: string;
  stateTone?: Tone;
}

type RootNodeT = Node<RootData, 'root'>;
type RepoNodeT = Node<RepoData, 'repo'>;
type BranchNodeT = Node<BranchData, 'branch'>;
type DiagramNode = RootNodeT | RepoNodeT | BranchNodeT;

function RootNode({ data }: NodeProps<RootNodeT>) {
  return (
    <div className="w-[280px] rounded-xl border border-primary/40 bg-card px-4 py-3 shadow-md">
      <Handle id="tt" type="target" position={Position.Top} style={HIDDEN_HANDLE} isConnectable={false} />
      <Handle id="sb" type="source" position={Position.Bottom} style={HIDDEN_HANDLE} isConnectable={false} />
      <div className="font-mono text-[11px] text-muted-foreground">{data.identifier}</div>
      <div className="mt-0.5 line-clamp-2 text-sm font-medium leading-5 text-foreground">{data.subject || data.identifier}</div>
    </div>
  );
}

function RepoNode({ data }: NodeProps<RepoNodeT>) {
  return (
    <div className="w-[300px] rounded-lg border border-border bg-card px-3 py-2 shadow-sm" title={data.fullName}>
      <Handle id="tt" type="target" position={Position.Top} style={HIDDEN_HANDLE} isConnectable={false} />
      <Handle id="ttr" type="target" position={Position.Top} style={{ ...HIDDEN_HANDLE, left: '78%' }} isConnectable={false} />
      <Handle id="sb" type="source" position={Position.Bottom} style={HIDDEN_HANDLE} isConnectable={false} />
      <Handle id="sbr" type="source" position={Position.Bottom} style={{ ...HIDDEN_HANDLE, left: '78%' }} isConnectable={false} />
      <div className="truncate text-sm font-medium text-foreground">{data.name}</div>
    </div>
  );
}

const KIND_CLASS: Record<BranchData['kind'], string> = {
  '基准分支（源）': 'bg-muted text-muted-foreground border-border',
  '迭代分支': 'bg-primary/10 text-foreground border-primary/30',
  '开发分支': 'bg-sig-run/10 text-foreground border-sig-run/30',
};

function BranchNode({ data }: NodeProps<BranchNodeT>) {
  const dashed = data.missing;
  return (
    <div className={`w-[300px] rounded-lg border bg-card px-3 py-2 shadow-sm ${dashed ? 'border-dashed border-border' : 'border-border'}`}>
      <Handle id="tt" type="target" position={Position.Top} style={{ ...HIDDEN_HANDLE, left: '50%' }} isConnectable={false} />
      <Handle id="ttr" type="target" position={Position.Top} style={{ ...HIDDEN_HANDLE, left: '78%' }} isConnectable={false} />
      <Handle id="tbl" type="target" position={Position.Bottom} style={{ ...HIDDEN_HANDLE, left: '22%' }} isConnectable={false} />
      <Handle id="sb" type="source" position={Position.Bottom} style={{ ...HIDDEN_HANDLE, left: '50%' }} isConnectable={false} />
      <Handle id="sbr" type="source" position={Position.Bottom} style={{ ...HIDDEN_HANDLE, left: '78%' }} isConnectable={false} />
      <Handle id="stl" type="source" position={Position.Top} style={{ ...HIDDEN_HANDLE, left: '22%' }} isConnectable={false} />
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 ${KIND_CLASS[data.kind]}`}>
          {data.kind}
        </span>
        {data.stateLabel && (
          <span
            className={`inline-block max-w-[170px] truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 ${BADGE_CLASS[data.stateTone ?? 'muted']}`}
            title={data.stateLabel}
          >
            {data.stateLabel}
          </span>
        )}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] leading-4 text-foreground/85" title={data.name}>
        {data.name}
      </div>
    </div>
  );
}

const BADGE_CLASS: Record<Tone, string> = {
  ok: 'border-sig-ok/40 bg-sig-ok/10',
  warn: 'border-sig-run/50 bg-sig-run/10',
  err: 'border-sig-fail/40 bg-sig-fail/10',
  muted: 'border-border bg-muted',
};

const nodeTypes = { root: RootNode, repo: RepoNode, branch: BranchNode };

const EDGE_GRAY = 'var(--sig-idle, #8a8f98)';

function treeEdge(id: string, source: string, target: string): Edge {
  return {
    id, source, sourceHandle: 'sbr', target, targetHandle: 'ttr',
    style: { stroke: EDGE_GRAY, strokeDasharray: '2 3' },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_GRAY },
  };
}

function mergeEdge(id: string, source: string, target: string, state: MergeState | undefined, label: string): Edge {
  const color = state?.tone === 'ok' ? 'var(--sig-ok, #30a46c)' : state?.tone === 'warn' ? 'var(--sig-run, #d9730d)' : EDGE_GRAY;
  return {
    id, source, sourceHandle: 'stl', target, targetHandle: 'tbl',
    label: state ? `${label}：${state.label}` : label,
    labelStyle: { fill: color, fontSize: 11, fontWeight: 600 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: 'var(--card, rgba(255, 255, 255, 0.95))' },
    style: { stroke: color, strokeWidth: 1.6 },
    markerEnd: { type: MarkerType.ArrowClosed, color },
  };
}

// ---------------------------------------------------------------- 数据装配

export default function BranchStateDiagram({
  requirement,
  repos,
}: {
  requirement: { identifier: string; subject: string };
  repos: BranchSyncRepo[];
}) {
  const [results, setResults] = useState<Record<string, ResultEntry>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  // repos 由父组件渲染期构建（数组身份不稳定），以签名串作为 effect 依赖，ref 取最新值
  const reposRef = useRef(repos);
  reposRef.current = repos;
  const reposSignature = repos.map((r) => `${r.key}|${r.baselineBranch}|${r.baselineState}|${r.developmentBranch ?? ''}`).join(';');

  useEffect(() => {
    const entries = reposRef.current.filter((r) => r.baselineState === 'exists');
    if (!entries.length) {
      setResults({});
      return;
    }
    let active = true;
    setResults({});
    const next: Record<string, ResultEntry> = {};
    const run = async (key: string, repoId: number, from: string, to: string) => {
      try {
        const [toDiff, fromDiff] = await Promise.all([
          api.compareBranches(repoId, from, to),
          api.compareBranches(repoId, to, from),
        ]);
        next[key] = { status: 'ready', toOnly: comparisonCommits(toDiff).length, fromOnly: comparisonCommits(fromDiff).length };
      } catch (error) {
        errorLog('branch-sync-diagram', error);
        next[key] = { status: 'error', message: humanizeError(error, '分支比较失败') };
      }
    };
    void (async () => {
      await Promise.all(entries.flatMap((repo) => {
        const tasks: Promise<void>[] = [];
        if (repo.developmentBranch) {
          tasks.push(run(`${repo.key}:A`, repo.repoId, repo.baselineBranch!, repo.developmentBranch));
        }
        if (repo.sourceBranch) {
          tasks.push(run(`${repo.key}:B`, repo.repoId, repo.sourceBranch, repo.baselineBranch!));
        }
        return tasks;
      }));
      if (active) setResults(next);
    })();
    return () => { active = false; };
  }, [reposSignature, refreshKey]);

  const eligible = repos.filter((r) => r.baselineState === 'exists');
  const expectedPairs = eligible.reduce((n, r) => n + (r.developmentBranch ? 1 : 0) + (r.sourceBranch ? 1 : 0), 0);
  const pendingCount = expectedPairs - Object.keys(results).length;

  const nodes = useMemo(() => {
    const list: DiagramNode[] = [];
    const width = Math.max(repos.length, 1) * 360;
    list.push({
      id: 'root', type: 'root', position: { x: Math.max(width / 2 - 140, 0), y: 0 },
      draggable: false, selectable: false,
      data: { identifier: requirement.identifier, subject: requirement.subject },
    });
    repos.forEach((repo, i) => {
      const x = i * 360;
      list.push({
        id: `repo-${repo.key}`, type: 'repo', position: { x, y: 150 },
        draggable: false, selectable: false,
        data: { name: shortRepoName(repo.repoName), fullName: repo.repoName },
      });
      list.push({
        id: `src-${repo.key}`, type: 'branch', position: { x, y: 300 },
        draggable: false, selectable: false,
        data: { kind: '基准分支（源）', name: repo.sourceBranch || '（模板未配置源分支）', missing: !repo.sourceBranch },
      });
      const iterMissing = repo.baselineState === 'missing';
      list.push({
        id: `iter-${repo.key}`, type: 'branch', position: { x, y: 450 },
        draggable: false, selectable: false,
        data: {
          kind: '迭代分支',
          name: repo.baselineBranch || '（模板未生成分支名）',
          missing: iterMissing || !repo.baselineBranch,
          stateLabel: iterMissing ? '未创建' : repo.baselineState === 'loading' ? '核实中…' : repo.baselineState === 'error' ? '查询失败' : undefined,
          stateTone: repo.baselineState === 'error' ? 'err' : 'muted',
        },
      });
      const entryA = repo.developmentBranch && repo.baselineState === 'exists' ? results[`${repo.key}:A`] : undefined;
      const stateA = entryA?.status === 'ready' ? mergeState(entryA.toOnly, entryA.fromOnly, '一致') : undefined;
      list.push({
        id: `dev-${repo.key}`, type: 'branch', position: { x, y: 600 },
        draggable: false, selectable: false,
        data: {
          kind: '开发分支',
          name: repo.developmentBranch || '暂无匹配分支',
          missing: !repo.developmentBranch,
          stateLabel: !repo.developmentBranch ? undefined : stateA?.label ?? (repo.baselineState === 'exists' ? '比较中…' : undefined),
          stateTone: stateA?.tone,
        },
      });
    });
    return list;
  }, [repos, results, requirement]);

  const edges = useMemo(() => {
    const out: Edge[] = [];
    repos.forEach((repo) => {
      out.push(treeEdge(`e-repo-${repo.key}`, `repo-${repo.key}`, `src-${repo.key}`));
      if (repo.baselineBranch) out.push(treeEdge(`e-src-${repo.key}`, `src-${repo.key}`, `iter-${repo.key}`));
      if (repo.developmentBranch) out.push(treeEdge(`e-iter-dev-${repo.key}`, `iter-${repo.key}`, `dev-${repo.key}`));
      // 合并状态：开发分支 → 迭代分支
      if (repo.developmentBranch && repo.baselineState === 'exists') {
        const entry = results[`${repo.key}:A`];
        const state = entry?.status === 'ready'
          ? mergeState(entry.toOnly, entry.fromOnly, '一致')
          : entry?.status === 'error' ? { label: '比较失败', tone: 'err' as Tone } : { label: '比较中…', tone: 'muted' as Tone };
        out.push(mergeEdge(`m-dev-${repo.key}`, `dev-${repo.key}`, `iter-${repo.key}`, state, '合并 MR'));
      }
      // 合并状态：迭代分支 → 基准分支（源）
      if (repo.sourceBranch && repo.baselineState === 'exists') {
        const entry = results[`${repo.key}:B`];
        const state = entry?.status === 'ready'
          ? mergeState(entry.toOnly, entry.fromOnly, '一致')
          : entry?.status === 'error' ? { label: '比较失败', tone: 'err' as Tone } : { label: '比较中…', tone: 'muted' as Tone };
        out.push(mergeEdge(`m-iter-${repo.key}`, `iter-${repo.key}`, `src-${repo.key}`, state, '迭代合入'));
      }
    });
    return out;
  }, [repos, results]);

  // 根 → 仓库连线
  const rootEdges = useMemo(() => repos.map((r) => ({
    id: `e-root-${r.key}`,
    source: 'root', sourceHandle: 'sb', target: `repo-${r.key}`, targetHandle: 'tt',
    style: { stroke: EDGE_GRAY },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_GRAY },
  })), [repos]);

  const [measureRef, { width: containerWidth }] = useMeasure<HTMLDivElement>();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {eligible.length
            ? `实时比较 ${eligible.length} 个仓库（开发↔迭代、迭代↔源）${pendingCount > 0 ? ` · 进行中 ${Object.keys(results).length}/${expectedPairs}` : ''}`
            : '暂无可比较的仓库：需先选择分支模板并创建迭代基准分支'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-1.5 text-xs"
          disabled={!eligible.length || pendingCount > 0}
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          重新比较
        </Button>
      </div>
      <div
        ref={measureRef}
        className="h-[640px] w-full overflow-hidden rounded-md border border-border/70 bg-background"
      >
        <ReactFlow
          key={containerWidth ? Math.round(containerWidth / 20) : 'initial'}
          nodes={nodes}
          edges={[...rootEdges, ...edges]}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.25}
          nodesConnectable={false}
        >
          <Background gap={18} size={1.4} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </div>
      <p className="text-xs text-muted-foreground">
        读法：灰色虚线 = 分支派生关系（切基准、拉出开发分支）；绿/橙箭头 = 合并状态（绿=上游已包含下游全部提交，橙=上游缺 N 条提交需合并；悬停看分支全名）。
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- 辅助
