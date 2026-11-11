import { useEffect, useMemo } from 'react';
import { Button, Card, Chip, Table } from '@heroui/react';
import { ExternalLinkIcon, FileTextIcon, GitBranchIcon, XIcon } from 'lucide-react';
import { StatusIcon } from '@/components/status-icon';
import { statusMeta } from '@/components/StatusBadge';
import { openRepoBuildLogs, openPipelineRunLogs } from '@/components/build-workbench';
import { openExternal } from '@/lib/yunxiao-link';
import { ciStatusInfo } from '@/lib/ci';
import { useApp } from '@/store/app';
import { useQuickBuild, type BuildState } from '@/store/quick-build';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { BuildProgressBar } from './build-progress-bar';
import {
  getEstimateKey,
  getCachedEstimate,
  setCachedEstimate,
  fetchJobEstimate,
} from '@/lib/build-estimate';

export interface ActiveBuildItem {
  id: string;
  kind: 'repo' | 'pipeline';
  provider: 'Jenkins' | '云效 Flow';
  title: string;
  subTitle?: string;
  runId: string;
  startTime?: number | null;
  estimatedDurationMs?: number | null;
  repoId?: number;
  pipelineId?: number;
  connectionId?: string;
  jobFullName?: string;
  externalUrl?: string | null;
  state?: BuildState;
  queueId?: string;
  queueTimeout?: boolean;
  statusText?: string;
  branch?: string;
  environment?: string;
  isTracked?: boolean;
}

/** 从历史 runs 中检索上一条成功构建的执行时长 (ms) 作为进度估算基准 */
export function findPrevSuccessDurationMs(
  runs: Array<{
    status?: string | null;
    durationMs?: number | null;
    startTime?: number | null;
    endTime?: number | null;
    runId?: string | number | null;
    pipelineRunId?: string | number | null;
  }>,
  currentRunId?: string | number | null,
): number | null {
  for (const r of runs) {
    if (!r) continue;
    const itemRunId = r.runId ?? r.pipelineRunId;
    if (currentRunId && itemRunId && String(itemRunId) === String(currentRunId)) {
      continue;
    }
    if (statusMeta(r.status).tone === 'run') {
      continue;
    }
    if (ciStatusInfo(r.status).tone === 'ok') {
      if (typeof r.durationMs === 'number' && r.durationMs > 0) {
        return r.durationMs;
      }
      if (typeof r.startTime === 'number' && typeof r.endTime === 'number' && r.endTime > r.startTime) {
        return r.endTime - r.startTime;
      }
    }
  }
  return null;
}

export function useActiveBuildItems(): ActiveBuildItem[] {
  const {
    settings,
    repositories,
    repoCiByRepo,
    pipelines,
    runsByPipeline,
  } = useApp(
    useShallow((s) => ({
      settings: s.settings,
      repositories: s.repositories,
      repoCiByRepo: s.repoCiByRepo,
      pipelines: s.pipelines,
      runsByPipeline: s.runsByPipeline,
    })),
  );

  const trackedBuilds = useQuickBuild((s) => s.trackedBuilds);

  return useMemo(() => {
    const list: ActiveBuildItem[] = [];
    const seenTargetKeys = new Set<string>();
    const seenFlowPipelineIds = new Set<number>();
    const seenFlowNames = new Set<string>();

    // 1. 本地跟踪的构建（包含排队中、运行中及最近完成的构建）
    const now = Date.now();
    for (const tracked of trackedBuilds) {
      // 终态构建展示 60 秒后自动从活跃列表淡出，但允许手动关闭
      if (
        (tracked.state === 'success' || tracked.state === 'fail' || tracked.state === 'canceled') &&
        tracked.completedAt &&
        now - tracked.completedAt > 60_000
      ) {
        continue;
      }

      const isJenkins = tracked.target.type === 'jenkins';
      const key = tracked.target.targetKey || tracked.target.id;
      seenTargetKeys.add(key);

      // 计算历史基准时长（多级阶梯）：
      // 1. 本地跟踪记录中已有的预估时长
      // 2. 本地持久化与内存估算缓存（支持同 Job 跨会话即时复用）
      // 3. 对应 repo 快照或 flow 历史 runs
      const estimateKey = getEstimateKey(tracked.target);
      let estimatedDurationMs: number | null =
        tracked.estimatedDurationMs ??
        getCachedEstimate(estimateKey) ??
        null;

      if (!estimatedDurationMs) {
        if (isJenkins && tracked.target.repoId) {
          const repoRuns = repoCiByRepo[tracked.target.repoId]?.snapshot?.runs ?? [];
          estimatedDurationMs = findPrevSuccessDurationMs(repoRuns, tracked.runId);
        } else if (!isJenkins) {
          const pId = tracked.target.pipelineId;
          const pRuns = pId ? (runsByPipeline[pId] ?? []) : [];
          estimatedDurationMs = findPrevSuccessDurationMs(pRuns, tracked.runId);
          if (!estimatedDurationMs && tracked.target.repoId) {
            const repoRuns = repoCiByRepo[tracked.target.repoId]?.snapshot?.runs ?? [];
            estimatedDurationMs = findPrevSuccessDurationMs(repoRuns, tracked.runId);
          }
        }
      }

      if (estimatedDurationMs && estimateKey) {
        setCachedEstimate(estimateKey, estimatedDurationMs);
      }

      list.push({
        id: tracked.id,
        kind: isJenkins ? 'repo' : 'pipeline',
        provider: isJenkins ? 'Jenkins' : '云效 Flow',
        title: tracked.target.repoName,
        subTitle: tracked.target.pipelineName || tracked.target.jobFullName,
        runId: tracked.runId || (tracked.queueId ? `队列 #${tracked.queueId}` : '排队中'),
        startTime: tracked.startedAt || tracked.submittedAt,
        estimatedDurationMs,
        repoId: tracked.target.repoId,
        pipelineId: tracked.target.pipelineId,
        connectionId: tracked.target.connectionId,
        jobFullName: tracked.target.jobFullName,
        externalUrl: tracked.webUrl,
        state: tracked.state,
        queueId: tracked.queueId,
        queueTimeout: tracked.queueTimeout,
        statusText: tracked.statusText,
        branch: tracked.branch,
        environment: tracked.environment,
        isTracked: true,
      });
    }

    // 2. 扫描仓库 CI 快照（特别是 Jenkins 与 Flow）
    for (const [repoIdStr, entry] of Object.entries(repoCiByRepo)) {
      const repoId = Number(repoIdStr);
      const snapshot = entry?.snapshot;
      if (!snapshot) continue;

      const latestRun = snapshot.runs?.[0];
      const status = snapshot.status || latestRun?.status;
      if (statusMeta(status).tone === 'run') {
        const repo = repositories.find((r) => r.id === repoId);
        const repoName = repo?.pathWithNamespace || repo?.name || `仓库 #${repoId}`;
        const isJenkins = snapshot.provider?.toUpperCase() === 'JENKINS';
        const provider = isJenkins ? 'Jenkins' : '云效 Flow';
        const runId = latestRun?.runId ? String(latestRun.runId) : '最新';

        const binding = settings?.repoCiBindings?.[String(repoId)];
        if (!isJenkins) {
          seenFlowNames.add(snapshot.name);
          if (binding && binding.provider === 'flow') {
            seenFlowPipelineIds.add(binding.pipelineId);
          }
        }

        const targetKey = isJenkins && binding && binding.provider === 'jenkins'
          ? `jenkins:${repoId}:${binding.connectionId}:${binding.jobFullName}`
          : `flow:${repoId}:${binding && binding.provider === 'flow' ? binding.pipelineId : ''}`;

        // 若本地已有该目标的跟踪任务，避免重复展示
        if (seenTargetKeys.has(targetKey)) continue;

        let externalUrl: string | null = null;
        if (isJenkins && binding && binding.provider === 'jenkins') {
          const conn = settings?.jenkinsConnections?.find((c) => c.id === binding.connectionId);
          if (conn?.baseUrl && binding.jobFullName) {
            const trimmed = conn.baseUrl.replace(/\/+$/, '');
            const parts = binding.jobFullName.split('/').filter(Boolean).map(encodeURIComponent);
            externalUrl = `${trimmed}/job/${parts.join('/job/')}/${runId}`;
          }
        }

        const estimatedDurationMs = findPrevSuccessDurationMs(snapshot.runs ?? [], runId);

        list.push({
          id: `repo-${repoId}-${runId}`,
          kind: 'repo',
          provider,
          title: repoName,
          subTitle: snapshot.name,
          runId,
          startTime: latestRun?.startTime,
          estimatedDurationMs,
          repoId,
          connectionId: isJenkins && binding && binding.provider === 'jenkins' ? binding.connectionId : undefined,
          jobFullName: isJenkins && binding && binding.provider === 'jenkins' ? binding.jobFullName : undefined,
          externalUrl,
          state: 'running',
        });
      }
    }

    // 3. 扫描云效 Flow 流水线
    for (const p of pipelines) {
      if (seenFlowPipelineIds.has(p.pipelineId) || seenFlowNames.has(p.pipelineName)) {
        continue;
      }
      const pRuns = runsByPipeline[p.pipelineId] ?? [];
      const latest = pRuns[0];
      if (latest && statusMeta(latest.status).tone === 'run') {
        const estimatedDurationMs = findPrevSuccessDurationMs(pRuns, latest.pipelineRunId);

        list.push({
          id: `pipeline-${p.pipelineId}-${latest.pipelineRunId}`,
          kind: 'pipeline',
          provider: '云效 Flow',
          title: p.pipelineName,
          runId: String(latest.pipelineRunId),
          startTime: latest.startTime,
          estimatedDurationMs,
          pipelineId: p.pipelineId,
          externalUrl: `https://flow.aliyun.com/pipelines/${p.pipelineId}/current`,
          state: 'running',
        });
      }
    }

    return list;
  }, [trackedBuilds, repoCiByRepo, repositories, settings, pipelines, runsByPipeline]);
}

const defaultHandleOpenLogs = (item: ActiveBuildItem) => {
  if (item.connectionId && item.jobFullName) {
    openRepoBuildLogs(
      item.repoId || 0,
      item.runId,
      `${item.title} · ${item.subTitle ?? ''} #${item.runId}`,
      { connectionId: item.connectionId, jobFullName: item.jobFullName },
    );
  } else if (item.kind === 'repo' && item.repoId) {
    openRepoBuildLogs(item.repoId, item.runId, `${item.title} · ${item.subTitle ?? ''} #${item.runId}`);
  } else if (item.kind === 'pipeline' && item.pipelineId) {
    void openPipelineRunLogs(item.pipelineId, Number(item.runId), item.title);
  }
};

function buildStatePresentation(item: ActiveBuildItem): {
  isQueued: boolean;
  isSuccess: boolean;
  isFail: boolean;
  isCanceled: boolean;
} {
  const isQueued = item.state === 'queued';
  const isSuccess = item.state === 'success';
  const isFail = item.state === 'fail';
  const isCanceled = item.state === 'canceled';

  return {
    isQueued,
    isSuccess,
    isFail,
    isCanceled,
  };
}

function BuildStatusIndicator({ item }: { item: ActiveBuildItem }) {
  const { isQueued, isSuccess, isFail, isCanceled } = buildStatePresentation(item);
  const status = isQueued
    ? 'QUEUED'
    : isSuccess
    ? 'SUCCESS'
    : isFail
    ? 'FAIL'
    : isCanceled
    ? 'CANCELED'
    : 'RUNNING';

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <StatusIcon status={status} className="size-3.5 shrink-0" />
      <Chip size="sm" variant="soft" color="default" className="shrink-0">
        <Chip.Label>{item.provider}</Chip.Label>
      </Chip>
    </div>
  );
}

function BuildTargetDetails({ item }: { item: ActiveBuildItem }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="min-w-0 truncate font-medium text-foreground" title={item.title}>{item.title}</span>
        {item.subTitle && (
          <span className="min-w-0 truncate text-xs text-muted" title={item.subTitle}>· {item.subTitle}</span>
        )}
      </div>
      {(item.branch || item.environment) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {item.branch && (
            <span className="flex min-w-0 items-center gap-1 font-mono" title={item.branch}>
              <GitBranchIcon className="size-2.5 shrink-0" />
              <span className="truncate">{item.branch}</span>
            </span>
          )}
          {item.environment && (
            <Chip size="sm" variant="tertiary" color="default" className="font-mono text-[10px]" title={item.environment}>
              <Chip.Label>{item.environment}</Chip.Label>
            </Chip>
          )}
        </div>
      )}
    </div>
  );
}

function BuildProgressCell({ item }: { item: ActiveBuildItem }) {
  const { isQueued } = buildStatePresentation(item);

  if (isQueued) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5 text-xs text-muted">
        <span className={item.queueTimeout ? 'font-medium text-warning' : ''}>
          {item.statusText || '已提交 · 等待 Jenkins 执行器'}
        </span>
      </div>
    );
  }

  return (
    <BuildProgressBar
      startTime={item.startTime}
      estimatedDurationMs={item.estimatedDurationMs}
      compact
      className="min-w-0"
    />
  );
}

function BuildActions({
  item,
  onOpenLogs,
  onDismiss,
  compact = false,
}: {
  item: ActiveBuildItem;
  onOpenLogs: (item: ActiveBuildItem) => void;
  onDismiss: (id: string) => void;
  compact?: boolean;
}) {
  const { isQueued, isSuccess, isFail, isCanceled } = buildStatePresentation(item);

  return (
    <div className="flex items-center justify-end gap-1">
      {!isQueued && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onPress={() => onOpenLogs(item)}
          className={cn('gap-1', compact && 'min-w-fit')}
        >
          <FileTextIcon className="size-3" />
          <span>查看日志</span>
        </Button>
      )}

      {item.externalUrl && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          isIconOnly
          onPress={() => openExternal(item.externalUrl!)}
          aria-label="在外部打开构建详情"
          className="text-muted hover:text-foreground"
        >
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      )}

      {item.isTracked && (isSuccess || isFail || isCanceled) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          isIconOnly
          onPress={() => onDismiss(item.id)}
          aria-label="移除此记录"
          className="text-muted hover:text-foreground"
        >
          <XIcon className="size-3" />
        </Button>
      )}
    </div>
  );
}

function formatBuildRunId(runId: string) {
  return runId.startsWith('#') || runId.startsWith('队列') ? runId : `#${runId}`;
}

export interface QuickBuildActiveTableProps {
  activeBuilds: ActiveBuildItem[];
  onOpenLogs?: (item: ActiveBuildItem) => void;
}

export function QuickBuildActiveTable({
  activeBuilds,
  onOpenLogs = defaultHandleOpenLogs,
}: QuickBuildActiveTableProps) {
  const dismissTrackedBuild = useQuickBuild((s) => s.dismissTrackedBuild);

  // 当任务处于排队或运行中且尚未获取到预估时长时，自动从远端异步预查历史成功构建耗时
  useEffect(() => {
    for (const item of activeBuilds) {
      if (!item.estimatedDurationMs && item.isTracked) {
        const target = {
          type: (item.provider === 'Jenkins' ? 'jenkins' : 'flow') as 'jenkins' | 'flow',
          connectionId: item.connectionId,
          jobFullName: item.jobFullName,
          pipelineId: item.pipelineId,
          repoId: item.repoId,
        };
        void fetchJobEstimate(target, item.runId).then((dur) => {
          if (dur) {
            useQuickBuild.getState().updateTrackedEstimatedDuration(item.id, dur);
          }
        });
      }
    }
  }, [activeBuilds]);

  if (activeBuilds.length === 0) return null;

  const isSingleBuild = activeBuilds.length === 1;
  const singleBuild = activeBuilds[0];

  return (
    <Card.Content className="bg-surface-secondary/50 p-0">
      {!isSingleBuild && (
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-transparent px-4 py-2">
          <span className="text-xs font-medium text-muted">运行任务</span>
          <span className="font-mono text-xs text-muted">实时更新 · 4s</span>
        </div>
      )}

      {isSingleBuild && singleBuild ? (
        <div
          role="group"
          aria-label={`活跃构建任务：${singleBuild.title}`}
          className="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(8rem,auto)_minmax(12rem,1.35fr)_auto_minmax(14rem,0.8fr)_auto]"
        >
          <BuildStatusIndicator item={singleBuild} />
          <BuildTargetDetails item={singleBuild} />
          <span className="font-mono text-xs font-semibold text-foreground">
            {formatBuildRunId(singleBuild.runId)}
          </span>
          <BuildProgressCell item={singleBuild} />
          <BuildActions
            item={singleBuild}
            onOpenLogs={onOpenLogs}
            onDismiss={dismissTrackedBuild}
            compact
          />
        </div>
      ) : (
        <Table variant="secondary" className="w-full">
          <Table.ScrollContainer className="max-h-72 overflow-y-auto overscroll-contain">
            <Table.Content aria-label="活跃构建列表" className="text-xs">
              <Table.Header className="border-b border-border/60 bg-transparent text-xs text-muted">
                <Table.Column isRowHeader className="w-36 px-4 py-2 text-start text-xs font-medium text-muted">
                  状态 / 平台
                </Table.Column>
                <Table.Column className="px-3 py-2 text-start text-xs font-medium text-muted">
                  构建目标
                </Table.Column>
                <Table.Column className="w-24 px-3 py-2 text-start font-mono text-xs font-medium text-muted">
                  运行号
                </Table.Column>
                <Table.Column className="min-w-56 px-3 py-2 text-start text-xs font-medium text-muted">
                  运行时长 & 预估进度
                </Table.Column>
                <Table.Column className="w-32 px-4 py-2 text-end text-xs font-medium text-muted">
                  操作
                </Table.Column>
              </Table.Header>

              <Table.Body>
                {activeBuilds.map((item) => (
                  <Table.Row
                    key={item.id}
                    id={item.id}
                    className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-secondary"
                  >
                    <Table.Cell className="px-4 py-2">
                      <BuildStatusIndicator item={item} />
                    </Table.Cell>
                    <Table.Cell className="px-3 py-2 font-medium text-foreground">
                      <BuildTargetDetails item={item} />
                    </Table.Cell>
                    <Table.Cell className="px-3 py-2">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {formatBuildRunId(item.runId)}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="px-3 py-2">
                      <BuildProgressCell item={item} />
                    </Table.Cell>
                    <Table.Cell className="px-4 py-2 text-end">
                      <BuildActions
                        item={item}
                        onOpenLogs={onOpenLogs}
                        onDismiss={dismissTrackedBuild}
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}
    </Card.Content>
  );
}
