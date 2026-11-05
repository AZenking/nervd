import type { CiRunSummary, MrSummary, RepoCiBinding, RepoCiSnapshot } from '@/types';
import type { BuildWorkbenchTarget } from '@/store/ui';
import type { useBranchDivergence } from '../BranchDivergenceCheck';
import type { IterationBaselineCheck } from './types';
import type { RepoTraceState } from './linked-repo-delivery';
import { Separator } from '@/components/ui/separator';
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
  onCreateMr: () => void;
  loadingCi?: boolean;
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
  onCreateMr,
  loadingCi,
  ciBinding,
  latestRun,
  snapshot,
  ciSummary,
  buildTarget,
  onOpenCiModal,
}: LinkedRepoStatusStripProps) {
  return (
    <div className="text-xs">
      <Separator className="bg-border/50" />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5">
        {/* 分支状态 */}
        <div className="flex min-w-[130px] flex-1 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">分支状态:</span>
          <div className="min-w-0 flex-1">
            <LinkedRepoBranchStatus
              developerBranchState={developerBranchState}
              traceState={traceState}
              divergence={divergence}
            />
          </div>
        </div>

        {/* 合并请求 (MR) */}
        <div className="flex min-w-[140px] flex-1 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">合并请求:</span>
          <div className="min-w-0 flex-1">
            <LinkedRepoMrStatus
              targetActiveMr={targetActiveMr}
              developerBranch={developerBranch}
              developerBranchState={developerBranchState}
              operationBaseBranch={operationBaseBranch}
              historyMrs={historyMrs}
              hasMatchingMergedMr={hasMatchingMergedMr}
              divergence={divergence}
              onViewMr={onViewMr}
              onCreateMr={onCreateMr}
            />
          </div>
        </div>

        {/* 最近构建 (CI) */}
        <div className="flex min-w-[180px] flex-1 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">最近构建:</span>
          <div className="min-w-0 flex-1">
            <LinkedRepoCiStatus
              loading={loadingCi}
              ciBinding={ciBinding}
              latestRun={latestRun}
              snapshot={snapshot}
              ciSummary={ciSummary}
              buildTarget={buildTarget}
              onOpenCiModal={onOpenCiModal}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
