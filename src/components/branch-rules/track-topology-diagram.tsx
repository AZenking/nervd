import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GitFork, Maximize2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { expandBranchPattern } from '@/components/iteration/requirement/types';

const TrackTopologyModal = lazy(() =>
  import('./track-topology-modal').then((m) => ({ default: m.TrackTopologyModal })),
);

/**
 * 交付轨道（Track/局点）拓扑图原语（纯展示，无 store / localStorage 依赖），基于 @xyflow/react 渲染：
 * - 遵循 HeroUI v3 + Linear 设计规范：采用 Card/Surface 结构、Chip 徽标、清晰微排版与语义色彩。
 * - 三节点形态：源主干 →(派生基准) 迭代基准 →(切出开发) 需求分支；
 *   回程箭头 MR 合入（需求分支→迭代基准），发布时人工 MR 以琥珀虚线（迭代基准→源主干）。
 * - 直连两节点形态：基准模式展开后与源主干同名（Trunk-Based）自动收敛为
 *   源主干 →(直接切出) 需求分支，MR 直接合入回箭头。
 * - 分支名由 expandBranchPattern 展开真实值渲染；节点可选状态光晕（需求详情场景）。
 * - 紧凑呼吸感：节点为 HeroUI 风格小圆角微卡片（font-mono 分支名），1px hairline 连线；
 *   充分的节点水平间隙（250px）杜绝连线标签重叠，窄容器由 ReactFlow fitView 自动平滑适配。
 * - 支持模态弹窗放大检视（allowModal / onExpand），解决在抽屉等狭窄视口中长分支名折叠或看不清的问题。
 */

/** 拓扑节点状态：ready = Emerald 光晕 / missing = 灰占位 / loading = 微光 */
export type TrackTopologyNodeState = 'ready' | 'missing' | 'loading';

export interface TrackTopologyStates {
  source?: TrackTopologyNodeState;
  baseline?: TrackTopologyNodeState;
  development?: TrackTopologyNodeState;
}

/** 模式展开变量：{iteration} / {track}（等价 {template}）/ {identifier} */
export interface TrackTopologyVariables {
  iteration: string;
  track?: string;
  identifier: string;
}

export interface TrackTopologyDiagramProps {
  /** 模板源主干分支（如 master），原样渲染 */
  sourceBranch: string;
  /** 迭代基准分支模式（如 iteration/{iteration}/{track}） */
  baselinePattern: string;
  /** 需求开发分支模式（如 feature/{identifier}） */
  workitemPattern: string;
  /** 模式展开变量值 */
  variables: TrackTopologyVariables;
  /** 节点状态光晕（需求详情场景）；缺省为纯预览态 */
  states?: TrackTopologyStates;
  className?: string;
  /** 是否允许点击放大弹窗（默认 true） */
  allowModal?: boolean;
  /** 自定义弹窗触发回调；若未提供则使用内置 TrackTopologyModal */
  onExpand?: () => void;
  /** 模态视图内部渲染标记，避免递归弹窗 */
  isModalView?: boolean;
  /** 视图样式模式：compact（默认抽屉紧凑预览）/ expanded（弹窗宽阔视图） */
  variant?: 'compact' | 'expanded';
  /** 自定义模板名称（用于弹窗展示） */
  templateName?: string;
}

/**
 * 直连主干判定（与 isDirectConnectRule 同口径）：
 * 占位符展开后的迭代基准分支与源主干同名（trim 后比较；源主干为空视为非直连）。
 */
export function isDirectConnectBranches(sourceBranch: string, baselineBranch: string): boolean {
  const source = sourceBranch.trim();
  return Boolean(source) && source === baselineBranch.trim();
}

/** 拓扑链路词汇表：模板抽屉 / 关联仓库弹窗 / 分支同步树共用同一套边标签 */
export const TRACK_TOPOLOGY_LABELS = {
  kindSource: '源主干',
  kindBaseline: '迭代基准',
  kindDevelopment: '需求分支',
  deriveBaseline: '派生基准',
  cutDevelopment: '切出开发',
  mergeRequest: 'MR 合入',
  releaseMr: '发布 MR',
  directCut: '直接切出',
  directBadge: '直连主干',
} as const;

/** 节点状态 → 胶囊视觉（光晕/描边）；预览态（无状态）由调用处使用中性 hairline */
export const TRACK_NODE_STATE_CLASS: Record<TrackTopologyNodeState, string> = {
  ready: 'border-success/60 bg-success-soft/20 text-foreground ring-1 ring-success/30 shadow-xs',
  missing: 'border-border/80 border-dashed bg-surface-secondary/40 text-muted-foreground opacity-80',
  loading: 'border-border bg-surface ring-1 ring-primary/25 animate-pulse',
};

/** 分支同步树（ReactFlow 卡片）节点光晕：与 TRACK_NODE_STATE_CLASS 同一状态语义的卡片档 */
export const TRACK_NODE_GLOW_CLASS: Record<TrackTopologyNodeState, string> = {
  ready: 'border-success/45 ring-1 ring-success/30',
  missing: 'ring-1 ring-border/70 opacity-80',
  loading: 'ring-1 ring-border animate-pulse',
};

// ---------------------------------------------------------------- 画布节点

const HIDDEN_HANDLE = {
  visibility: 'hidden', width: 0, height: 0, minWidth: 0, minHeight: 0, border: 'none',
} as const;

interface TrackNodeData extends Record<string, unknown> {
  nodeKey: 'source' | 'baseline' | 'development';
  kind: string;
  name: string;
  state?: TrackTopologyNodeState;
  nodeWidth?: number;
}

type TrackNodeT = Node<TrackNodeData, 'track'>;

function TopologyFlowNode({ data }: NodeProps<TrackNodeT>) {
  const isReady = data.state === 'ready';
  const isMissing = data.state === 'missing';
  const widthStyle = data.nodeWidth ? { width: `${data.nodeWidth}px` } : undefined;

  return (
    <div
      data-node={data.nodeKey}
      data-state={data.state}
      title={data.name}
      style={widthStyle}
      className={cn(
        'group relative flex min-w-0 flex-col gap-1 rounded-md border px-2.5 py-1.5 transition-all duration-150',
        data.nodeWidth ? '' : 'w-[152px]',
        data.state ? TRACK_NODE_STATE_CLASS[data.state] : 'border-border bg-surface text-foreground shadow-xs',
      )}
    >
      <Handle id="tl" type="target" position={Position.Left} style={HIDDEN_HANDLE} isConnectable={false} />
      <Handle id="sr" type="source" position={Position.Right} style={HIDDEN_HANDLE} isConnectable={false} />
      <Handle
        id="tb"
        type="target"
        position={Position.Bottom}
        style={{ ...HIDDEN_HANDLE, left: data.nodeKey === 'baseline' ? '68%' : '50%' }}
        isConnectable={false}
      />
      <Handle
        id="sb"
        type="source"
        position={Position.Bottom}
        style={{ ...HIDDEN_HANDLE, left: data.nodeKey === 'baseline' ? '32%' : '50%' }}
        isConnectable={false}
      />

      <div className="flex items-center gap-1.5 text-[10px] font-medium leading-tight text-muted-foreground">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            data.nodeKey === 'source' && 'bg-primary/80',
            data.nodeKey === 'baseline' && 'bg-warning/80',
            data.nodeKey === 'development' && 'bg-accent/80',
            isReady && 'bg-success',
            isMissing && 'bg-muted-foreground/40',
          )}
          aria-hidden="true"
        />
        <span className="truncate">{data.kind}</span>
      </div>
      <div className="truncate font-mono text-[11px] font-semibold leading-tight text-foreground select-all">
        {data.name || '—'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 画布连线

const EDGE_MUTED = 'var(--sig-idle, #8a8f98)';
const EDGE_WARNING = 'var(--sig-run, #d9730d)';

interface TopologyEdgeData extends Record<string, unknown> {
  label: string;
  tone: 'muted' | 'warning';
  /** 发布时人工 MR：琥珀虚线 */
  dashed?: boolean;
}

type TopologyEdgeT = Edge<TopologyEdgeData, 'track'>;

function TopologyFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<TopologyEdgeT>) {
  const isBottomLoop = sourcePosition === Position.Bottom && targetPosition === Position.Bottom;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: isBottomLoop ? 0.38 : 0.18,
  });
  const warning = data?.tone === 'warning';
  const color = warning ? EDGE_WARNING : EDGE_MUTED;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: 1.25,
          strokeDasharray: data?.dashed ? '4 3' : undefined,
          opacity: warning ? 1 : 0.8,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute z-10 whitespace-nowrap"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none tracking-tight shadow-xs backdrop-blur-xs select-none',
              warning
                ? 'border-warning/40 bg-surface/95 text-warning ring-1 ring-warning/20'
                : 'border-border/90 bg-surface/95 text-muted-foreground',
            )}
          >
            {data?.label}
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

interface TrackEdgeOptions {
  tone?: 'muted' | 'warning';
  dashed?: boolean;
  /** 出发 Handle：sr = 右侧顺流 / sb = 底部回程 */
  from: 'sr' | 'sb';
  /** 到达 Handle：tl = 左侧顺流 / tb = 底部回程 */
  to: 'tl' | 'tb';
}

function trackEdge(
  id: string,
  source: string,
  target: string,
  label: string,
  { tone = 'muted', dashed, from, to }: TrackEdgeOptions,
): TopologyEdgeT {
  return {
    id,
    source,
    target,
    sourceHandle: from,
    targetHandle: to,
    type: 'track',
    data: { label, tone, dashed },
    markerEnd: { type: MarkerType.ArrowClosed, color: tone === 'warning' ? EDGE_WARNING : EDGE_MUTED },
  };
}

const nodeTypes = { track: TopologyFlowNode };
const edgeTypes = { track: TopologyFlowEdge };

/**
 * 容器尺寸变化时重新 fitView：ReactFlow 的 fitView 仅在初始化执行，
 * 抽屉/弹窗宽视口打开后再缩窄会残留旧 transform 导致节点裁出画布。
 * 以隐藏锚点定位 .react-flow 根节点，ResizeObserver 防抖触发重适配。
 */
function RefitOnResize() {
  const { fitView } = useReactFlow();
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = anchorRef.current?.closest('.react-flow');
    if (!root || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 200 });
      });
    });
    observer.observe(root);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [fitView]);

  return <div ref={anchorRef} className="hidden" aria-hidden="true" />;
}

/** 三节点横向间距：节点宽 152px + 充足连线呼吸区（98px 净空），彻底杜绝边标签与节点重叠 */
const NODE_GAP = 250;

/** fitView 留白：给边标签与胶囊呼吸区 */
const FIT_PADDING = 0.16;

// ---------------------------------------------------------------- 拓扑图

export interface TrackTopologyGraph {
  direct: boolean;
  sourceName: string;
  baselineName: string;
  developmentName: string;
  nodes: TrackNodeT[];
  edges: TopologyEdgeT[];
}

export interface BuildTrackTopologyGraphOptions
  extends Pick<TrackTopologyDiagramProps, 'sourceBranch' | 'baselinePattern' | 'workitemPattern' | 'variables' | 'states'> {
  nodeWidth?: number;
  nodeGap?: number;
}

/**
 * 纯函数构建拓扑图（组件渲染同源；单测对连线标签/语气/虚线等结构契约在此断言，
 * 避免 jsdom 零尺寸下 ReactFlow 不渲染边标签导致的 DOM 断言盲区）。
 */
export function buildTrackTopologyGraph({
  sourceBranch,
  baselinePattern,
  workitemPattern,
  variables,
  states,
  nodeWidth = 152,
  nodeGap,
}: BuildTrackTopologyGraphOptions): TrackTopologyGraph {
  const track = variables.track ?? '';
  const expandValues = {
    iteration: variables.iteration,
    track,
    template: track,
    identifier: variables.identifier,
  };
  const sourceName = sourceBranch.trim();
  const baselineName = expandBranchPattern(baselinePattern, expandValues);
  const developmentName = expandBranchPattern(workitemPattern, expandValues);
  const direct = isDirectConnectBranches(sourceName, baselineName);
  const effectiveGap = nodeGap ?? (nodeWidth > 152 ? Math.max(300, nodeWidth + 100) : NODE_GAP);

  const make = (
    nodeKey: TrackNodeData['nodeKey'],
    kind: string,
    name: string,
    state: TrackTopologyNodeState | undefined,
    x: number,
  ): TrackNodeT => ({
    id: nodeKey,
    type: 'track',
    position: { x, y: 0 },
    draggable: false,
    selectable: false,
    data: { nodeKey, kind, name, state, nodeWidth },
  });

  const nodes: TrackNodeT[] = [
    make('source', TRACK_TOPOLOGY_LABELS.kindSource, sourceName, states?.source, 0),
  ];
  if (!direct) {
    nodes.push(
      make('baseline', TRACK_TOPOLOGY_LABELS.kindBaseline, baselineName, states?.baseline, effectiveGap),
    );
  }
  nodes.push(
    make(
      'development',
      TRACK_TOPOLOGY_LABELS.kindDevelopment,
      developmentName,
      states?.development,
      direct ? effectiveGap : effectiveGap * 2,
    ),
  );

  const edges: TopologyEdgeT[] = direct
    ? [
        trackEdge('e-cut', 'source', 'development', TRACK_TOPOLOGY_LABELS.directCut, { from: 'sr', to: 'tl' }),
        trackEdge('e-mr', 'development', 'source', TRACK_TOPOLOGY_LABELS.mergeRequest, { from: 'sb', to: 'tb' }),
      ]
    : [
        trackEdge('e-derive', 'source', 'baseline', TRACK_TOPOLOGY_LABELS.deriveBaseline, { from: 'sr', to: 'tl' }),
        trackEdge('e-release', 'baseline', 'source', TRACK_TOPOLOGY_LABELS.releaseMr, {
          tone: 'warning',
          dashed: true,
          from: 'sb',
          to: 'tb',
        }),
        trackEdge('e-cut', 'baseline', 'development', TRACK_TOPOLOGY_LABELS.cutDevelopment, { from: 'sr', to: 'tl' }),
        trackEdge('e-mr', 'development', 'baseline', TRACK_TOPOLOGY_LABELS.mergeRequest, { from: 'sb', to: 'tb' }),
      ];

  return { direct, sourceName, baselineName, developmentName, nodes, edges };
}

export function TrackTopologyDiagram({
  sourceBranch,
  baselinePattern,
  workitemPattern,
  variables,
  states,
  className,
  allowModal = true,
  onExpand,
  isModalView = false,
  variant = 'compact',
  templateName,
}: TrackTopologyDiagramProps) {
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const isExpanded = variant === 'expanded' || isModalView;
  const nodeWidth = isExpanded ? 210 : 152;
  const nodeGap = isExpanded ? 310 : NODE_GAP;

  const graph = useMemo(
    () =>
      buildTrackTopologyGraph({
        sourceBranch,
        baselinePattern,
        workitemPattern,
        variables,
        states,
        nodeWidth,
        nodeGap,
      }),
    [sourceBranch, baselinePattern, workitemPattern, variables, states, nodeWidth, nodeGap],
  );

  const handleOpenModal = () => {
    if (onExpand) {
      onExpand();
    } else {
      setInternalModalOpen(true);
    }
  };

  return (
    <>
      <Card
        data-testid="track-topology"
        data-form={graph.direct ? 'direct' : 'three-node'}
        className={cn(
          'relative flex flex-col gap-2 rounded-lg border border-border bg-surface-secondary/35 p-3.5 shadow-xs',
          allowModal && !isModalView && 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-surface-secondary/50',
          className,
        )}
        onClick={allowModal && !isModalView ? handleOpenModal : undefined}
      >
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/85">
            <GitFork className="size-3.5 text-primary" aria-hidden="true" />
            <span>交付轨道拓扑</span>
          </div>
          <div className="flex items-center gap-1.5">
            {graph.direct && (
              <Chip size="sm" variant="soft" color="accent" className="h-5 px-1.5 text-[10px] font-medium">
                <Chip.Label>{TRACK_TOPOLOGY_LABELS.directBadge}</Chip.Label>
              </Chip>
            )}
            {allowModal && !isModalView && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                onPress={handleOpenModal}
                title="在弹窗中放大查看拓扑图"
                aria-label="在弹窗中放大查看交付轨道拓扑"
              >
                <Maximize2 className="size-3" aria-hidden="true" />
                <span>放大查看</span>
              </Button>
            )}
          </div>
        </div>
        <div className={cn(isExpanded ? 'h-[180px]' : 'h-[144px]', 'w-full')}>
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: isExpanded ? 0.12 : FIT_PADDING, maxZoom: 1 }}
            minZoom={0.2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
          >
            <RefitOnResize />
          </ReactFlow>
        </div>
      </Card>

      {/* 内置模态弹窗：当未提供外部 onExpand 且点击放大查看时唤起 */}
      {allowModal && !isModalView && !onExpand && internalModalOpen && (
        <Suspense fallback={null}>
          <TrackTopologyModal
            open={internalModalOpen}
            onOpenChange={setInternalModalOpen}
            sourceBranch={sourceBranch}
            baselinePattern={baselinePattern}
            workitemPattern={workitemPattern}
            variables={variables}
            states={states}
            templateName={templateName}
          />
        </Suspense>
      )}
    </>
  );
}
