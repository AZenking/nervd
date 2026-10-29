import { FileTextIcon, ExternalLinkIcon, RadioIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import { useShallow } from 'zustand/react/shallow';
import { statusMeta } from '@/components/StatusBadge';
import { StatusIcon } from '@/components/status-icon';
import { Button } from '@/components/ui/button';
import { useElapsedTime } from '@/hooks/use-elapsed-time';
import { openRepoBuildLogs, openPipelineRunLogs } from '@/components/build-workbench';
import { cn } from '@/lib/utils';
import { openExternal } from '@/lib/yunxiao-link';

export interface ActiveBuildItem {
  id: string;
  kind: 'repo' | 'pipeline';
  provider: 'Jenkins' | '云效 Flow';
  title: string;
  subTitle?: string;
  runId: string;
  startTime?: number | null;
  repoId?: number;
  pipelineId?: number;
  externalUrl?: string | null;
}

function ElapsedTimeBadge({ startTime }: { startTime?: number | null }) {
  const elapsed = useElapsedTime(startTime, true);
  return (
    <span className="flex items-center gap-1 font-mono text-xs tabular-nums text-sig-run">
      <span>已运行</span>
      <span className="font-semibold">{elapsed}</span>
    </span>
  );
}

export function ActiveBuildsBar({ className }: { className?: string }) {
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

  // 1. 扫描所有监控仓库的 CI 快照（特别是绑定的 Jenkins 或 Flow）
  const repoBuilds: ActiveBuildItem[] = [];
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

      // 构建 Jenkins 外部链接
      let externalUrl: string | null = null;
      if (isJenkins) {
        const binding = settings?.repoCiBindings?.[String(repoId)];
        if (binding && binding.provider === 'jenkins') {
          const conn = settings?.jenkinsConnections?.find((c) => c.id === binding.connectionId);
          if (conn?.baseUrl && binding.jobFullName) {
            const trimmed = conn.baseUrl.replace(/\/+$/, '');
            const parts = binding.jobFullName.split('/').filter(Boolean).map(encodeURIComponent);
            externalUrl = `${trimmed}/job/${parts.join('/job/')}/${runId}`;
          }
        }
      }

      repoBuilds.push({
        id: `repo-${repoId}-${runId}`,
        kind: 'repo',
        provider,
        title: repoName,
        subTitle: snapshot.name,
        runId,
        startTime: latestRun?.startTime,
        repoId,
        externalUrl,
      });
    }
  }

  // 2. 扫描云效 Flow 流水线运行
  const flowBuilds: ActiveBuildItem[] = [];
  for (const p of pipelines) {
    const latest = (runsByPipeline[p.pipelineId] ?? [])[0];
    if (latest && statusMeta(latest.status).tone === 'run') {
      flowBuilds.push({
        id: `pipeline-${p.pipelineId}-${latest.pipelineRunId}`,
        kind: 'pipeline',
        provider: '云效 Flow',
        title: p.pipelineName,
        runId: String(latest.pipelineRunId),
        startTime: latest.startTime,
        pipelineId: p.pipelineId,
        externalUrl: `https://flow.aliyun.com/pipelines/${p.pipelineId}/current`,
      });
    }
  }

  const activeBuilds = [...repoBuilds, ...flowBuilds];

  // 核心原则：无活跃执行任务时完全隐去，保持画布极致简洁
  if (activeBuilds.length === 0) {
    return null;
  }

  const handleOpenLogs = (item: ActiveBuildItem) => {
    if (item.kind === 'repo' && item.repoId) {
      openRepoBuildLogs(item.repoId, item.runId, `${item.title} · ${item.subTitle ?? ''} #${item.runId}`);
    } else if (item.kind === 'pipeline' && item.pipelineId) {
      void openPipelineRunLogs(item.pipelineId, Number(item.runId), item.title);
    }
  };

  return (
    <section
      aria-label="实时活跃构建监控"
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-sig-run/40 bg-sig-run/8 p-3.5 transition-all sm:p-4 animate-in fade-in-50 duration-200',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-sig-run/20 pb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sig-run opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-sig-run" />
          </span>
          <span>活跃构建中</span>
          <span className="font-mono text-sig-run font-semibold">({activeBuilds.length})</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RadioIcon className="size-3 text-sig-run animate-pulse" />
          <span>4s 自适应高频轮询</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        {activeBuilds.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-card/90 px-3 py-2 text-xs shadow-xs"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <StatusIcon status="RUNNING" className="size-3.5 shrink-0" />

              <span
                className={cn(
                  'rounded px-1.5 py-0.2 text-[10px] font-medium uppercase tracking-wider',
                  item.provider === 'Jenkins'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-primary/15 text-primary border border-primary/30',
                )}
              >
                {item.provider}
              </span>

              <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                <span className="font-medium text-foreground truncate">{item.title}</span>
                {item.subTitle && (
                  <span className="text-muted-foreground truncate text-[11px]">· {item.subTitle}</span>
                )}
                <span className="font-mono font-medium text-foreground">#{item.runId}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <ElapsedTimeBadge startTime={item.startTime} />

              <Button
                variant="outline"
                size="xs"
                onClick={() => handleOpenLogs(item)}
                className="h-6 gap-1 px-2 text-[11px] hover:bg-muted"
              >
                <FileTextIcon className="size-3 text-muted-foreground" />
                <span>就地盯盘</span>
              </Button>

              {item.externalUrl && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => openExternal(item.externalUrl!)}
                  title="在外部打开构建详情"
                  aria-label="在外部打开构建详情"
                  className="size-6 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLinkIcon className="size-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
