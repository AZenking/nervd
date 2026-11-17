import type React from 'react';
import {
  AlertCircleIcon,
  PlusIcon,
  Settings2Icon,
  WorkflowIcon,
} from 'lucide-react';
import type { CiRunSummary, RepoCiBinding, RepoCiSnapshot } from '@/types';
import { useApp } from '@/store/app';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { IconHint } from '@/components/ui/icon-hint';
import { StatusIcon } from '@/components/status-icon';
import { WriteOpGatedTrigger } from '@/components/WriteOpButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import { BuildWorkbenchTrigger, openBuildWorkbenchFromTrigger } from '@/components/build-workbench';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { ChevronRightIcon, GitBranchIcon } from 'lucide-react';
import { SectionHeader } from '@/components/section-header';
import type { BuildWorkbenchTarget } from '@/store/ui';

export interface LinkedRepoCiStatusProps {
  loading?: boolean;
  /** CI 查询失败（保留上次快照时仍展示说明，但绝不据此判定需求构建通过）。 */
  error?: boolean;
  ciBinding?: RepoCiBinding;
  latestRun?: CiRunSummary;
  snapshot?: RepoCiSnapshot | null;
  /**
   * 无法确认最近构建属于该需求分支（Flow 未提供分支 / Jenkins 参数缺失或分支不一致）：
   * 摘要标注「仓库最新构建」，仅作参考，不据此判定需求构建通过。
   */
  repoLatestBuild?: boolean;
  ciSummary: string;
  buildTarget: BuildWorkbenchTarget;
  onOpenCiModal: () => void;
}

export function LinkedRepoCiStatus({
  loading,
  error,
  ciBinding,
  latestRun,
  snapshot,
  repoLatestBuild,
  buildTarget,
  onOpenCiModal,
}: LinkedRepoCiStatusProps) {
  if (loading) {
    return <Skeleton className="h-4 w-36 rounded-sm" />;
  }
  if (error) {
    return (
      <span className="flex min-w-0 items-center gap-1 text-[13px] text-destructive">
        <AlertCircleIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">CI 查询失败</span>
      </span>
    );
  }
  if (!ciBinding) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="2xs"
        onPress={onOpenCiModal}
        className="cursor-pointer text-muted-foreground"
      >
        未关联 CI
      </Button>
    );
  }
  if (latestRun) {
    const providerLabel = snapshot?.provider === 'jenkins' ? 'Jenkins' : 'Flow';
    // 来源用辅助文字表达：仓库最新 / 需求分支构建（橙色留给待处理状态，不再用橙色徽标）
    const sourceLabel = repoLatestBuild ? '仓库最新' : '需求分支构建';
    const runTime = latestRun.startTime != null ? formatRelativeTime(latestRun.startTime) : null;
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
          <StatusIcon status={latestRun.status} decorative className="size-3.5 shrink-0" />
          <span className="truncate font-mono text-[12px]">
            {providerLabel} #{latestRun.runId}
          </span>
        </span>
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {sourceLabel}
          {runTime ? ` · ${runTime}` : ''}
        </span>
      </div>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="2xs"
      onPress={() => openBuildWorkbenchFromTrigger(buildTarget, 'runs')}
      className="cursor-pointer text-muted-foreground"
    >
      暂无构建记录
    </Button>
  );
}

export interface LinkedRepoBuildActionProps {
  repoName: string;
  ciBinding?: RepoCiBinding;
  buildTarget: BuildWorkbenchTarget;
  onOpenCiModal: () => void;
}

export function LinkedRepoBuildAction({
  repoName,
  ciBinding,
  buildTarget,
  onOpenCiModal,
}: LinkedRepoBuildActionProps) {
  const allowWriteOps = useApp((state) => state.settings?.allowWriteOps ?? false);
  if (ciBinding) {
    return (
      <BuildWorkbenchTrigger
        target={buildTarget}
        label="发起构建"
        title={ciBinding.provider === 'flow' ? '触发流水线 ' + ciBinding.pipelineName : '为 ' + repoName + ' 发起构建'}
        variant="secondary"
      />
    );
  }
  return (
    <>
      <WriteOpGatedTrigger label="关联 CI" icon={<PlusIcon className="size-3.5" />} variant="outline" />
      {allowWriteOps && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onPress={onOpenCiModal}
          className="gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <PlusIcon className="size-3.5" />
          <span>关联 CI</span>
        </Button>
      )}
    </>
  );
}

export interface LinkedRepoCiSectionProps {
  repoName: string;
  ciBinding?: RepoCiBinding;
  latestRun?: CiRunSummary;
  buildAction: React.ReactNode;
  onOpenCiModal: () => void;
  /** 本次构建实际目标分支（Jenkins 参数分支优先，其次目标基准）：面板底行「构建目标」。 */
  buildBranch?: string;
  /** 「查看记录」：打开构建工作台的运行记录页。 */
  onViewRuns: () => void;
}

export function LinkedRepoCiSection({
  ciBinding,
  latestRun,
  buildAction,
  onOpenCiModal,
  buildBranch,
  onViewRuns,
}: LinkedRepoCiSectionProps) {
  const providerLabel = ciBinding ? (ciBinding.provider === 'flow' ? '云效 Flow' : 'Jenkins') : null;
  return (
    <Surface variant="secondary" className="flex min-w-0 flex-col gap-2.5 rounded-lg p-4">
      {/* 标题行：唯一主操作「发起构建」 */}
      <SectionHeader level="h2" title="构建" action={buildAction} />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {latestRun ? (
            <>
              <StatusIcon status={latestRun.status} decorative className="size-3.5 shrink-0" />
              <span className="font-mono text-[11px] font-medium text-foreground/90">
                {providerLabel} #{latestRun.runId}
              </span>
              {latestRun.startTime && (
                <span className="text-[11px] text-muted-foreground">
                  {formatRelativeTime(latestRun.startTime)}
                </span>
              )}
              {latestRun.durationMs != null && latestRun.durationMs > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  · 耗时 <span className="tabular-nums">{formatDuration(latestRun.durationMs)}</span>
                </span>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <WorkflowIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {ciBinding ? '暂无构建记录' : '未关联 CI 流水线'}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          onPress={onViewRuns}
          className="shrink-0 cursor-pointer gap-0.5 text-primary hover:text-primary/80"
        >
          查看记录
          <ChevronRightIcon className="size-3" aria-hidden="true" />
        </Button>
      </div>

      {/* 流水线 / Job 与构建目标 */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {ciBinding && (
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button
                  type="button"
                  variant="ghost"
                  size="2xs"
                  onPress={onOpenCiModal}
                  className="min-w-0 cursor-pointer"
                  aria-label="点击修改关联的 CI 流水线"
                >
                  <span className="max-w-40 truncate">
                    {ciBinding.provider === 'flow' ? ciBinding.pipelineName : ciBinding.jobFullName}
                  </span>
                  <Settings2Icon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                </Button>
              )}
            />
            <TooltipContent>点击修改关联的 CI 流水线</TooltipContent>
          </Tooltip>
        )}
        {buildBranch && (
          <span className="flex min-w-0 items-center gap-1">
            <IconHint
              icon={<GitBranchIcon className="size-3" />}
              label="本次构建的目标分支"
              className="size-5"
            />
            <OverflowTooltip text={buildBranch} className="max-w-56 truncate font-mono text-foreground/80" />
          </span>
        )}
      </div>
    </Surface>
  );
}
