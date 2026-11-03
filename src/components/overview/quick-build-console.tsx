import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDownIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GitBranchIcon,
  Loader2Icon,
  PlayIcon,
  RadioIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
  WorkflowIcon,
  ZapIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useShallow } from 'zustand/react/shallow';
import {
  extractConfiguredBuildTargets,
  useQuickBuild,
  type QuickBuildTarget,
} from '@/store/quick-build';
import {
  getCachedJenkinsJobParameters,
  getCachedJenkinsJobs,
  hasCachedJobs,
} from '@/lib/jenkins-cache';
import { isBranchParameterName, isEnvironmentParameterName } from '@/lib/ci';
import { statusMeta } from '@/components/StatusBadge';
import { StatusIcon } from '@/components/status-icon';
import { openRepoBuildLogs, openPipelineRunLogs } from '@/components/build-workbench';
import { openExternal } from '@/lib/yunxiao-link';
import type { JenkinsJobParameter, JenkinsJobSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/searchable-select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BuildProgressBar } from './build-progress-bar';

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
  externalUrl?: string | null;
}

export function QuickBuildConsole() {
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

  const history = useQuickBuild((s) => s.history);
  const triggeringId = useQuickBuild((s) => s.triggeringId);
  const triggerQuickBuild = useQuickBuild((s) => s.triggerQuickBuild);

  // ==========================================
  // 1. 活跃构建监听（合并原 ActiveBuildsBar，带方案 B 历史耗时预估）
  // ==========================================
  const activeBuilds = useMemo(() => {
    const list: ActiveBuildItem[] = [];

    // 1.1 扫描仓库 CI 快照（特别是 Jenkins 与 Flow）
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

        // 方案 B：寻找历史最近一次成功运行的时长作为估算基准
        const prevSuccess = snapshot.runs
          ?.slice(1)
          .find((r) => r.status === 'SUCCESS' && typeof r.durationMs === 'number' && r.durationMs > 0);
        const estimatedDurationMs = prevSuccess?.durationMs ?? null;

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
          externalUrl,
        });
      }
    }

    // 1.2 扫描云效 Flow 流水线
    for (const p of pipelines) {
      const pRuns = runsByPipeline[p.pipelineId] ?? [];
      const latest = pRuns[0];
      if (latest && statusMeta(latest.status).tone === 'run') {
        const prevSuccess = pRuns.slice(1).find(
          (r) => (r.status === 'SUCCESS' || r.status === 'ok') && typeof r.startTime === 'number' && typeof (r as any).endTime === 'number',
        );
        const estimatedDurationMs = prevSuccess
          ? Math.max(0, (prevSuccess as any).endTime - (prevSuccess.startTime || 0))
          : null;

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
        });
      }
    }

    return list;
  }, [repoCiByRepo, repositories, settings, pipelines, runsByPipeline]);

  const handleOpenLogs = (item: ActiveBuildItem) => {
    if (item.kind === 'repo' && item.repoId) {
      openRepoBuildLogs(item.repoId, item.runId, `${item.title} · ${item.subTitle ?? ''} #${item.runId}`);
    } else if (item.kind === 'pipeline' && item.pipelineId) {
      void openPipelineRunLogs(item.pipelineId, Number(item.runId), item.title);
    }
  };

  // ==========================================
  // 2. 构建目标与自由选择 Job 入口
  // ==========================================
  const configuredTargets = useMemo(
    () => extractConfiguredBuildTargets(settings, repositories),
    [settings, repositories],
  );

  const [selectedTargetId, setSelectedTargetId] = useState<string>('');

  // 基础目标解析
  const baseTarget = useMemo(() => {
    if (selectedTargetId) {
      const foundInHistory = history.find((h) => h.id === selectedTargetId);
      if (foundInHistory) return foundInHistory;
      const foundInConfig = configuredTargets.find((c) => c.id === selectedTargetId);
      if (foundInConfig) return foundInConfig;
    }
    return history[0] || configuredTargets[0] || null;
  }, [selectedTargetId, history, configuredTargets]);

  useEffect(() => {
    if (!selectedTargetId && baseTarget) {
      setSelectedTargetId(baseTarget.id);
    }
  }, [baseTarget, selectedTargetId]);

  // Job 列表状态与自由切换
  const [selectedJobFullName, setSelectedJobFullName] = useState<string>('');
  const [availableJobs, setAvailableJobs] = useState<JenkinsJobSummary[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsRefreshCount, setJobsRefreshCount] = useState(0);

  // 当基础目标发生变化时，默认采用其自带的 Job
  useEffect(() => {
    if (baseTarget?.jobFullName) {
      setSelectedJobFullName(baseTarget.jobFullName);
    } else {
      setSelectedJobFullName('');
    }
  }, [baseTarget?.id]);

  // 异步获取当前 Jenkins 实例下的全量 Job 列表供自由选择
  useEffect(() => {
    if (baseTarget?.type === 'jenkins' && baseTarget.connectionId) {
      let active = true;
      const isManual = jobsRefreshCount > 0;
      if (!hasCachedJobs(baseTarget.connectionId) || isManual) {
        setLoadingJobs(true);
      }
      void getCachedJenkinsJobs(baseTarget.connectionId, {
        force: isManual,
        onStaleUpdate: (freshJobs) => {
          if (active) setAvailableJobs(freshJobs);
        },
      })
        .then(({ jobs: fetched }) => {
          if (active) setAvailableJobs(fetched);
        })
        .catch(() => {
          if (active) setAvailableJobs([]);
        })
        .finally(() => {
          if (active) setLoadingJobs(false);
        });
      return () => {
        active = false;
      };
    } else {
      setAvailableJobs([]);
    }
  }, [baseTarget?.connectionId, jobsRefreshCount]);

  // 合成当前的生效目标（若用户切换了 Job，动态覆盖）
  const currentTarget = useMemo<QuickBuildTarget | null>(() => {
    if (!baseTarget) return null;
    if (baseTarget.type === 'jenkins' && selectedJobFullName && selectedJobFullName !== baseTarget.jobFullName) {
      return {
        ...baseTarget,
        id: `jenkins:${baseTarget.repoId}:${baseTarget.connectionId}:${selectedJobFullName}`,
        jobFullName: selectedJobFullName,
        pipelineName: selectedJobFullName,
      };
    }
    return baseTarget;
  }, [baseTarget, selectedJobFullName]);

  // ==========================================
  // 3. 自定义参数配置与动态表单
  // ==========================================
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (currentTarget) {
      setParams(currentTarget.parameters || {});
    }
  }, [currentTarget?.id]);

  const [jobParams, setJobParams] = useState<JenkinsJobParameter[]>([]);
  const [loadingParams, setLoadingParams] = useState(false);

  useEffect(() => {
    if (currentTarget?.type === 'jenkins' && currentTarget.connectionId && currentTarget.jobFullName) {
      let canceled = false;
      setLoadingParams(true);
      void getCachedJenkinsJobParameters(currentTarget.connectionId, currentTarget.jobFullName)
        .then((fetched) => {
          if (!canceled) {
            setJobParams(fetched);
            setParams((prev) => {
              const next = { ...prev };
              for (const p of fetched) {
                if (next[p.name] === undefined && p.defaultValue !== undefined) {
                  next[p.name] = p.defaultValue;
                }
              }
              return next;
            });
          }
        })
        .catch(() => {
          if (!canceled) setJobParams([]);
        })
        .finally(() => {
          if (!canceled) setLoadingParams(false);
        });
      return () => {
        canceled = true;
      };
    } else {
      setJobParams([]);
    }
  }, [currentTarget?.id, currentTarget?.connectionId, currentTarget?.jobFullName]);

  // 仓库远端分支选项
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    if (currentTarget?.repoId) {
      let canceled = false;
      setLoadingBranches(true);
      void api
        .listBranches(currentTarget.repoId)
        .then((res) => {
          if (!canceled) {
            const list = Array.isArray(res) ? res : (res as any)?.branches || [];
            setBranchOptions(list.map((b: any) => (typeof b === 'string' ? b : b?.name)).filter(Boolean));
          }
        })
        .catch(() => {
          if (!canceled) setBranchOptions([]);
        })
        .finally(() => {
          if (!canceled) setLoadingBranches(false);
        });
      return () => {
        canceled = true;
      };
    } else {
      setBranchOptions([]);
    }
  }, [currentTarget?.repoId]);

  const branchParamName = useMemo(() => {
    if (!currentTarget) return null;
    if (currentTarget.branchParameter) return currentTarget.branchParameter;
    const found = jobParams.find((p) => isBranchParameterName(p.name));
    return found ? found.name : 'branch';
  }, [currentTarget, jobParams]);

  const envParam = useMemo(() => {
    if (!currentTarget) return null;
    if (currentTarget.environmentParameter) {
      return jobParams.find((p) => p.name === currentTarget.environmentParameter) || null;
    }
    return jobParams.find((p) => isEnvironmentParameterName(p.name)) || null;
  }, [currentTarget, jobParams]);

  const otherParams = useMemo(() => {
    return jobParams.filter((p) => p.name !== branchParamName && p.name !== envParam?.name);
  }, [jobParams, branchParamName, envParam]);

  const handleTriggerCurrent = async () => {
    if (!currentTarget) return;
    await triggerQuickBuild(currentTarget, params);
  };

  const isTriggering = triggeringId === currentTarget?.id;

  // 如果无活跃任务且无任何可构建配置，不显示空壳
  if (!currentTarget && configuredTargets.length === 0 && history.length === 0 && activeBuilds.length === 0) {
    return null;
  }

  return (
    <section
      data-testid="quick-build-console"
      aria-label="CI/CD 构建工作台"
      className="flex flex-col gap-3.5 rounded-xl border border-hairline bg-surface/50 p-4 shadow-xs backdrop-blur-xs transition-colors"
    >
      {/* 头部：标题与活跃状态徽标 + 目标与 Job 切换器 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
            <ZapIcon className="size-3.5 fill-current" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-foreground tracking-tight">
              快捷构建控制台
            </h3>
            {activeBuilds.length > 0 ? (
              <div className="flex items-center gap-1.5 rounded-full bg-sig-run/15 px-2 py-0.5 text-[10px] font-medium text-sig-run border border-sig-run/30">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sig-run opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-sig-run" />
                </span>
                <span>活跃构建中 ({activeBuilds.length})</span>
                <RadioIcon className="size-2.5 ml-0.5 animate-pulse" />
              </div>
            ) : (
              <span className="text-[11px] font-normal text-muted-foreground hidden sm:inline">
                就地选择任务、调参并即时触发
              </span>
            )}
          </div>
        </div>

        {/* 目标项目与自由选择 Job 入口 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. 目标代码仓库 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground shrink-0">项目:</span>
            <SearchableSelect
              className="w-44 text-xs h-7"
              ariaLabel="选择构建目标代码仓库"
              value={baseTarget?.id || ''}
              onValueChange={(val) => {
                if (val) setSelectedTargetId(val);
              }}
              items={configuredTargets.map((t) => ({
                label: `${t.repoName}`,
                value: t.id,
              }))}
            />
          </div>

          {/* 2. 自由选择具体 Job（关键新增能力） */}
          {baseTarget?.type === 'jenkins' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground shrink-0">任务(Job):</span>
              {loadingParams && <Loader2Icon className="size-3 animate-spin text-muted-foreground shrink-0" />}
              <div className="flex items-center gap-1">
                <SearchableSelect
                  className="w-48 text-xs h-7"
                  ariaLabel="选择该 Jenkins 实例下的具体 Job 任务"
                  value={selectedJobFullName || baseTarget.jobFullName || ''}
                  onValueChange={(val) => {
                    if (val) setSelectedJobFullName(val);
                  }}
                  items={
                    availableJobs.length > 0
                      ? availableJobs.map((j) => ({
                          label: j.fullName || j.name,
                          value: j.fullName || j.name,
                        }))
                      : [
                          {
                            label: baseTarget.jobFullName || '默认 Job',
                            value: baseTarget.jobFullName || '',
                          },
                        ]
                  }
                  placeholder={loadingJobs ? '加载 Job 列表中…' : '选择或搜索任务'}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-7 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => setJobsRefreshCount((c) => c + 1)}
                  title="刷新 Jenkins Job 列表"
                  aria-label="刷新 Jenkins Job 列表"
                >
                  <RefreshCwIcon className={cn('size-3', loadingJobs && 'animate-spin')} />
                </Button>
              </div>
            </div>
          )}

          {baseTarget?.type === 'flow' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground shrink-0">流水线:</span>
              <SearchableSelect
                className="w-48 text-xs h-7"
                ariaLabel="选择云效 Flow 流水线"
                value={baseTarget.pipelineName}
                onValueChange={(val) => {
                  const found = pipelines.find((p) => p.pipelineName === val);
                  if (found) {
                    setSelectedTargetId(`flow:${found.pipelineId}`);
                  }
                }}
                items={pipelines.map((p) => ({
                  label: p.pipelineName,
                  value: p.pipelineName,
                }))}
              />
            </div>
          )}
        </div>
      </div>

      {/* ==========================================
          内置活跃构建监控区域 (方案 B 预估进度条 + 就地盯盘)
          ========================================== */}
      {activeBuilds.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-sig-run/30 bg-sig-run/5 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-foreground pb-1">
            <span className="flex items-center gap-1.5">
              <StatusIcon status="RUNNING" className="size-3.5" />
              <span>正在执行的任务</span>
            </span>
            <span className="text-[11px] font-mono text-muted-foreground">4s 高频动态轮询中</span>
          </div>

          <div className="flex flex-col divide-y divide-sig-run/15">
            {activeBuilds.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 py-2.5 first:pt-1 last:pb-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.2 text-[10px] font-medium tracking-wide uppercase',
                        item.provider === 'Jenkins'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                          : 'bg-primary/15 text-primary border border-primary/30',
                      )}
                    >
                      {item.provider}
                    </span>
                    <span className="font-medium text-foreground truncate max-w-56">{item.title}</span>
                    {item.subTitle && (
                      <span className="text-muted-foreground truncate text-[11px]">· {item.subTitle}</span>
                    )}
                    <span className="font-mono text-foreground font-semibold">#{item.runId}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
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

                {/* 方案 B：进度条组件呈现 */}
                <BuildProgressBar
                  startTime={item.startTime}
                  estimatedDurationMs={item.estimatedDurationMs}
                  compact
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. 最近执行标签快速选卡 */}
      {history.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 pr-1">
            <ClockIcon className="size-3" />
            <span>最近执行:</span>
          </div>
          {history.slice(0, 4).map((record) => {
            const isSelected = record.id === currentTarget?.id;
            const branchText =
              record.parameters?.branch ||
              record.parameters?.BRANCH ||
              record.parameters?.ref ||
              '';

            return (
              <div
                key={record.id}
                onClick={() => {
                  setSelectedTargetId(record.id);
                  if (record.jobFullName) {
                    setSelectedJobFullName(record.jobFullName);
                  }
                }}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-xs transition-all select-none',
                  isSelected
                    ? 'border-primary/50 bg-primary/10 text-foreground font-medium shadow-xs'
                    : 'border-hairline bg-surface/60 text-muted-foreground hover:border-border hover:bg-surface hover:text-foreground',
                )}
              >
                {record.type === 'flow' ? (
                  <WorkflowIcon className="size-3 text-primary shrink-0" />
                ) : (
                  <TerminalIcon className="size-3 text-amber-500 shrink-0" />
                )}
                <span className="truncate max-w-[110px]">{record.repoName}</span>
                {record.jobFullName && (
                  <span className="truncate max-w-[90px] text-[10px] text-muted-foreground/80">
                    {record.jobFullName}
                  </span>
                )}
                {branchText && (
                  <span className="text-[10px] font-mono opacity-70 truncate max-w-[80px]">
                    {branchText}
                  </span>
                )}
                <Tooltip>
                  <TooltipTrigger
                    disabled={triggeringId === record.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void triggerQuickBuild(record);
                    }}
                    className={cn(
                      'flex items-center justify-center size-4 rounded hover:bg-emerald-500/20 text-emerald-500 transition-colors',
                      triggeringId === record.id && 'animate-spin',
                    )}
                    aria-label={`重跑 ${record.repoName} 构建`}
                  >
                    <PlayIcon className="size-2 fill-current" />
                  </TooltipTrigger>
                  <TooltipContent side="top">按上次参数立即重跑</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. 就地自定义参数配置行 */}
      {currentTarget && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-muted/20 border border-hairline/40 rounded-lg p-3">
          {/* 构建分支参数 */}
          <div className="flex flex-col gap-1 sm:col-span-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <GitBranchIcon className="size-3 text-primary" />
                <span>构建分支 ({branchParamName || 'branch'})</span>
              </span>
              <span className="text-[10px] text-muted-foreground/70">支持输入或选择分支</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={params[branchParamName || 'branch'] ?? params['BRANCH'] ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setParams((prev) => ({
                    ...prev,
                    [branchParamName || 'branch']: val,
                    ...(prev['BRANCH'] !== undefined ? { BRANCH: val } : {}),
                  }));
                }}
                placeholder="填写构建分支（如 master、feature/xxx）"
                className="font-mono text-xs h-7 flex-1"
              />
              {loadingBranches ? (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground px-2 h-7 border border-hairline/60 rounded-md bg-muted/30 shrink-0">
                  <Loader2Icon className="size-3 animate-spin" />
                  <span>分支…</span>
                </div>
              ) : branchOptions.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 gap-1 px-2 text-xs"
                      />
                    }
                  >
                    <span>远端分支</span>
                    <ChevronDownIcon className="size-3 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 max-h-60 overflow-y-auto z-50">
                    {branchOptions.map((b) => (
                      <DropdownMenuItem
                        key={b}
                        onClick={() => {
                          setParams((prev) => ({
                            ...prev,
                            [branchParamName || 'branch']: b,
                            ...(prev['BRANCH'] !== undefined ? { BRANCH: b } : {}),
                          }));
                        }}
                        className="font-mono text-xs"
                      >
                        {b}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          {/* 部署环境参数（若有） */}
          {envParam && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                部署环境 ({envParam.name})
              </label>
              <SearchableSelect
                className="text-xs h-7"
                ariaLabel="选择部署环境"
                value={params[envParam.name] || envParam.defaultValue || ''}
                onValueChange={(val) => {
                  setParams((prev) => ({ ...prev, [envParam.name]: val ?? '' }));
                }}
                items={envParam.choices.map((c) => ({
                  label: c,
                  value: c,
                }))}
              />
            </div>
          )}

          {/* 触发操作按钮 */}
          <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-1 ml-auto w-full sm:w-auto">
            <Button
              type="button"
              size="sm"
              disabled={isTriggering}
              onClick={() => void handleTriggerCurrent()}
              className="h-7 w-full sm:w-auto px-4 gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-transform active:scale-95"
            >
              {isTriggering ? (
                <>
                  <RefreshCwIcon className="size-3.5 animate-spin" />
                  <span>正在触发…</span>
                </>
              ) : (
                <>
                  <PlayIcon className="size-3 fill-current" />
                  <span>立即发起构建</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* 5. 更多参数微调折叠项 */}
      {otherParams.length > 0 && (
        <details className="text-xs text-muted-foreground group">
          <summary className="cursor-pointer select-none py-1 hover:text-foreground flex items-center gap-1.5 font-medium text-[11px]">
            <SlidersHorizontalIcon className="size-3" />
            <span>更多参数配置 ({otherParams.length} 个参数)</span>
          </summary>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2.5 rounded-lg border border-hairline/60 bg-muted/10">
            {otherParams.map((p) => (
              <div key={p.name} className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-muted-foreground truncate">
                  {p.name}
                </span>
                {p.choices && p.choices.length > 0 ? (
                  <SearchableSelect
                    className="text-xs h-6.5"
                    ariaLabel={p.name}
                    value={params[p.name] ?? p.defaultValue ?? ''}
                    onValueChange={(val) => setParams((prev) => ({ ...prev, [p.name]: val ?? '' }))}
                    items={p.choices.map((c) => ({ label: c, value: c }))}
                  />
                ) : (
                  <Input
                    value={params[p.name] ?? p.defaultValue ?? ''}
                    onChange={(e) => setParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                    className="text-xs font-mono h-6.5"
                  />
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
