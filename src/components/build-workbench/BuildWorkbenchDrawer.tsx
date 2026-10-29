import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  GitBranchIcon,
  Link2Icon,
  RefreshCwIcon,
  TerminalIcon,
  WorkflowIcon,
  XIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useUi, type BuildWorkbenchTarget } from '@/store/ui';
import type { CiRunSummary, RepoSummary } from '@/types';
import { buildRunParameter, ciProviderLabel, ciStatusText } from '@/lib/ci';
import { errorLog, humanizeError } from '@/lib/error-format';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Descriptions } from '@/components/ui/descriptions';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { WriteOpButton, WriteOpGatedTrigger } from '@/components/WriteOpButton';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { JenkinsBuildParameters } from '@/components/iteration/JenkinsBuildDialog';
import { LogViewerContent } from '@/components/LogViewer';
import {
  openBuildWorkbenchFromTrigger,
  openPipelineRunLogs,
  openRepoBuildLogs,
  restoreBuildWorkbenchFocus,
} from './actions';

function targetKey(target: BuildWorkbenchTarget | null): string {
  if (!target) return 'none';
  return target.kind === 'repo'
    ? `repo:${target.repoId}`
    : `pipeline:${target.pipelineId}`;
}

function targetWithoutRun(target: BuildWorkbenchTarget): BuildWorkbenchTarget {
  if (target.kind === 'repo') {
    return {
      kind: 'repo',
      repoId: target.repoId,
      title: target.title,
      defaultBranch: target.defaultBranch,
    };
  }
  return { kind: 'pipeline', pipelineId: target.pipelineId, title: target.title };
}

export function BuildWorkbenchTrigger({
  target,
  label,
  title,
  variant = 'default',
}: {
  target: BuildWorkbenchTarget;
  label: string;
  title?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
}) {
  const allowWriteOps = useApp((state) => state.settings?.allowWriteOps ?? false);
  const open = () => openBuildWorkbenchFromTrigger(target, 'parameters');

  return (
    <>
      <WriteOpGatedTrigger
        label={label}
        icon={<WorkflowIcon data-icon="inline-start" />}
        variant={variant}
      />
      {allowWriteOps && (
        <Button type="button" size="sm" variant={variant} title={title} onClick={open}>
          <WorkflowIcon data-icon="inline-start" />
          {label}
        </Button>
      )}
    </>
  );
}

function RunRow({
  run,
  branch,
  environment,
  onOpen,
}: {
  run: CiRunSummary;
  branch: string;
  environment: string;
  onOpen: () => void;
}) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="px-3 py-3 align-top">
        <div className="font-mono text-xs text-foreground">#{run.runId}</div>
        {run.trigger && (
          <OverflowTooltip
            text={run.trigger}
            className="mt-1 max-w-36 truncate text-[11px] text-muted-foreground"
          />
        )}
      </td>
      <td className="max-w-44 px-3 py-3 align-top">
        <OverflowTooltip text={branch} className="block truncate font-mono text-xs text-foreground" />
      </td>
      <td className="max-w-36 px-3 py-3 align-top">
        <OverflowTooltip text={environment} className="block truncate text-xs text-muted-foreground" />
      </td>
      <td className="px-3 py-3 align-top"><StatusBadge status={run.status} size="sm" /></td>
      <td className="px-3 py-3 align-top text-xs text-muted-foreground">
        {run.durationMs != null ? formatDuration(run.durationMs) : '—'}
      </td>
      <td className="px-3 py-3 text-right align-top">
        <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
          <TerminalIcon data-icon="inline-start" />
          日志
        </Button>
      </td>
    </tr>
  );
}

function RepoRunsPage({
  repo,
  target,
  onNavigate,
}: {
  repo: RepoSummary | undefined;
  target: Extract<BuildWorkbenchTarget, { kind: 'repo' }>;
  onNavigate: (page: 'parameters' | 'logs') => void;
}) {
  const { repoCiByRepo, settings, loadRepoCi } = useApp();
  const openSettings = useUi((state) => state.openSettings);
  const entry = repoCiByRepo[target.repoId];
  const binding = settings?.repoCiBindings?.[String(target.repoId)];
  const runs = binding ? entry?.snapshot?.runs ?? [] : [];
  const jenkinsBinding = binding?.provider === 'jenkins' ? binding : undefined;
  const latest = runs[0];
  const displayRepoName = repo?.pathWithNamespace || target.title;
  const buildTarget = binding?.provider === 'flow'
    ? binding.pipelineName || '未选择流水线'
    : binding?.provider === 'jenkins'
      ? binding.jobFullName || '未填写 Job'
      : '未绑定';
  const recentBranch = buildRunParameter(latest, jenkinsBinding?.branchParameter, 'branch');
  const recentEnvironment = buildRunParameter(latest, jenkinsBinding?.environmentParameter, 'environment');

  const refresh = () => void loadRepoCi(target.repoId);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-5 sm:p-7">
        <section className="rounded-lg border border-border/70 bg-card/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <GitBranchIcon className="size-4 shrink-0 text-primary" />
                <OverflowTooltip
                  as="h2"
                  text={displayRepoName}
                  className="min-w-0 truncate text-sm font-semibold text-foreground"
                />
                <span className="font-mono text-[11px] text-muted-foreground">#{target.repoId}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {binding ? `${ciProviderLabel(binding)}${binding.provider === 'flow' && binding.pipelineName ? ` · ${binding.pipelineName}` : ''}` : '未绑定 CI'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={binding ? ciStatusText(entry?.snapshot?.status, entry) : '未绑定'} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="刷新运行记录" disabled={entry?.loading} onClick={refresh}>
                <RefreshCwIcon className={cn('size-3.5', entry?.loading && 'animate-spin')} />
              </Button>
            </div>
          </div>
          <Descriptions
            className="mt-4"
            variant="plain"
            items={[
              {
                key: 'target',
                label: '构建目标',
                children: <OverflowTooltip text={buildTarget} className="min-w-0 flex-1 truncate font-mono font-medium" />,
                contentClassName: 'font-mono font-medium',
              },
              {
                key: 'branch',
                label: '最近分支',
                children: <OverflowTooltip text={recentBranch} className="min-w-0 flex-1 truncate font-mono font-medium" />,
                contentClassName: 'font-mono font-medium',
              },
              {
                key: 'environment',
                label: '最近环境',
                children: <OverflowTooltip text={recentEnvironment} className="min-w-0 flex-1 truncate font-mono font-medium" />,
                contentClassName: 'font-mono font-medium',
              },
            ]}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
            <BuildWorkbenchTrigger
              target={targetWithoutRun(target)}
              label={binding ? '发起构建' : '选择 CI 构建'}
              title={binding ? `为 ${target.title} 发起构建` : '选择 Jenkins Job 并发起构建'}
            />
            {!binding && (
              <Button type="button" variant="outline" size="sm" onClick={() => openSettings('ci')}>
                <Link2Icon data-icon="inline-start" />去绑定 CI
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigate('parameters')}>
              <WorkflowIcon data-icon="inline-start" />参数页
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border/70 bg-card/30">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">最近运行</h2>
              <p className="mt-1 text-xs text-muted-foreground">点击某次运行进入日志；日志目标按提供方严格区分。</p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{runs.length} 次</span>
          </div>
          {entry?.error && (
            <div className="mx-4 mt-4 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              查询失败：{humanizeError(entry.error, '未能获取运行记录，请稍后重试')}
            </div>
          )}
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <thead className="text-[11px] text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-3 py-2 font-medium">运行</th>
                  <th className="px-3 py-2 font-medium">分支</th>
                  <th className="px-3 py-2 font-medium">环境</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">耗时</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <RunRow
                    key={run.runId}
                    run={run}
                    branch={buildRunParameter(run, jenkinsBinding?.branchParameter, 'branch')}
                    environment={buildRunParameter(run, jenkinsBinding?.environmentParameter, 'environment')}
                    onOpen={() => {
                      openRepoBuildLogs(target.repoId, run.runId, `${target.title} · #${run.runId}`, { internal: true });
                      onNavigate('logs');
                    }}
                  />
                ))}
              </tbody>
            </table>
            {entry?.loading && !runs.length && (
              <div className="flex flex-col gap-2 p-4" aria-hidden>
                {[0, 1, 2].map((item) => <Skeleton key={item} className="h-8 w-full rounded" />)}
              </div>
            )}
            {!entry?.loading && !runs.length && (
              <p className="p-8 text-center text-xs text-muted-foreground">
                {binding ? '暂无运行记录，发起一次构建后展示。' : '未绑定 CI，请先选择 Jenkins Job 或前往设置绑定。'}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function FlowParametersPage({
  repo,
  target,
  onCancel,
  onSuccess,
}: {
  repo: RepoSummary | undefined;
  target: Extract<BuildWorkbenchTarget, { kind: 'repo' }>;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { settings, setToast, loadRepoCi, markRepoCiActive } = useApp();
  const binding = settings?.repoCiBindings?.[String(target.repoId)];
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting || binding?.provider !== 'flow') return;
    setSubmitting(true);
    try {
      await api.triggerRepoCi(target.repoId);
      markRepoCiActive(90_000);
      setToast({ text: `已触发 ${repo?.name || target.title} 的流水线`, kind: 'ok' });
      await loadRepoCi(target.repoId);
      onSuccess();
    } catch (error) {
      errorLog('flow.trigger', error);
      setToast({ text: `触发失败：${humanizeError(error, '流水线触发失败，请稍后重试')}`, kind: 'fail' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-5 sm:p-7">
        <section className="rounded-lg border border-border/70 bg-card/40 p-5">
          <div className="flex items-center gap-2">
            <WorkflowIcon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">按当前配置发起流水线</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Flow 不需要在 nervd 中重新填写参数，将使用云效流水线当前绑定的配置运行。提交前请确认下面的目标信息。
          </p>
          <Descriptions
            className="mt-5"
            variant="plain"
            items={[
              { key: 'repo', label: '仓库', children: <OverflowTooltip text={repo?.pathWithNamespace || target.title} className="min-w-0 flex-1 truncate" /> },
              { key: 'pipeline', label: '流水线', children: <OverflowTooltip text={binding?.provider === 'flow' ? binding.pipelineName || '未选择流水线' : '绑定已变更'} className="min-w-0 flex-1 truncate" /> },
              { key: 'mode', label: '运行方式', children: '使用流水线当前配置' },
            ]}
          />
        </section>
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-border/70 bg-popover/95 px-1 py-3 backdrop-blur-sm">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>返回</Button>
          <WriteOpButton
            label={submitting ? '提交中…' : '提交构建'}
            title={`触发流水线 ${binding?.provider === 'flow' ? binding.pipelineName : ''}`}
            confirm="inline"
            confirmLabel="确认提交"
            disabled={submitting || binding?.provider !== 'flow'}
            disabledReason={binding?.provider === 'flow' ? undefined : '当前仓库的 CI 绑定已变化，请返回运行记录后重试'}
            onAction={submit}
          />
        </div>
      </div>
    </div>
  );
}

function PipelineRunsPage({
  target,
  onNavigate,
}: {
  target: Extract<BuildWorkbenchTarget, { kind: 'pipeline' }>;
  onNavigate: (page: 'parameters' | 'logs') => void;
}) {
  const { pipelines, runsByPipeline, loadingPipelines, loadRuns } = useApp();
  const pipeline = pipelines.find((item) => item.pipelineId === target.pipelineId);
  const runs = runsByPipeline[target.pipelineId] ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-5 sm:p-7">
        <section className="rounded-lg border border-border/70 bg-card/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <WorkflowIcon className="size-4 shrink-0 text-primary" />
                <OverflowTooltip
                  as="h2"
                  text={pipeline?.pipelineName || target.title}
                  className="min-w-0 truncate text-sm font-semibold text-foreground"
                />
                <span className="font-mono text-[11px] text-muted-foreground">#{target.pipelineId}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">云效 Flow 流水线运行记录</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadRuns(target.pipelineId)}>
              <RefreshCwIcon className={cn('size-3.5', loadingPipelines && 'animate-spin')} data-icon="inline-start" />刷新
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <BuildWorkbenchTrigger
              target={targetWithoutRun(target)}
              label="运行流水线"
              title={`运行 ${pipeline?.pipelineName || target.title}`}
            />
          </div>
        </section>
        <section className="rounded-lg border border-border/70 bg-card/30">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">最近运行</h2>
              <p className="mt-1 text-xs text-muted-foreground">点击日志前先解析运行详情中的 job，避免串到其他运行。</p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{runs.length} 次</span>
          </div>
          <div className="flex flex-col divide-y divide-border/50">
            {runs.map((run) => (
              <div key={run.pipelineRunId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <StatusBadge status={run.status} size="sm" />
                <span className="font-mono text-xs text-foreground">#{run.pipelineRunId}</span>
                {run.endTime && <span className="text-xs text-muted-foreground">{new Date(run.endTime).toLocaleString()}</span>}
                <span className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void openPipelineRunLogs(target.pipelineId, run.pipelineRunId, pipeline?.pipelineName || target.title, { internal: true });
                      onNavigate('logs');
                    }}
                  >
                    <TerminalIcon data-icon="inline-start" />日志
                  </Button>
                </span>
              </div>
            ))}
            {!runs.length && <p className="p-8 text-center text-xs text-muted-foreground">暂无流水线运行记录。</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function PipelineParametersPage({
  target,
  onCancel,
  onSuccess,
}: {
  target: Extract<BuildWorkbenchTarget, { kind: 'pipeline' }>;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { pipelines, setToast, loadRuns } = useApp();
  const pipeline = pipelines.find((item) => item.pipelineId === target.pipelineId);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.startPipelineRun(target.pipelineId);
      setToast({ text: `${pipeline?.pipelineName || target.title} 已提交运行`, kind: 'ok' });
      void loadRuns(target.pipelineId);
      onSuccess();
    } catch (error) {
      errorLog('pipeline.trigger', error);
      setToast({ text: `触发失败：${humanizeError(error, `${target.title} 触发失败，请稍后重试`)}`, kind: 'fail' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-5 sm:p-7">
        <section className="rounded-lg border border-border/70 bg-card/40 p-5">
          <div className="flex items-center gap-2">
            <WorkflowIcon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">运行流水线</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            该流水线由云效 Flow 管理，nervd 将按流水线当前配置提交一次运行。
          </p>
          <Descriptions
            className="mt-5"
            variant="plain"
            items={[
              { key: 'pipeline', label: '流水线', children: <OverflowTooltip text={pipeline?.pipelineName || target.title} className="min-w-0 flex-1 truncate" /> },
              { key: 'pipelineId', label: '流水线 ID', children: String(target.pipelineId), contentClassName: 'font-mono' },
              { key: 'mode', label: '运行方式', children: '使用当前流水线配置' },
            ]}
          />
        </section>
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-border/70 bg-popover/95 px-1 py-3 backdrop-blur-sm">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>返回</Button>
          <WriteOpButton
            label={submitting ? '提交中…' : '提交运行'}
            title={`运行 ${pipeline?.pipelineName || target.title}`}
            confirm="inline"
            confirmLabel="确认运行"
            disabled={submitting}
            onAction={submit}
          />
        </div>
      </div>
    </div>
  );
}

function ParametersPage({
  target,
  repo,
  resetKey,
  onCancel,
  onSuccess,
}: {
  target: BuildWorkbenchTarget;
  repo: RepoSummary | undefined;
  resetKey: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const settings = useApp((state) => state.settings);

  if (target.kind === 'pipeline') {
    return <PipelineParametersPage target={target} onCancel={onCancel} onSuccess={onSuccess} />;
  }

  const binding = settings?.repoCiBindings?.[String(target.repoId)];
  if (binding?.provider === 'flow') {
    return <FlowParametersPage repo={repo} target={target} onCancel={onCancel} onSuccess={onSuccess} />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5 sm:p-7">
        <section className="rounded-lg border border-border/70 bg-card/40 p-4">
          <div className="flex items-center gap-2">
            <WorkflowIcon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Jenkins 构建参数</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{repo?.pathWithNamespace || target.title} · 选择 Job、分支和环境后提交。</p>
        </section>
        <JenkinsBuildParameters
          repoId={target.repoId}
          repoName={repo?.name || target.title}
          defaultBranch={target.defaultBranch}
          resetKey={resetKey}
          active
          onCancel={onCancel}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}

export function BuildWorkbenchDrawer() {
  const open = useUi((state) => state.buildWorkbenchOpen);
  const target = useUi((state) => state.buildWorkbenchTarget);
  const page = useUi((state) => state.buildWorkbenchPage);
  const navigate = useUi((state) => state.navigateBuildWorkbench);
  const back = useUi((state) => state.backBuildWorkbench);
  const close = useUi((state) => state.closeBuildWorkbench);
  const { repositories, loadRepoCi, loadRuns } = useApp();
  const repo = target?.kind === 'repo' ? repositories.find((item) => item.id === target.repoId) : undefined;
  const targetId = targetKey(target);
  const lastTargetId = useRef(targetId);
  const wasOpen = useRef(false);
  const [resetVersion, setResetVersion] = useState(0);

  useEffect(() => {
    if (lastTargetId.current === targetId) return;
    lastTargetId.current = targetId;
    setResetVersion((value) => value + 1);
  }, [targetId]);

  useEffect(() => {
    if (!open || !target) return;
    if (target.kind === 'repo') void loadRepoCi(target.repoId);
    else void loadRuns(target.pipelineId);
  }, [open, targetId, target, loadRepoCi, loadRuns]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    useApp.getState().closeLogs();
    if (wasOpen.current) {
      wasOpen.current = false;
      restoreBuildWorkbenchFocus();
    }
  }, [open]);

  const formResetKey = `${open ? 'open' : 'closed'}:${targetId}:${resetVersion}`;

  const finishBuild = () => {
    if (!target) return;
    useUi.getState().openBuildWorkbench(targetWithoutRun(target), 'runs');
  };

  const closeWorkbench = () => {
    useApp.getState().closeLogs();
    close();
  };

  const pageLabel = page === 'runs' ? '运行记录' : page === 'parameters' ? '构建参数' : '日志';
  const title = target?.title || '构建工作台';

  return (
    <Drawer
      open={open}
      swipeDirection="right"
      onOpenChange={(next, details) => {
        if (next) return;
        if (details.reason === 'escape-key' && page !== 'runs') {
          details.cancel();
          back();
          return;
        }
        closeWorkbench();
      }}
    >
      <DrawerContent className="h-[100dvh] w-[100vw] data-[swipe-axis=x]:sm:[--drawer-content-width:min(64rem,96vw)] p-0 sm:w-[min(64rem,96vw)]">
        {page === 'logs' ? (
          <LogViewerContent
            fallbackTitle={`${title} · 日志`}
            onBack={back}
            onClose={closeWorkbench}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <DrawerHeader className="shrink-0 border-b border-border/70 px-5 py-3 sm:px-7">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  {page !== 'runs' && (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="返回运行记录" title="返回运行记录" onClick={back}>
                      <ArrowLeftIcon className="size-4" />
                    </Button>
                  )}
                  <div className="min-w-0">
                    <DrawerTitle className="min-w-0 text-sm font-semibold">
                      <OverflowTooltip text={`${title} · ${pageLabel}`} className="truncate text-sm font-semibold" />
                    </DrawerTitle>
                    <DrawerDescription className="mt-0.5 truncate text-xs">
                      {target?.kind === 'repo' ? `仓库 #${target.repoId}` : `流水线 #${target?.kind === 'pipeline' ? target.pipelineId : ''}`} · 构建工作台
                    </DrawerDescription>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭构建工作台" title="关闭构建工作台" onClick={closeWorkbench}>
                  <XIcon className="size-4" />
                </Button>
              </div>
            </DrawerHeader>

            {target?.kind === 'repo' && page === 'runs' && (
              <RepoRunsPage
                repo={repo}
                target={target}
                onNavigate={(next) => navigate(next)}
              />
            )}
            {target?.kind === 'pipeline' && page === 'runs' && (
              <PipelineRunsPage target={target} onNavigate={(next) => navigate(next)} />
            )}
            {target && (
              <div className={page === 'parameters' ? 'flex min-h-0 flex-1' : 'hidden'}>
                <ParametersPage
                  target={target}
                  repo={repo}
                  resetKey={formResetKey}
                  onCancel={back}
                  onSuccess={finishBuild}
                />
              </div>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
