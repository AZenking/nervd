import type { ReactNode } from 'react';
import { AlertTriangleIcon, GitBranchIcon, LayersIcon, PlayCircleIcon } from 'lucide-react';
import { Card, Chip } from '@heroui/react';
import type { ConnectionState } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
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
  connectionState: ConnectionState;
  loading?: boolean;
  className?: string;
}

function MetricCard({
  label,
  icon,
  value,
  suffix,
  status,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  suffix: string;
  status: ReactNode;
}) {
  return (
    <Card
      variant="default"
      className="gap-0 p-0"
    >
      <Card.Header className="flex flex-row items-center justify-between gap-2 px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
        <Card.Title className="text-xs font-medium text-muted-foreground truncate" title={label}>
          {label}
        </Card.Title>
        {icon}
      </Card.Header>
      <Card.Content className="flex items-baseline justify-between gap-2 px-4 pt-3 pb-4 sm:px-5 sm:pb-5">
        <div className="font-mono tabular-nums text-2xl font-bold tracking-tight text-foreground">
          {value}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span>
        </div>
        {status}
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
  connectionState,
  loading = false,
  className,
}: KpiCardsGridProps) {
  const totalAssets = repoCount + pipelineCount;
  const totalIssues = failedCount + ciErrorCount;

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      <MetricCard
        label={`当前工作项 (${categoryLabel})`}
        icon={<LayersIcon className="size-4 text-primary/70" />}
        value={loading && itemCount === 0 ? <Skeleton className="inline-block h-8 w-16 rounded" /> : itemCount}
        suffix="项"
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
            className="text-[11px]"
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
        status={(
          <Chip
            size="sm"
            variant="soft"
            color={activeBuildCount > 0 ? 'warning' : 'default'}
            className="text-[11px]"
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
        status={(
          <Chip
            size="sm"
            variant="soft"
            color={totalIssues > 0 ? 'danger' : 'success'}
            className="text-[11px]"
          >
            {failedCount > 0 ? `${failedCount} 失败构建` : ciErrorCount > 0 ? 'CI 查询失败' : unboundCiCount > 0 ? `${unboundCiCount} 未绑定` : '正常无异常'}
          </Chip>
        )}
      />

      <MetricCard
        label="交付监控资产"
        icon={<GitBranchIcon className="size-4 text-muted-foreground" />}
        value={totalAssets}
        suffix="个"
        status={(
          <Chip
            size="sm"
            variant="soft"
            color={connectionState === 'ok' ? 'success' : 'warning'}
            className="text-[11px]"
          >
            {repoCount} 仓库 · {pipelineCount} 流水线
          </Chip>
        )}
      />
    </div>
  );
}
