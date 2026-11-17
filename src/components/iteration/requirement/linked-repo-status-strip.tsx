import type React from 'react';
import type { CiRunSummary, MrSummary, RepoCiBinding, RepoCiSnapshot } from '@/types';
import type { BuildWorkbenchTarget } from '@/store/ui';
import type { useBranchDivergence } from '../BranchDivergenceCheck';
import type { IterationBaselineCheck } from './types';
import type { RepoTraceState } from './linked-repo-delivery';
import { Surface } from '@/components/ui/surface';
import { LinkedRepoBranchStatus } from './linked-repo-branch-section';
import { LinkedRepoMrStatus } from './linked-repo-mr-list';
import { LinkedRepoCiStatus } from './linked-repo-ci-status';

export interface LinkedRepoStatusStripProps {
  developerBranchState: IterationBaselineCheck['state'];
  traceState: RepoTraceState;
  divergence: ReturnType<typeof useBranchDivergence>;
  targetActiveMr?: MrSummary;
  developerBranch: string;
  operationBaseBranch: string;
  historyMrs: MrSummary[];
  hasMatchingMergedMr: boolean;
  onViewMr: (mr?: MrSummary | { localId: number }) => void;
  loadingCi?: boolean;
  /** CI 查询失败（保留上次快照时也显式呈现，不静默）。 */
  ciError?: boolean;
  /** 无法确认最近构建属于需求分支 → 摘要标注「仓库最新构建」，不据此判定需求构建通过。 */
  repoLatestBuild?: boolean;
  ciBinding?: RepoCiBinding;
  latestRun?: CiRunSummary;
  snapshot?: RepoCiSnapshot | null;
  ciSummary: string;
  buildTarget: BuildWorkbenchTarget;
  onOpenCiModal: () => void;
}

export function LinkedRepoStatusStrip({
  developerBranchState,
  traceState,
  divergence,
  targetActiveMr,
  developerBranch,
  operationBaseBranch,
  historyMrs,
  hasMatchingMergedMr,
  onViewMr,
  loadingCi,
  ciError,
  repoLatestBuild,
  ciBinding,
  latestRun,
  snapshot,
  ciSummary,
  buildTarget,
  onOpenCiModal,
}: LinkedRepoStatusStripProps) {
  return (
    // 三组摘要独立成块（小标题 + 主值），依据「卡片容器宽度」切换列数：
    // 卡片根节点标了 @container，容器 ≥680px 时三列并排，否则单列堆叠。
    <Surface
      variant="secondary"
      className="grid grid-cols-1 gap-4 rounded-lg p-4 @min-[680px]:grid-cols-3"
    >
      <SummaryGroup label="分支同步">
        <LinkedRepoBranchStatus
          developerBranchState={developerBranchState}
          traceState={traceState}
          divergence={divergence}
        />
      </SummaryGroup>

      <SummaryGroup label="合并请求">
        <LinkedRepoMrStatus
          targetActiveMr={targetActiveMr}
          developerBranch={developerBranch}
          developerBranchState={developerBranchState}
          operationBaseBranch={operationBaseBranch}
          historyMrs={historyMrs}
          hasMatchingMergedMr={hasMatchingMergedMr}
          divergence={divergence}
          onViewMr={onViewMr}
        />
      </SummaryGroup>

      <SummaryGroup label="最近构建">
        <LinkedRepoCiStatus
          loading={loadingCi}
          error={ciError}
          repoLatestBuild={repoLatestBuild}
          ciBinding={ciBinding}
          latestRun={latestRun}
          snapshot={snapshot}
          ciSummary={ciSummary}
          buildTarget={buildTarget}
          onOpenCiModal={onOpenCiModal}
        />
      </SummaryGroup>
    </Surface>
  );
}

/** 摘要分组：小标题 + 主值（副值由各行内容自己渲染）。
 *  主值区固定最小高度 40px（两行明细实测约 37px），
 *  刷新时骨架 / 「暂无记录」/ 两行明细之间切换都在同一高度内，分组高度不再变化。 */
function SummaryGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex min-h-10 min-w-0 flex-col justify-center">{children}</div>
    </div>
  );
}
