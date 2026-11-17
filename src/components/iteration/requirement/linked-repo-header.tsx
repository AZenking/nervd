import {
  AlertCircleIcon,
  ChevronRightIcon,
  GitBranchIcon,
  MoreHorizontalIcon,
  HistoryIcon,
  UnlinkIcon,
  Loader2Icon,
  RefreshCwIcon,
} from 'lucide-react';
import type React from 'react';
import type { RepoSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { openBuildWorkbenchFromTrigger } from '@/components/build-workbench';
import type { BuildWorkbenchTarget } from '@/store/ui';
import { cn } from '@/lib/utils';
import type { RepoTraceState } from './linked-repo-delivery';

export interface LinkedRepoHeaderProps {
  repo: RepoSummary;
  palette: string;
  /** 回退态动作（重试查询 / 查询中 / 查看详情）：正常态动作跟随各自 Surface 标题行。 */
  primaryAction?: React.ReactNode;
  /** 追溯（分支 / MR）查询状态：查询中 / 失败 / 就绪，直接呈现在仓库名旁。 */
  traceState?: RepoTraceState;
  /** 交付详情展开态：摘要行「展开 / 收起」开关与详情内容共用同一状态。 */
  detailsOpen: boolean;
  onToggleDetails: () => void;
  /** 取消关联入口：写操作，收在「更多」菜单里（确认与只读门控由调用方承载）。 */
  onUnlink?: () => void;
  cardRefreshing: boolean;
  onRefresh: () => void;
  hasRuns: boolean;
  buildTarget: BuildWorkbenchTarget;
}

/** 紧凑摘要行：仓库名 + 追溯查询状态 + 交付分支 → 目标分支 + 只读主操作 / 只读更多入口。 */
export function LinkedRepoHeader({
  repo,
  palette,
  traceState,
  primaryAction,
  detailsOpen,
  onToggleDetails,
  onUnlink,
  cardRefreshing,
  onRefresh,
  hasRuns,
  buildTarget,
}: LinkedRepoHeaderProps) {
  return (
    <Card.Header className="flex flex-row items-start gap-3 p-5">
      {/* 仓库图标位：HeroUI Avatar 原语（调色板渐变 + GitBranch 图标回退） */}
      <Avatar
        className={cn(
          'size-9 shrink-0 select-none rounded-lg border bg-card bg-linear-to-br',
          palette,
        )}
        aria-hidden="true"
      >
        <AvatarFallback className="rounded-lg bg-transparent font-normal text-inherit">
          <GitBranchIcon className="size-4" />
        </AvatarFallback>
      </Avatar>

      {/* 仓库身份：Card.Title（名称）+ 追溯状态；Card.Description（路径，灰色等宽，不带胶囊底色） */}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Card.Title className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-foreground">
            {repo.name}
          </Card.Title>
          {traceState && <TraceStateBadge state={traceState} />}
        </div>
        {repo.pathWithNamespace && (
          <Card.Description className="mt-1 min-w-0 truncate font-mono text-[11px] text-muted-foreground">
            {repo.pathWithNamespace}
          </Card.Description>
        )}
      </div>

      {/* 操作：展开/收起 + 「⋯」菜单（交付动作跟随各自 Surface 标题行） */}
      <div className="flex shrink-0 items-center gap-1">
        {primaryAction}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="linked-repo-details-toggle"
          aria-expanded={detailsOpen}
          onPress={onToggleDetails}
          className="cursor-pointer"
        >
          <span>{detailsOpen ? '收起' : '展开'}</span>
          <ChevronRightIcon
            className={cn(
              'size-3.5 transition-transform',
              detailsOpen ? '-rotate-90 text-primary' : 'rotate-90',
            )}
            aria-hidden="true"
          />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="更多只读仓库操作"
                className="cursor-pointer"
              />
            }
          >
            <MoreHorizontalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label={`${repo.name} 只读仓库操作`} className="min-w-40">
            <DropdownMenuItem textValue="刷新数据" disabled={cardRefreshing} onSelect={onRefresh}>
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
            {onUnlink && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  textValue={`取消关联 ${repo.name}`}
                  className="text-danger data-[variant=danger]:text-danger"
                  onSelect={onUnlink}
                >
                  <UnlinkIcon className="size-3.5 shrink-0" />
                  <span>取消关联</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card.Header>
  );
}

/** 追溯状态：小圆点 + 文案（不再用带底色的 Chip，避免与仓库名抢注意力）。 */
function TraceStateBadge({ state }: { state: RepoTraceState }) {
  const tone =
    state === 'error' ? 'text-danger' : state === 'loading' ? 'text-muted-foreground' : 'text-success';
  const label = state === 'loading' ? '追溯查询中' : state === 'error' ? '追溯查询失败' : '追溯就绪';
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 text-[11px] font-medium', tone)}
      title={
        state === 'loading'
          ? '正在查询该仓库的分支与合并请求'
          : state === 'error'
            ? '分支与合并请求查询失败，可刷新此仓库重试'
            : '分支与合并请求已就绪'
      }
    >
      {state === 'loading' ? (
        <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
      ) : state === 'error' ? (
        <AlertCircleIcon className="size-3" aria-hidden="true" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}