import { GitBranchIcon } from 'lucide-react';
import { Alert, Button, Card, Chip } from '@heroui/react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { ciProviderLabel } from '@/lib/ci';
import { formatDateTime } from '@/lib/format';
import { StatusIcon } from '@/components/status-icon';
import { EmptyHint } from '@/components/empty-hint';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshButton } from './refresh-button';

/** 行级骨架：与真实交付行同构（状态图标 + 主标题 + 上下文行 + 操作），避免整块文字/大灰条 */
function DeliveryRowSkeleton() {
  return (
    <li className="flex items-center gap-2.5 py-3 first:pt-1 last:pb-1" aria-hidden>
      <Skeleton className="size-4 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3.5 w-40 max-w-full" />
        <Skeleton className="mt-1.5 h-3 w-28 max-w-full" />
      </div>
      <Skeleton className="h-6 w-12 shrink-0 rounded-md" />
    </li>
  );
}

export function RepoCiSummary() {
  const { settings, repositories, repoCiByRepo, loadRepoCi } = useApp(
    useShallow((state) => ({
      settings: state.settings,
      repositories: state.repositories,
      repoCiByRepo: state.repoCiByRepo,
      loadRepoCi: state.loadRepoCi,
    })),
  );
  const openSettings = useUi((state) => state.openSettings);
  const watchedRepos = settings?.watchedRepos ?? [];
  const errors = watchedRepos.filter((repoId) => repoCiByRepo[repoId]?.error);
  const firstLoad =
    watchedRepos.length > 0 &&
    watchedRepos.some((repoId) => repoCiByRepo[repoId]?.loading) &&
    !watchedRepos.some((repoId) => repoCiByRepo[repoId]?.snapshot || repoCiByRepo[repoId]?.error);

  return (
    <Card>
      <Card.Header className="flex flex-row items-center justify-between gap-3 pb-0">
        <div>
          <Card.Title className="text-[13px] font-semibold tracking-tight text-foreground">重点仓库 CI</Card.Title>
          <Card.Description className="mt-1 text-[11px]">按仓库展示最近一次 CI 状态，保留查询上下文。</Card.Description>
        </div>
        <Chip size="sm" variant="soft" color="default" className="font-mono tabular-nums">
          {watchedRepos.length} 个仓库
        </Chip>
      </Card.Header>
      <Card.Content>
        {errors.length > 0 && (
          <Alert status="danger" className="mb-3">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>CI 查询失败</Alert.Title>
              <Alert.Description>部分仓库未能取得最新快照，可在对应行重试。</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {watchedRepos.length === 0 ? (
          <EmptyHint
            icon={GitBranchIcon}
            title="未配置重点仓库"
            description="重点仓库是总览的 CI 监控范围。在设置中把仓库加入重点仓库并绑定 CI 后，这里才会展示最近一次构建状态。"
            action={
              <Button size="sm" variant="secondary" onPress={() => openSettings('ci')}>
                前往设置绑定 CI
              </Button>
            }
            className="border-0 bg-transparent py-8"
          />
        ) : firstLoad ? (
          <ul className="divide-y divide-border/60" aria-label="正在加载重点仓库 CI 状态">
            {[0, 1, 2].map((i) => (
              <DeliveryRowSkeleton key={i} />
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-border/60 max-h-80 overflow-y-auto overscroll-contain pr-1" aria-label="重点仓库 CI 状态列表">
            {watchedRepos.map((repoId) => {
              const entry = repoCiByRepo[repoId];
              const snapshot = entry?.snapshot;
              const latest = snapshot?.runs?.[0];
              const rawStatus = snapshot?.status || latest?.status;
              const binding = settings?.repoCiBindings?.[String(repoId)];
              const isUnbound = !binding;
              const repo = repositories.find((item) => item.id === repoId);
              const name = repo?.pathWithNamespace || repo?.name || `仓库 #${repoId}`;

              return (
                <li key={repoId} className="flex flex-wrap items-center gap-2.5 py-3 first:pt-1 last:pb-1">
                  {/* 行首状态图形已编码状态语义（含 aria-label），行内不再重复同义文字徽标 */}
                  <StatusIcon status={isUnbound ? 'OTHER' : entry?.error ? 'FAIL' : rawStatus} className="size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <OverflowTooltip
                        text={name}
                        className="min-w-0 text-xs font-medium text-foreground"
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                      {/* provider/绑定上下文：未绑定时由 ciProviderLabel 给出「未绑定 CI」（非状态徽标） */}
                      <span>{ciProviderLabel(binding)}</span>
                      {entry?.loading && <span>查询中…</span>}
                      {entry?.error && <span className="text-destructive">查询失败</span>}
                      {!isUnbound && !entry?.loading && !entry?.error && !snapshot && <span>暂无运行</span>}
                      {snapshot?.name && (
                        <OverflowTooltip
                          text={snapshot.name}
                          className="max-w-[200px]"
                        />
                      )}
                      {latest?.runId && <span className="font-mono">#{latest.runId}</span>}
                      {latest?.startTime && <span>{formatDateTime(latest.startTime)}</span>}
                    </div>
                  </div>
                  {isUnbound ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => openSettings('ci')}
                      className="h-6 shrink-0 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      绑定 CI
                    </Button>
                  ) : entry?.error || !snapshot ? (
                    <RefreshButton
                      label="重试"
                      ariaLabel={`重试 ${name} CI 查询`}
                      loading={Boolean(entry?.loading)}
                      onPress={() => void loadRepoCi(repoId)}
                      className="shrink-0"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}

export function FlowPipelineSummary() {
  const { pipelines, runsByPipeline, loadingPipelines } = useApp(
    useShallow((state) => ({
      pipelines: state.pipelines,
      runsByPipeline: state.runsByPipeline,
      loadingPipelines: state.loadingPipelines,
    })),
  );

  return (
    <Card>
      <Card.Header className="flex flex-row items-center justify-between gap-3 pb-0">
        <div>
          <Card.Title className="text-[13px] font-semibold tracking-tight text-foreground">组织级 Flow</Card.Title>
          <Card.Description className="mt-1 text-[11px]">全局 Flow 流水线运行概况。</Card.Description>
        </div>
        <Chip size="sm" variant="soft" color="default" className="font-mono tabular-nums">
          {pipelines.length} 条流水线
        </Chip>
      </Card.Header>
      <Card.Content>
        {loadingPipelines ? (
          <ul className="divide-y divide-border/60" aria-label="正在加载组织级 Flow 运行数据">
            {[0, 1, 2].map((i) => (
              <DeliveryRowSkeleton key={i} />
            ))}
          </ul>
        ) : pipelines.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">暂无组织级 Flow 运行数据</div>
        ) : (
          <ul className="divide-y divide-border/60 max-h-80 overflow-y-auto overscroll-contain pr-1" aria-label="组织级 Flow 状态列表">
            {pipelines.map((pipeline) => {
              const latest = runsByPipeline[pipeline.pipelineId]?.[0];
              return (
                <li key={pipeline.pipelineId} className="flex items-center gap-2.5 py-3 first:pt-1 last:pb-1">
                  {/* 状态只由行首图形编码，避免与行尾文字徽标重复播报；行尾只保留运行号/时间上下文 */}
                  <StatusIcon status={latest?.status || pipeline.status} className="size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <OverflowTooltip
                      text={pipeline.pipelineName}
                      className="block text-xs font-medium text-foreground"
                    />
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                      {latest ? (
                        <>
                          {latest.pipelineRunId && <span className="font-mono">#{latest.pipelineRunId}</span>}
                          {latest.startTime && <span>{formatDateTime(latest.startTime)}</span>}
                        </>
                      ) : (
                        <span>暂无运行</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}