import type React from 'react';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  GitBranchIcon,
  HistoryIcon,
  Loader2Icon,
  RefreshCwIcon,
} from 'lucide-react';
import type { RepoSummary } from '@/types';
// Toolbar 暂无 `@/components/ui/*` 出口（BRIEF §0 归 lead），暂保留 @heroui/react 直连。
import { Toolbar } from '@/components/ui/toolbar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Chip } from '@/components/ui/chip';
import { openBuildWorkbenchFromTrigger } from '@/components/build-workbench';
import type { BuildWorkbenchTarget } from '@/store/ui';
import { cn } from '@/lib/utils';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import type { IterationBaselineCheck } from './types';
import type { RepoTraceState } from './linked-repo-delivery';

export interface LinkedRepoHeaderProps {
  repo: RepoSummary;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  palette: string;
  developerBranch: string;
  developerBranchState: IterationBaselineCheck['state'];
  operationBaseBranch: string;
  /** 追溯（分支 / MR）查询状态：查询中 / 失败 / 就绪，直接呈现在仓库名旁。 */
  traceState?: RepoTraceState;
  /** 摘要行只读主操作（查看看 MR / 重试查询 / 前往配置等）；写操作只在展开后的交付详情中提供。 */
  primaryAction?: React.ReactNode;
  cardRefreshing: boolean;
  onRefresh: () => void;
  hasRuns: boolean;
  buildTarget: BuildWorkbenchTarget;
}

/** 紧凑摘要行：仓库名 + 追溯查询状态 + 交付分支 → 目标分支 + 只读主操作 / 只读更多入口。 */
export function LinkedRepoHeader({
  repo,
  detailsOpen,
  onToggleDetails,
  palette,
  developerBranch,
  developerBranchState,
  operationBaseBranch,
  traceState,
  primaryAction,
  cardRefreshing,
  onRefresh,
  hasRuns,
  buildTarget,
}: LinkedRepoHeaderProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5">
      {/* 左侧：展开折叠图标 + 仓库图标 + 仓库名称与分支拓扑 */}
      <div className="flex min-w-[240px] flex-1 items-center gap-2.5">
        {/* 展开折叠图标：HeroUI Button (ghost + isIconOnly) + HeroUI Tooltip */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onPress={onToggleDetails}
                aria-label={detailsOpen ? '收起分支与交付详情' : '展开分支与交付详情'}
                aria-expanded={detailsOpen}
                className="shrink-0 text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground"
              >
                <ChevronRightIcon
                  className={cn(
                    'size-3.5 transition-transform duration-200',
                    detailsOpen && 'rotate-90 text-primary',
                  )}
                />
              </Button>
            }
          />
          <TooltipContent>{detailsOpen ? '收起分支与交付详情' : '展开分支与交付详情'}</TooltipContent>
        </Tooltip>

        {/* 仓库图标位：HeroUI Avatar 原语（调色板渐变 + GitBranch 图标回退） */}
        <Avatar
          className={cn(
            'size-9.5 shrink-0 select-none rounded-lg border bg-card bg-linear-to-br',
            palette,
          )}
          aria-hidden="true"
        >
          <AvatarFallback className="rounded-lg bg-transparent font-normal text-inherit">
            <GitBranchIcon className="size-4" />
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <OverflowTooltip
              text={repo.name}
              className="text-sm font-semibold tracking-tight text-foreground"
            />
            {repo.pathWithNamespace && (
              <Chip
                size="sm"
                variant="secondary"
                className="max-w-72 min-w-0 cursor-default gap-1 font-mono font-normal text-muted-foreground"
              >
                <OverflowTooltip text={repo.pathWithNamespace} className="truncate" />
              </Chip>
            )}
            {traceState && (
              <Chip
                size="sm"
                variant="soft"
                color={traceState === 'error' ? 'danger' : traceState === 'ready' ? 'success' : 'default'}
                className="shrink-0 gap-1 font-medium"
                title={
                  traceState === 'loading'
                    ? '正在查询该仓库的分支与合并请求'
                    : traceState === 'error'
                      ? '分支与合并请求查询失败，可刷新此仓库重试'
                      : '分支与合并请求已就绪'
                }
              >
                {traceState === 'loading' ? (
                  <Loader2Icon className="size-2.5 animate-spin" aria-hidden="true" />
                ) : traceState === 'error' ? (
                  <AlertCircleIcon className="size-2.5" aria-hidden="true" />
                ) : (
                  <CheckIcon className="size-2.5" aria-hidden="true" />
                )}
                <span>{traceState === 'loading' ? '追溯查询中' : traceState === 'error' ? '追溯查询失败' : '追溯就绪'}</span>
              </Chip>
            )}
          </div>

          {/* 分支拓扑示意：HeroUI Chip 双段（需求分支 → 目标基准） */}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
            <span className="shrink-0 text-[11px] text-muted-foreground">交付分支:</span>
            <Chip
              size="sm"
              variant="soft"
              color={developerBranchState === 'missing' ? 'warning' : 'default'}
              className="max-w-44 gap-1 font-mono font-medium sm:max-w-64"
            >
              <OverflowTooltip
                text={developerBranch || '未配置需求分支'}
                className="max-w-40 truncate sm:max-w-56"
              />
            </Chip>
            <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Chip
              size="sm"
              variant="soft"
              color="accent"
              className="max-w-44 gap-1 font-mono font-medium sm:max-w-64"
            >
              <OverflowTooltip
                text={operationBaseBranch || '未配置目标基准'}
                className="max-w-40 truncate sm:max-w-56"
              />
            </Chip>
          </div>
        </div>
      </div>

      {/* 右侧摘要动作：只读主操作 + 只读「更多」（刷新 / 构建记录）；写操作一律在展开后的交付详情中 */}
      <Toolbar aria-label={`${repo.name} 关联仓库操作`} className="flex shrink-0 items-center gap-2">
        {primaryAction}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="更多只读仓库操作"
                className="text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
              />
            }
          >
            更多
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            aria-label={`${repo.name} 只读仓库操作`}
            className="min-w-40"
          >
            <DropdownMenuItem
              textValue="刷新数据"
              disabled={cardRefreshing}
              onSelect={onRefresh}
            >
              <RefreshCwIcon
                className={cn('size-3.5 shrink-0 text-muted-foreground', cardRefreshing && 'animate-spin')}
              />
              <span>刷新数据</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              textValue="构建记录"
              disabled={!hasRuns}
              onSelect={() => openBuildWorkbenchFromTrigger(buildTarget, 'runs')}
            >
              <HistoryIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span>构建记录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Toolbar>
    </div>
  );
}