import { ExternalLinkIcon, GitPullRequestIcon, InfoIcon, PlusIcon } from 'lucide-react';
import type { MrSummary } from '@/types';
import { useApp } from '@/store/app';
import { Button } from '@/components/ui/button';
import { WriteOpGatedTrigger } from '@/components/WriteOpButton';
import { Surface } from '@/components/ui/surface';
import { IconHint } from '@/components/ui/icon-hint';
import { SectionHeader } from '@/components/section-header';
import { useBranchDivergence } from '../BranchDivergenceCheck';
import { MrInlineItem } from './mr-inline-item';
import { getMrStatusInfo, type IterationBaselineCheck } from './types';

export interface LinkedRepoMrStatusProps {
  targetActiveMr?: MrSummary;
  developerBranch: string;
  developerBranchState: IterationBaselineCheck['state'];
  operationBaseBranch: string;
  historyMrs: MrSummary[];
  hasMatchingMergedMr: boolean;
  divergence: ReturnType<typeof useBranchDivergence>;
  onViewMr: (mr?: MrSummary | { localId: number }) => void;
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
}: LinkedRepoMrStatusProps) {
  // 摘要只读：创建 MR 只在展开后的「合并请求」Surface 里提供。
  // 口径：MR 编号只出现一次（作为可点击链接），MR 目标单独一行，不与交付目标混为一条关系。
  const devOnly = divergence.check.status === 'ready' ? (divergence.check.developmentOnly ?? 0) : 0;

  const mrLink = (localId: number) => (
    <Button
      type="button"
      variant="ghost"
      size="2xs"
      onPress={() => onViewMr({ localId })}
      aria-label={`查看合并请求 !${localId}`}
      className="cursor-pointer text-primary"
    >
      !{localId}
      <ExternalLinkIcon className="size-3" aria-hidden="true" />
    </Button>
  );

  if (targetActiveMr) {
    const statusInfo = getMrStatusInfo(
      targetActiveMr.state,
      (targetActiveMr as { hasConflict?: boolean }).hasConflict,
    );
    const mergeTarget = targetActiveMr.targetBranch || operationBaseBranch;
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
          {statusInfo.label}
          <span className="min-w-0 truncate font-mono text-[11px] font-normal text-muted-foreground">
            → {mergeTarget}
          </span>
        </span>
        {mrLink(targetActiveMr.localId)}
      </div>
    );
  }

  if (developerBranchState === 'exists' && devOnly > 0) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-warning">待合入</span>
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {devOnly} 个提交 · → {operationBaseBranch}
        </span>
      </div>
    );
  }

  const matchingMergedMr = historyMrs.find(
    (mr) =>
      mr.state?.toLowerCase() === 'merged' &&
      developerBranch &&
      mr.sourceBranch === developerBranch &&
      mr.targetBranch === operationBaseBranch,
  );
  if (matchingMergedMr) {
    const mergeTarget = matchingMergedMr.targetBranch || operationBaseBranch;
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-success">
          已合入
          <span className="min-w-0 truncate font-mono text-[11px] font-normal text-muted-foreground">
            → {mergeTarget}
          </span>
        </span>
        {mrLink(matchingMergedMr.localId)}
      </div>
    );
  }

  if (hasMatchingMergedMr) {
    return <span className="text-[13px] font-medium text-success">已合入</span>;
  }

  if (developerBranchState === 'exists') {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] text-muted-foreground">暂无 MR</span>
        <span className="text-[11px] text-muted-foreground/80">分支与基准无待合变动</span>
      </div>
    );
  }

  return <span className="text-[13px] text-muted-foreground">暂无 MR</span>;
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
  const allowWriteOps = useApp((state) => state.settings?.allowWriteOps ?? false);
  const count = sortedMergeRequests.length;
  return (
    <Surface variant="secondary" className="flex min-w-0 flex-col gap-2.5 rounded-lg p-4">
      <SectionHeader
        level="h2"
        title={(
          <span className="inline-flex items-center gap-1.5">
            <GitPullRequestIcon className="size-3.5 text-primary" aria-hidden="true" />
            <span>合并请求</span>
          </span>
        )}
        count={count}
        action={developerBranch ? (
          <>
            {/* 写操作入口必须可见（HeroUI 按钮），只读态由 WriteOpGatedTrigger 承接 */}
            <WriteOpGatedTrigger
              label="创建 MR"
              icon={<PlusIcon data-icon="inline-start" />}
              variant="outline"
            />
            {allowWriteOps && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 cursor-pointer"
                onPress={onCreateMr}
              >
                <PlusIcon data-icon="inline-start" />
                <span>创建 MR</span>
              </Button>
            )}
          </>
        ) : undefined}
      />

      {count > 0 ? (
        <div className="flex flex-col">
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
      ) : (
        /* 简洁空态：不放插画、不重复创建按钮（创建入口只在标题行出现一次） */
        <div className="flex flex-col items-center justify-center gap-1 rounded-md px-2 py-6 text-center">
          <GitPullRequestIcon className="size-5 text-muted-foreground/50" aria-hidden="true" />
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            暂无合并请求
            {developerBranch && (
              <IconHint
                icon={<InfoIcon className="size-3" />}
                label="需求分支有未合入提交时，可在标题行创建 MR"
              />
            )}
          </span>
        </div>
      )}
    </Surface>
  );
}
