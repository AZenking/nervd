import type { ReactNode } from 'react';
import { AlertTriangleIcon, GitBranchIcon, LayersIcon, PlayCircleIcon } from 'lucide-react';
import { Card, Chip } from '@heroui/react';
import { Skeleton } from '@/components/ui/skeleton';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { cn } from '@/lib/utils';

export interface KpiCardsGridProps {
  categoryLabel: string;
  itemCount: number;
  dataComplete?: boolean;
  remainingLabel?: string;
  remainingTone?: 'ok' | 'run' | 'fail' | 'idle';
  activeBuildCount: number;
  failedCount: number;
  ciErrorCount: number;
  unboundCiCount: number;
  repoCount: number;
  pipelineCount: number;
  loading?: boolean;
  className?: string;
}

function MetricCard({
  label,
  icon,
  value,
  suffix,
  status,
  loading = false,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  suffix: string;
  /** 徽标行（真实 Chip） */
  status: ReactNode;
  /** 骨架态：值为 0 且仍在加载时，值行与徽标行各自渲染同高骨架，避免只骨架一张卡的错位感 */
  loading?: boolean;
}) {
  return (
    <Card
      variant="default"
      className="gap-0 p-0"
    >
      <Card.Header className="flex flex-row items-center justify-between gap-2 px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
        <Card.Title className="min-w-0 text-xs font-medium text-muted-foreground">
          <OverflowTooltip text={label} className="min-w-0" />
        </Card.Title>
        {icon}
      </Card.Header>
      <Card.Content className="flex items-baseline justify-between gap-2 px-4 pt-3 pb-4 sm:px-5 sm:pb-5">
        {loading ? (
          <Skeleton className="inline-block h-8 w-16 rounded" aria-hidden="true" />
        ) : (
          <div className="font-mono tabular-nums text-2xl font-bold tracking-tight text-foreground">
            {value}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span>
          </div>
        )}
        {loading ? (
          <Skeleton className="h-6 w-20 shrink-0 rounded-md" aria-hidden="true" />
        ) : (
          status
        )}
      </Card.Content>
    </Card>
  );
}

export function KpiCardsGrid({
  categoryLabel,
  itemCount,
  dataComplete = true,
  remainingLabel,
  remainingTone = 'idle',
  activeBuildCount,
  failedCount,
  ciErrorCount,
  unboundCiCount,
  repoCount,
  pipelineCount,
  loading = false,
  className,
}: KpiCardsGridProps) {
  const totalAssets = repoCount + pipelineCount;
  // 口径统一：需要关注 = 失败构建 + CI 查询失败 + 未绑定 CI，
  // 与下方「需要关注」区块的三行细分一一对应（原实现漏算未绑定，却仍在徽标里展示「N 未绑定」）。
  const totalIssues = failedCount + ciErrorCount + unboundCiCount;
  const issueParts = [
    failedCount > 0 ? `${failedCount} 失败构建` : null,
    ciErrorCount > 0 ? `${ciErrorCount} CI 查询失败` : null,
    unboundCiCount > 0 ? `${unboundCiCount} 未绑定` : null,
  ].filter((part): part is string => part !== null);
  const issueLabel = issueParts.length > 0 ? issueParts.join(' · ') : '正常无异常';

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      <MetricCard
        label={`当前工作项 (${categoryLabel})`}
        icon={<LayersIcon className="size-4 text-primary/70" />}
        value={itemCount}
        suffix="项"
        loading={loading && itemCount === 0}
        status={(
          <Chip
            size="sm"
            variant="soft"
            color={
              remainingTone === 'fail'
                ? 'danger'
                : remainingTone === 'run'
                  ? 'warning'
                  : 'default'
            }
            className="font-mono text-[11px] tabular-nums"
          >
            {remainingLabel || (dataComplete ? '全部加载' : '部分加载')}
          </Chip>
        )}
      />

      <MetricCard
        label="活跃构建任务"
        icon={<PlayCircleIcon className="size-4 text-sig-run/70" />}
        value={activeBuildCount}
        suffix="项"
        loading={loading && activeBuildCount === 0}
        status={(
          <Chip
            size="sm"
            variant="soft"
            color={activeBuildCount > 0 ? 'warning' : 'default'}
            className="font-mono text-[11px] tabular-nums"
          >
            {activeBuildCount > 0 ? `${activeBuildCount} 正在运行` : '就绪待命'}
          </Chip>
        )}
      />

      <MetricCard
        label="需要关注 (构建/CI)"
        icon={<AlertTriangleIcon className={cn('size-4', totalIssues > 0 ? 'text-destructive' : 'text-muted-foreground')} />}
        value={totalIssues}
        suffix="处"
        loading={loading && totalIssues === 0}
        status={(
          <Chip
            size="sm"
            variant="soft"
            color={
              failedCount > 0
                ? 'danger'
                : ciErrorCount > 0 || unboundCiCount > 0
                  ? 'warning'
                  : 'success'
            }
            className="max-w-[70%] font-mono text-[11px] tabular-nums"
          >
            <Chip.Label className="min-w-0 truncate">
              <OverflowTooltip text={issueLabel} className="min-w-0" />
            </Chip.Label>
          </Chip>
        )}
      />

      <MetricCard
        label="交付监控资产"
        icon={<GitBranchIcon className="size-4 text-muted-foreground" />}
        value={totalAssets}
        suffix="个"
        loading={loading && totalAssets === 0}
        status={(
          <Chip
            size="sm"
            variant="soft"
            color="default"
            className="font-mono text-[11px] tabular-nums"
          >
            {repoCount} 仓库 · {pipelineCount} 流水线
          </Chip>
        )}
      />
    </div>
  );
}