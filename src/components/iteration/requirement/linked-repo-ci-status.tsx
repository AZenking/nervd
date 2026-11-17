import type React from 'react';
import {
  AlertCircleIcon,
  InfoIcon,
  Loader2Icon,
  PlusIcon,
  Settings2Icon,
} from 'lucide-react';
import type { CiRunSummary, RepoCiBinding, RepoCiSnapshot } from '@/types';
import { useApp } from '@/store/app';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Separator } from '@/components/ui/separator';
import { StatusIcon } from '@/components/status-icon';
import { WriteOpGatedTrigger } from '@/components/WriteOpButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ciStatusInfo } from '@/lib/ci';
import { formatDateTime, formatDuration, formatRelativeTime } from '@/lib/format';
import { BuildWorkbenchTrigger, openBuildWorkbenchFromTrigger } from '@/components/build-workbench';
import { OverflowTooltip } from '@/components/overflow-tooltip';
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
  if (error) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="inline"
              onPress={() => openBuildWorkbenchFromTrigger(buildTarget, 'runs')}
              className="group gap-1 text-destructive hover:text-destructive max-w-full font-normal truncate"
              aria-label={`CI 查询失败，点击查看构建记录。${ciSummary}`}
            >
              <AlertCircleIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">CI 查询失败</span>
              {latestRun && (
                <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                  · 上次 #{latestRun.runId}
                </span>
              )}
            </Button>
          }
        />
        <TooltipContent>{ciSummary}，点击查看构建记录</TooltipContent>
      </Tooltip>
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
              className="group gap-1 text-muted-foreground hover:text-foreground font-normal"
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
    const providerLabel = snapshot?.provider === 'jenkins' ? 'Jenkins' : 'Flow';
    const runTime = latestRun.startTime != null
      ? formatRelativeTime(latestRun.startTime)
      : '构建时间未知';

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="inline"
              onPress={() => openBuildWorkbenchFromTrigger(buildTarget, 'runs')}
              className="group gap-1.5 text-left max-w-full font-normal truncate"
              aria-label={`${ciSummary}，点击查看构建记录`}
            >
              <div className="flex min-w-0 items-center gap-1.5 shrink-0">
                <StatusIcon status={latestRun.status} decorative className="size-3.5" />
                <span className="font-mono text-[11px] font-medium text-foreground/90 group-hover:text-primary shrink-0">
                  {providerLabel} #{latestRun.runId}
                </span>
                {/* 行首已有状态图形：行尾不再重复文字徽标（AGENTS §3.4）；状态语义仅保留读屏文本 */}
                <span className="sr-only">{ciInfo.label}</span>
                <span className="truncate text-[11px] text-muted-foreground/80">· {runTime}</span>
                {repoLatestBuild && (
                  <Chip
                    size="sm"
                    variant="soft"
                    color="warning"
                    className="shrink-0 font-medium"
                    title="无法确认该构建属于需求分支，仅作仓库最新构建参考，不据此判定需求构建通过"
                  >
                    仓库最新构建
                  </Chip>
                )}
              </div>
            </Button>
          }
        />
        <TooltipContent>
          {ciSummary}
          {repoLatestBuild ? '（无法确认属于该需求分支，不据此判定需求构建通过）' : ''}
          ，点击查看构建记录
        </TooltipContent>
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
            className="text-muted-foreground hover:text-foreground truncate font-normal"
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
  const allowWriteOps = useApp((state) => state.settings?.allowWriteOps ?? false);
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
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="关于构建分支来源的说明"
                className="cursor-help text-muted-foreground/70 hover:text-foreground"
              >
                <InfoIcon className="size-3.5" aria-hidden="true" />
              </Button>
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
                  className="group gap-1 font-mono text-muted-foreground hover:text-foreground truncate max-w-48 font-normal"
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
                  className="gap-1 font-medium"
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
          <OverflowTooltip
            text={`· 上次构建 ${formatRelativeTime(latestRun.startTime)}${
              latestRun.durationMs != null && latestRun.durationMs > 0
                ? ` (${formatDuration(latestRun.durationMs)})`
                : ''
            }`}
            tooltip={`构建时间：${formatDateTime(latestRun.startTime)}`}
            className="hidden sm:inline-block max-w-64 truncate font-mono text-[11px] text-muted-foreground"
          />
        )}
        </div>
        <div className="flex shrink-0 items-center">{buildAction}</div>
      </section>
    </>
  );
}
