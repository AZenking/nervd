import { GitPullRequestIcon, PlusIcon } from 'lucide-react';
import type { MrSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBranchDivergence } from '../BranchDivergenceCheck';
import { MrInlineItem } from './mr-inline-item';
import { getMrStatusInfo, type IterationBaselineCheck } from './types';

/** getMrStatusInfo.tone → HeroUI Chip.color 映射 */
const MR_TONE_CHIP_COLOR = {
  rose: 'danger',
  emerald: 'success',
  muted: 'default',
  sky: 'accent',
  amber: 'warning',
} as const;

export interface LinkedRepoMrStatusProps {
  targetActiveMr?: MrSummary;
  developerBranch: string;
  developerBranchState: IterationBaselineCheck['state'];
  operationBaseBranch: string;
  historyMrs: MrSummary[];
  hasMatchingMergedMr: boolean;
  divergence: ReturnType<typeof useBranchDivergence>;
  onViewMr: (mr?: MrSummary | { localId: number }) => void;
  onCreateMr: () => void;
}

export function LinkedRepoMrStatus({
  targetActiveMr,
  developerBranch,
  developerBranchState,
  operationBaseBranch,
  historyMrs,
  hasMatchingMergedMr,
  divergence,
  onViewMr,
  onCreateMr,
}: LinkedRepoMrStatusProps) {
  // 1. 存在进行中的合并请求 (Active MR)
  if (targetActiveMr) {
    const statusInfo = getMrStatusInfo(
      targetActiveMr.state,
      (targetActiveMr as { hasConflict?: boolean }).hasConflict,
    );
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onPress={() => onViewMr(targetActiveMr)}
              className="group h-auto p-1 gap-1.5 text-xs text-left cursor-pointer max-w-full font-normal"
              title={`查看合并请求 !${targetActiveMr.localId} · 状态：${statusInfo.label}`}
              aria-label={`查看合并请求 !${targetActiveMr.localId} · 状态：${statusInfo.label}`}
            >
              <Chip size="sm" color="accent" variant="soft" className="font-mono text-[11px] font-semibold shrink-0">
                !{targetActiveMr.localId}
              </Chip>
              <Chip
                size="sm"
                variant="soft"
                color={MR_TONE_CHIP_COLOR[statusInfo.tone]}
                className="text-[11px] font-medium shrink-0"
              >
                {statusInfo.label}
              </Chip>
            </Button>
          }
        />
        <TooltipContent>查看合并请求 !{targetActiveMr.localId} · 状态：${statusInfo.label}</TooltipContent>
      </Tooltip>
    );
  }

  const devOnly = divergence.check.status === 'ready' ? (divergence.check.developmentOnly ?? 0) : 0;

  // 2. 无活跃 MR，但存在未合入的提交（分支超前基准）
  if (developerBranchState === 'exists' && devOnly > 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Chip size="sm" variant="soft" color="warning" className="text-[11px] font-medium shrink-0">
          待合入 ({devOnly} 提交)
        </Chip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="link"
                size="xs"
                onPress={onCreateMr}
                className="h-auto p-0 text-[11px] text-primary shrink-0"
                title="代码已就绪，点击发起 MR 合入基准分支"
                aria-label="代码已就绪，点击发起 MR 合入基准分支"
              >
                发起 MR
              </Button>
            }
          />
          <TooltipContent>代码已就绪，点击发起 MR 合入基准分支</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  // 3. 历史 MR 已合入，且无未合入的新提交
  const matchingMergedMr = historyMrs.find(
    (mr) =>
      mr.state?.toLowerCase() === 'merged' &&
      developerBranch &&
      mr.sourceBranch === developerBranch &&
      mr.targetBranch === operationBaseBranch,
  );
  if (matchingMergedMr) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onPress={() => onViewMr(matchingMergedMr)}
              className="group h-auto p-1 gap-1.5 text-xs text-left cursor-pointer max-w-full font-normal"
              title={`历史合并请求 !${matchingMergedMr.localId} 已成功合入，点击查看详情`}
              aria-label={`历史合并请求 !${matchingMergedMr.localId} 已成功合入，点击查看详情`}
            >
              <Chip size="sm" color="success" variant="soft" className="font-mono text-[11px] font-medium shrink-0">
                !{matchingMergedMr.localId}
              </Chip>
              <Chip size="sm" variant="soft" color="success" className="text-[11px] font-medium shrink-0">
                已合入
              </Chip>
            </Button>
          }
        />
        <TooltipContent>历史合并请求 !{matchingMergedMr.localId} 已成功合入，点击查看详情</TooltipContent>
      </Tooltip>
    );
  }
  if (hasMatchingMergedMr) {
    return (
      <div className="inline-flex items-center gap-1 text-xs text-success">
        <Chip size="sm" variant="soft" color="success" className="font-mono text-[11px] font-medium shrink-0">
          已合入
        </Chip>
      </div>
    );
  }

  // 4. 分支已存在且与基准完全一致（暂无变动）
  if (developerBranchState === 'exists') {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Chip size="sm" variant="tertiary" className="text-[11px] font-medium shrink-0">
          已对齐
        </Chip>
        <span className="text-[11px] text-muted-foreground truncate">暂无待合变动</span>
      </div>
    );
  }

  // 5. 需求分支尚未创建
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>— 暂无 MR</span>
    </div>
  );
}

export interface LinkedRepoMrListProps {
  repoId: number;
  repoPathWithNamespace?: string;
  developerBranch: string;
  sortedMergeRequests: MrSummary[];
  expandedMrId: number | null;
  onToggleMr: (localId: number) => void;
  onRefresh: () => void;
  onCreateMr: () => void;
}

export function LinkedRepoMrList({
  repoId,
  repoPathWithNamespace,
  developerBranch,
  sortedMergeRequests,
  expandedMrId,
  onToggleMr,
  onRefresh,
  onCreateMr,
}: LinkedRepoMrListProps) {
  return (
    <>
      <Separator className="bg-border/40" />
      <section className="flex min-w-0 flex-col gap-1.5" aria-label="合并请求">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <GitPullRequestIcon className="size-3.5 text-primary" aria-hidden="true" />
            <span>合并请求</span>
            <span className="font-mono text-[11px] text-muted-foreground">({sortedMergeRequests.length})</span>
            {sortedMergeRequests.length === 0 && (
              <span className="text-xs font-normal text-muted-foreground">· 暂无合并请求</span>
            )}
          </div>
          {developerBranch && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1"
              onPress={onCreateMr}
            >
              <PlusIcon className="size-3" />
              创建 MR
            </Button>
          )}
        </div>
        {sortedMergeRequests.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {sortedMergeRequests.map((mr) => (
              <MrInlineItem
                key={mr.localId}
                mr={mr}
                repoId={repoId}
                repoPathWithNamespace={repoPathWithNamespace}
                isExpanded={expandedMrId === mr.localId}
                onToggle={() => onToggleMr(mr.localId)}
                onRefresh={onRefresh}
                onCreateMr={onCreateMr}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
