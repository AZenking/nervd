import { RefreshCwIcon } from 'lucide-react';
import { Alert, Button, Card, Chip } from '@heroui/react';
import { useApp } from '@/store/app';
import { useShallow } from 'zustand/react/shallow';
import { ciProviderLabel, ciStatusInfo, ciStatusText } from '@/lib/ci';
import { formatDateTime } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusIcon } from '@/components/status-icon';

function ciColor(
  loading: boolean,
  error: string | undefined,
  status?: string,
): 'success' | 'warning' | 'danger' | 'default' {
  if (error) return 'danger';
  if (loading) return 'warning';
  const tone = ciStatusInfo(status).tone;
  return tone === 'ok' ? 'success' : tone === 'run' ? 'warning' : tone === 'fail' ? 'danger' : 'default';
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
  const watchedRepos = settings?.watchedRepos ?? [];
  const errors = watchedRepos.filter((repoId) => repoCiByRepo[repoId]?.error);

  return (
    <Card>
      <Card.Header className="flex flex-row items-center justify-between gap-3 pb-0">
        <div>
          <Card.Title className="text-[13px] font-semibold tracking-tight text-foreground">重点仓库 CI</Card.Title>
          <Card.Description className="mt-1 text-[11px]">按仓库展示最近一次 CI 状态，保留查询上下文。</Card.Description>
        </div>
        <Chip size="sm" variant="soft" color="default">
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
          <div className="py-8 text-center text-xs text-muted-foreground">未配置重点仓库</div>
        ) : (
          <ul className="divide-y divide-border/60" aria-label="重点仓库 CI 状态列表">
            {watchedRepos.map((repoId) => {
              const entry = repoCiByRepo[repoId];
              const snapshot = entry?.snapshot;
              const latest = snapshot?.runs?.[0];
              const rawStatus = snapshot?.status || latest?.status;
              const binding = settings?.repoCiBindings?.[String(repoId)];
              const isUnbound = !binding;
              const repo = repositories.find((item) => item.id === repoId);
              const name = repo?.pathWithNamespace || repo?.name || `仓库 #${repoId}`;
              const status = isUnbound
                ? '未绑定 CI'
                : entry?.error
                ? '查询失败'
                : entry?.loading
                  ? '加载中'
                  : snapshot
                    ? ciStatusText(rawStatus)
                    : '暂无运行';

              return (
                <li key={repoId} className="flex flex-wrap items-center gap-2.5 py-3 first:pt-1 last:pb-1">
                  <StatusIcon status={isUnbound ? 'OTHER' : entry?.error ? 'FAIL' : rawStatus} className="size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-medium text-foreground">{name}</span>
                      <Chip size="sm" variant="soft" color={isUnbound ? 'default' : ciColor(Boolean(entry?.loading), entry?.error, rawStatus)}>
                        {status}
                      </Chip>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                      <span>{ciProviderLabel(settings?.repoCiBindings?.[String(repoId)])}</span>
                      {snapshot?.name && <span>{snapshot.name}</span>}
                      {latest?.runId && <span className="font-mono">#{latest.runId}</span>}
                      {latest?.startTime && <span>{formatDateTime(latest.startTime)}</span>}
                    </div>
                  </div>
                  {(entry?.error || !snapshot) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`重试 ${name} CI 查询`}
                      onPress={() => void loadRepoCi(repoId)}
                      className="h-6 gap-1 px-1.5 text-[11px]"
                    >
                      <RefreshCwIcon className="size-3" />
                      重试
                    </Button>
                  )}
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
        <Chip size="sm" variant="soft" color="default">
          {pipelines.length} 条流水线
        </Chip>
      </Card.Header>
      <Card.Content>
        {loadingPipelines ? (
          <div className="py-8 text-center text-xs text-muted-foreground">正在加载流水线…</div>
        ) : pipelines.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">暂无组织级 Flow 运行数据</div>
        ) : (
          <ul className="divide-y divide-border/60" aria-label="组织级 Flow 状态列表">
            {pipelines.map((pipeline) => {
              const latest = runsByPipeline[pipeline.pipelineId]?.[0];
              return (
                <li key={pipeline.pipelineId} className="flex items-center gap-2.5 py-3 first:pt-1 last:pb-1">
                  <StatusIcon status={latest?.status || pipeline.status} className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{pipeline.pipelineName}</span>
                  {latest ? (
                    <StatusBadge status={latest.status} size="sm" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">暂无运行</span>
                  )}
                  {latest?.pipelineRunId && <span className="font-mono text-[11px] text-muted-foreground">#{latest.pipelineRunId}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
