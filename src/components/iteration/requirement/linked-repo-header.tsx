import type React from 'react';
import {
  ArrowRightIcon,
  ChevronRightIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  HistoryIcon,
  RefreshCwIcon,
  Settings2Icon,
  UnlinkIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { RepoCiBinding, RepoSummary } from '@/types';
import { Button, Dropdown, Label, Separator, Toolbar, Tooltip } from '@heroui/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Chip } from '@/components/ui/chip';
import { openBuildWorkbenchFromTrigger } from '@/components/build-workbench';
import type { BuildWorkbenchTarget } from '@/store/ui';
import { cn } from '@/lib/utils';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import type { IterationBaselineCheck } from './types';

export interface LinkedRepoHeaderProps {
  repo: RepoSummary;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  palette: string;
  developerBranch: string;
  developerBranchState: IterationBaselineCheck['state'];
  operationBaseBranch: string;
  primaryAction: React.ReactNode;
  cardRefreshing: boolean;
  onRefresh: () => void;
  ciBinding?: RepoCiBinding;
  hasRuns: boolean;
  buildTarget: BuildWorkbenchTarget;
  onOpenCiModal: () => void;
  onCreateMr: () => void;
  onUnlinkRepo?: (repoId: number) => void;
}

export function LinkedRepoHeader({
  repo,
  detailsOpen,
  onToggleDetails,
  palette,
  developerBranch,
  developerBranchState,
  operationBaseBranch,
  primaryAction,
  cardRefreshing,
  onRefresh,
  ciBinding,
  hasRuns,
  buildTarget,
  onOpenCiModal,
  onCreateMr,
  onUnlinkRepo,
}: LinkedRepoHeaderProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5">
      {/* 左侧：展开折叠图标 + 仓库图标 + 仓库名称与分支拓扑 */}
      <div className="flex min-w-[240px] flex-1 items-center gap-2.5">
        {/* 展开折叠图标：HeroUI Button (ghost + isIconOnly) + HeroUI Tooltip */}
        <Tooltip>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={onToggleDetails}
            aria-label={detailsOpen ? '收起分支与交付详情' : '展开分支与交付详情'}
            aria-expanded={detailsOpen}
            className="size-6 shrink-0 rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <ChevronRightIcon
              className={cn(
                'size-3.5 transition-transform duration-200',
                detailsOpen && 'rotate-90 text-primary',
              )}
            />
          </Button>
          <Tooltip.Content>{detailsOpen ? '收起分支与交付详情' : '展开分支与交付详情'}</Tooltip.Content>
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
              title={repo.name}
              className="text-sm font-semibold tracking-tight text-foreground"
            />
            {repo.pathWithNamespace && (
              <Chip
                size="sm"
                variant="secondary"
                className="h-5 max-w-72 cursor-default gap-1 px-2 font-mono text-[11px] font-normal text-muted-foreground"
                title={repo.pathWithNamespace}
              >
                <span className="truncate">{repo.pathWithNamespace}</span>
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
              className="h-5 max-w-44 gap-1 px-2 font-mono text-[11px] font-medium sm:max-w-64"
            >
              <OverflowTooltip
                text={developerBranch || '未配置需求分支'}
                title={developerBranch || '未配置需求分支'}
                className="max-w-40 truncate sm:max-w-56"
              />
            </Chip>
            <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Chip
              size="sm"
              variant="soft"
              color="accent"
              className="h-5 max-w-44 gap-1 px-2 font-mono text-[11px] font-medium sm:max-w-64"
            >
              <OverflowTooltip
                text={operationBaseBranch || '未配置目标基准'}
                title={operationBaseBranch || '未配置目标基准'}
                className="max-w-40 truncate sm:max-w-56"
              />
            </Chip>
          </div>
        </div>
      </div>

      {/* 右侧动作工具栏（主操作 + 更多下拉，HeroUI Toolbar + 原生 Dropdown 原语） */}
      <Toolbar aria-label={`${repo.name} 关联仓库操作`} className="flex shrink-0 items-center gap-2">
        {primaryAction}

        <Dropdown>
          {/* Dropdown.Trigger 本身即 HeroUI 组件（react-aria Button 封装），内部严禁再嵌套 Button（button>button 非法 DOM）；
              variant/size 对其无效（内部为无样式的 react-aria Button），紧凑外观由 className 覆盖 */}
          <Dropdown.Trigger
            type="button"
            className="h-7 rounded-sm px-2 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            aria-label="更多仓库操作"
          >
            更多
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end" className="min-w-44">
            <Dropdown.Menu
              aria-label={`${repo.name} 仓库操作`}
              onAction={(key) => {
                switch (String(key)) {
                  case 'refresh':
                    onRefresh();
                    break;
                  case 'build':
                    openBuildWorkbenchFromTrigger(buildTarget, 'parameters');
                    break;
                  case 'runs':
                    openBuildWorkbenchFromTrigger(buildTarget, 'runs');
                    break;
                  case 'config-ci':
                    onOpenCiModal();
                    break;
                  case 'create-mr':
                    onCreateMr();
                    break;
                  case 'unlink':
                    onUnlinkRepo?.(repo.id);
                    break;
                }
              }}
            >
              <Dropdown.Item id="refresh" textValue="刷新数据" isDisabled={cardRefreshing}>
                <RefreshCwIcon className={cn('size-3.5 shrink-0 text-muted-foreground', cardRefreshing && 'animate-spin')} />
                <Label>刷新数据</Label>
              </Dropdown.Item>
              {ciBinding && (
                <Dropdown.Item id="build" textValue="发起构建">
                  <WorkflowIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <Label>发起构建…</Label>
                </Dropdown.Item>
              )}
              <Dropdown.Item id="runs" textValue="构建记录" isDisabled={!hasRuns}>
                <HistoryIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <Label>构建记录</Label>
              </Dropdown.Item>
              <Dropdown.Item id="config-ci" textValue={ciBinding ? '修改流水线' : '关联流水线'}>
                <Settings2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <Label>{ciBinding ? '修改流水线…' : '关联流水线…'}</Label>
              </Dropdown.Item>
              {developerBranch && (
                <Dropdown.Item id="create-mr" textValue="创建 MR">
                  <GitPullRequestIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <Label>创建 MR…</Label>
                </Dropdown.Item>
              )}
              {onUnlinkRepo && (
                <>
                  <Separator className="my-1 bg-border/60" />
                  <Dropdown.Item id="unlink" textValue="取消关联" variant="danger">
                    <UnlinkIcon className="size-3.5 shrink-0 text-danger" />
                    <Label>取消关联</Label>
                  </Dropdown.Item>
                </>
              )}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </Toolbar>
    </div>
  );
}
