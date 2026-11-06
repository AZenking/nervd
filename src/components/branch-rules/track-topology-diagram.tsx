import { cn } from '@/lib/utils';
import { expandBranchPattern } from '@/components/iteration/requirement/types';

/**
 * 交付轨道（Track/局点）拓扑图原语（纯展示，无 store / localStorage 依赖）：
 * - 三节点形态：源主干 →(派生基准) 迭代基准 →(切出开发) 需求分支；
 *   回程箭头 MR 合入（需求分支→迭代基准），发布时人工 MR 以琥珀虚线（迭代基准→源主干）。
 * - 直连两节点形态：基准模式展开后与源主干同名（Trunk-Based）自动收敛为
 *   源主干 →(直接切出) 需求分支，MR 直接合入回箭头。
 * - 分支名由 expandBranchPattern 展开真实值渲染；节点可选状态光晕（需求详情场景）。
 * - Linear 极简：节点为小圆角胶囊（font-mono 分支名），1px hairline 连线；
 *   宽容器横向布局，窄容器（< 28rem）经容器查询纵向降级。
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
  ready: 'border-success/50 bg-success/5 ring-1 ring-success/25 shadow-[0_0_10px_-4px_var(--color-success)]',
  missing: 'border-border/70 border-dashed bg-muted/40 text-muted-foreground',
  loading: 'border-border bg-muted/20 animate-pulse',
};

/** 分支同步树（ReactFlow 卡片）节点光晕：与 TRACK_NODE_STATE_CLASS 同一状态语义的卡片档 */
export const TRACK_NODE_GLOW_CLASS: Record<TrackTopologyNodeState, string> = {
  ready: 'border-success/45 ring-1 ring-success/30',
  missing: 'ring-1 ring-border/70 opacity-80',
  loading: 'ring-1 ring-border animate-pulse',
};

// ---------------------------------------------------------------- 节点胶囊

interface TopologyNodeProps {
  nodeKey: 'source' | 'baseline' | 'development';
  kind: string;
  name: string;
  state?: TrackTopologyNodeState;
}

function TopologyNode({ nodeKey, kind, name, state }: TopologyNodeProps) {
  return (
    <div
      data-node={nodeKey}
      data-state={state}
      title={name}
      className={cn(
        'flex min-w-0 shrink max-w-[176px] flex-col gap-0.5 rounded-md border px-2.5 py-1.5',
        state ? TRACK_NODE_STATE_CLASS[state] : 'border-border bg-muted/30',
      )}
    >
      <span className="text-[10px] leading-3 text-muted-foreground">{kind}</span>
      <span className="truncate font-mono text-[11px] leading-4 text-foreground/85">
        {name || '—'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- 连线

interface TopologyEdgeProps {
  /** 顺流标签（→ / ↓）：派生基准 / 切出开发 / 直接切出 */
  forwardLabel: string;
  /** 回程标签（⇠ / ↑）：MR 合入 / 发布 MR；缺省表示该段无回程 */
  returnLabel?: string;
  /** 发布时人工 MR：琥珀虚线（仅三节点形态的迭代基准 → 源主干段） */
  amberDashed?: boolean;
}

const FORWARD_HEAD = 'border-muted-foreground/50';
const HAIRLINE = 'bg-border';

function TopologyEdge({ forwardLabel, returnLabel, amberDashed }: TopologyEdgeProps) {
  const returnHead = amberDashed ? 'border-warning' : FORWARD_HEAD;
  // 横向回程线：h-0 + border-t（虚线）或 h-px + bg（实线 hairline）
  const returnLine = amberDashed ? 'h-0 border-t border-dashed border-warning/80' : `h-px ${HAIRLINE}`;
  // 纵向回程线：w-0 + border-l（虚线）或 w-px + bg（实线 hairline）
  const returnLineVertical = amberDashed
    ? 'w-0 border-l border-dashed border-warning/80'
    : `w-px ${HAIRLINE}`;
  const returnLabelClass = amberDashed ? 'text-warning/90' : 'text-muted-foreground';

  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1" data-topology-edge>
      {/* 横向连线（宽容器默认） */}
      <div className="contents @max-md:hidden">
        <span className="whitespace-nowrap text-[10px] leading-3 text-muted-foreground">{forwardLabel}</span>
        <div className="flex w-14 items-center" aria-hidden="true">
          <span className={`h-px min-w-4 flex-1 ${HAIRLINE}`} />
          <span className={`-ml-px size-[5px] shrink-0 rotate-45 border-t border-r ${FORWARD_HEAD}`} />
        </div>
        {returnLabel && (
          <>
            <div className="flex w-14 items-center" aria-hidden="true">
              <span className={`-mr-px size-[5px] shrink-0 rotate-45 border-b border-l ${returnHead}`} />
              <span className={`min-w-4 flex-1 ${returnLine}`} />
            </div>
            <span className={`whitespace-nowrap text-[10px] leading-3 ${returnLabelClass}`}>{returnLabel}</span>
          </>
        )}
      </div>
      {/* 纵向连线（窄容器降级；标签为横向变体的纯视觉重复） */}
      <div className="hidden @max-md:contents" aria-hidden="true">
        <span className="whitespace-nowrap text-[10px] leading-3 text-muted-foreground">{forwardLabel}</span>
        <div className="flex h-5 flex-col items-center">
          <span className={`min-h-3 w-px flex-1 ${HAIRLINE}`} />
          <span className={`-mt-px size-[5px] shrink-0 rotate-[135deg] border-t border-r ${FORWARD_HEAD}`} />
        </div>
        {returnLabel && (
          <>
            <div className="flex h-5 flex-col items-center">
              <span className={`-mb-px size-[5px] shrink-0 rotate-[135deg] border-b border-l ${returnHead}`} />
              <span className={`min-h-3 flex-1 ${returnLineVertical}`} />
            </div>
            <span className={`text-[10px] leading-3 ${returnLabelClass}`}>{returnLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 拓扑图

export function TrackTopologyDiagram({
  sourceBranch,
  baselinePattern,
  workitemPattern,
  variables,
  states,
  className,
}: TrackTopologyDiagramProps) {
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

  return (
    <div
      data-testid="track-topology"
      data-form={direct ? 'direct' : 'three-node'}
      className={cn(
        '@container flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium leading-3 text-muted-foreground">交付轨道拓扑</span>
        {direct && (
          <span className="rounded-xs border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] leading-4 text-primary">
            {TRACK_TOPOLOGY_LABELS.directBadge}
          </span>
        )}
      </div>
      <div
        className={cn(
          'flex min-w-0 flex-wrap items-center justify-center gap-x-1 gap-y-2',
          '@max-md:flex-col @max-md:items-stretch @max-md:gap-1',
        )}
      >
        <TopologyNode
          nodeKey="source"
          kind={TRACK_TOPOLOGY_LABELS.kindSource}
          name={sourceName}
          state={states?.source}
        />
        {direct ? (
          <TopologyEdge
            forwardLabel={TRACK_TOPOLOGY_LABELS.directCut}
            returnLabel={TRACK_TOPOLOGY_LABELS.mergeRequest}
          />
        ) : (
          <TopologyEdge
            forwardLabel={TRACK_TOPOLOGY_LABELS.deriveBaseline}
            returnLabel={TRACK_TOPOLOGY_LABELS.releaseMr}
            amberDashed
          />
        )}
        {!direct && (
          <>
            <TopologyNode
              nodeKey="baseline"
              kind={TRACK_TOPOLOGY_LABELS.kindBaseline}
              name={baselineName}
              state={states?.baseline}
            />
            <TopologyEdge
              forwardLabel={TRACK_TOPOLOGY_LABELS.cutDevelopment}
              returnLabel={TRACK_TOPOLOGY_LABELS.mergeRequest}
            />
          </>
        )}
        <TopologyNode
          nodeKey="development"
          kind={TRACK_TOPOLOGY_LABELS.kindDevelopment}
          name={developmentName}
          state={states?.development}
        />
      </div>
    </div>
  );
}
