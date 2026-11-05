import type React from 'react';
import {
  CheckCircle2Icon,
  InfoIcon,
  Loader2Icon,
  PlusIcon,
  Settings2Icon,
  XCircleIcon,
} from 'lucide-react';
import type { CiRunSummary, RepoCiBinding, RepoCiSnapshot } from '@/types';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ciStatusInfo } from '@/lib/ci';
import { formatDateTime, formatDuration, formatRelativeTime } from '@/lib/format';
import { BuildWorkbenchTrigger, openBuildWorkbenchFromTrigger } from '@/components/build-workbench';
import type { BuildWorkbenchTarget } from '@/store/ui';

export interface LinkedRepoCiStatusProps {
  loading?: boolean;
  ciBinding?: RepoCiBinding;
  latestRun?: CiRunSummary;
  snapshot?: RepoCiSnapshot | null;
  ciSummary: string;
  buildTarget: BuildWorkbenchTarget;
  onOpenCiModal: () => void;
}

export function LinkedRepoCiStatus({
  loading,
  ciBinding,
  latestRun,
  snapshot,
  ciSummary,
  buildTarget,
  onOpenCiModal,
}: LinkedRepoCiStatusProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin shrink-0 text-primary" />
        <span className="truncate">查询 CI…</span>
      </div>
    );
  }
  if (!ciBinding) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onPress={onOpenCiModal}
              className="group h-auto p-1 gap-1 text-xs text-muted-foreground hover:text-foreground font-normal"
              title="点击关联流水线"
              aria-label="点击关联流水线"
            >
              <span>— 未关联 CI</span>
              <PlusIcon className="size-3 opacity-60 group-hover:opacity-100" />
            </Button>
          }
        />
        <TooltipContent>点击关联流水线</TooltipContent>
      </Tooltip>
    );
  }
  if (latestRun) {
    const ciInfo = ciStatusInfo(latestRun.status);
    const isSuccess = ciInfo.tone === 'ok';
    const isFailed = ciInfo.tone === 'fail';
    const isRunning = ciInfo.tone === 'run';

    const providerLabel = snapshot?.provider === 'jenkins' ? 'Jenkins' : 'Flow';

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onPress={() => openBuildWorkbenchFromTrigger(buildTarget, 'runs')}
              className="group h-auto p-1 gap-1.5 text-xs text-left max-w-full font-normal truncate"
              title={`${ciSummary}，点击查看构建记录`}
              aria-label={`${ciSummary}，点击查看构建记录`}
            >
              <div className="flex items-center gap-1 min-w-0 shrink-0">
                {isSuccess && <CheckCircle2Icon className="size-3.5 text-success shrink-0" />}
                {isFailed && <XCircleIcon className="size-3.5 text-destructive shrink-0" />}
                {isRunning && <Loader2Icon className="size-3.5 text-warning animate-spin shrink-0" />}
                {!isSuccess && !isFailed && !isRunning && (
                  <span className="size-2 rounded-full bg-muted-foreground shrink-0" />
                )}

                <span className="font-mono text-[11px] font-medium text-foreground/90 group-hover:text-primary shrink-0">
                  {providerLabel} #{latestRun.runId}
                </span>
                <Chip
                  size="sm"
                  variant="soft"
                  color={isSuccess ? 'success' : isFailed ? 'danger' : isRunning ? 'warning' : 'default'}
                  className="text-[11px] font-medium shrink-0"
                >
                  {ciInfo.label}
                </Chip>
              </div>
            </Button>
          }
        />
        <TooltipContent>{ciSummary}，点击查看构建记录</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onPress={onOpenCiModal}
            className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground truncate font-normal"
            title="该仓库暂无运行记录，点击查看配置"
            aria-label="该仓库暂无运行记录，点击查看配置"
          >
            暂无运行记录
          </Button>
        }
      />
      <TooltipContent>该仓库暂无运行记录，点击查看配置</TooltipContent>
    </Tooltip>
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
  if (ciBinding) {
    return (
      <BuildWorkbenchTrigger
        target={buildTarget}
        label="发起构建"
        title={ciBinding.provider === 'flow' ? '触发流水线 ' + ciBinding.pipelineName : '为 ' + repoName + ' 发起构建'}
        variant="outline"
      />
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onPress={onOpenCiModal}
      className="h-7 text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
    >
      <PlusIcon className="size-3.5" />
      <span>关联 CI</span>
    </Button>
  );
}

export interface LinkedRepoCiSectionProps {
  repoName: string;
  ciBinding?: RepoCiBinding;
  latestRun?: CiRunSummary;
  buildAction: React.ReactNode;
  onOpenCiModal: () => void;
}

export function LinkedRepoCiSection({
  ciBinding,
  latestRun,
  buildAction,
  onOpenCiModal,
}: LinkedRepoCiSectionProps) {
  return (
    <>
      <Separator className="bg-border/40" />
      <section
        className="flex min-w-0 items-center justify-between gap-2 text-xs"
        aria-label="构建操作"
      >
        <div className="flex min-w-0 items-center gap-1.5">
        <span className="font-medium text-foreground">构建</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="说明"
                className="inline-flex cursor-help items-center rounded-sm text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <InfoIcon className="size-3.5" aria-hidden="true" />
              </button>
            }
          />
          <TooltipContent className="max-w-72 text-xs">
            Jenkins 构建使用所绑定参数中该次运行记录的实际分支；Flow 未提供分支时按仓库最近构建显示。
          </TooltipContent>
        </Tooltip>
        {ciBinding ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onPress={onOpenCiModal}
                  className="group h-auto p-0 gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground truncate max-w-48 font-normal"
                  title="点击修改关联的 CI 流水线"
                  aria-label="点击修改关联的 CI 流水线"
                >
                  <span className="truncate">
                    · {ciBinding.provider === 'flow' ? ciBinding.pipelineName : 'Jenkins'}
                  </span>
                  <Settings2Icon className="size-3 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                </Button>
              }
            />
            <TooltipContent>点击修改关联的 CI 流水线</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onPress={onOpenCiModal}
                  className="h-auto px-1.5 py-0.5 gap-1 rounded text-[11px] font-medium text-warning bg-warning/10 hover:bg-warning/20"
                  title="该仓库尚未关联 CI，点击就地配置云效 Flow 或 Jenkins"
                  aria-label="该仓库尚未关联 CI，点击就地配置云效 Flow 或 Jenkins"
                >
                  <PlusIcon className="size-3" />
                  <span>未关联 CI · 点击配置</span>
                </Button>
              }
            />
            <TooltipContent>该仓库尚未关联 CI，点击就地配置云效 Flow 或 Jenkins</TooltipContent>
          </Tooltip>
        )}
        {latestRun?.startTime && (
          <span
            className="hidden sm:inline text-[11px] text-muted-foreground font-mono truncate max-w-64"
            title={`构建时间：${formatDateTime(latestRun.startTime)}`}
          >
            · 上次构建 {formatRelativeTime(latestRun.startTime)}
            {latestRun.durationMs != null && latestRun.durationMs > 0
              ? ` (${formatDuration(latestRun.durationMs)})`
              : ''}
          </span>
        )}
        </div>
        <div className="flex shrink-0 items-center">{buildAction}</div>
      </section>
    </>
  );
}
