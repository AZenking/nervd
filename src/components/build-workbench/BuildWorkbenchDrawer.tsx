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
import { Alert, Button, Card, Chip, Table } from '@heroui/react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useQuickBuild } from '@/store/quick-build';
import { useUi, type BuildWorkbenchTarget } from '@/store/ui';
import type { CiRunSummary, RepoSummary } from '@/types';
import { buildRunParameter, ciProviderLabel, ciStatusText } from '@/lib/ci';
import { errorLog, humanizeError } from '@/lib/error-format';
import { formatCompactDateTime, formatDateTime, formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  variant = 'primary',
}: {
  target: BuildWorkbenchTarget;
  label: string;
  title?: string;
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
}) {
  const allowWriteOps = useApp((state) => state.settings?.allowWriteOps ?? false);
  const open = () => openBuildWorkbenchFromTrigger(target, 'parameters');
  const heroVariant = variant === 'default' ? 'primary' : variant;

  return (
    <>
      <WriteOpGatedTrigger
        label={label}
        icon={<WorkflowIcon className="size-3.5" />}
        variant={variant as any}
      />
      {allowWriteOps && (
        <Button type="button" size="sm" variant={heroVariant} aria-label={title || label} onPress={open}>
          <WorkflowIcon className="size-3.5" />
          <span>{label}</span>
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
    <Table.Row id={String(run.runId)} className="border-b border-border/40 transition-colors hover:bg-muted/30">
      <Table.Cell className="px-3 py-2.5 align-top">
        <div className="font-mono text-xs font-semibold text-foreground">#{run.runId}</div>
        {run.startTime && (
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground" title={`开始时间：${formatDateTime(run.startTime)}`}>
            {formatCompactDateTime(run.startTime)}
          </div>
        )}
        {run.trigger && (
          <OverflowTooltip
            text={run.trigger}
            title={run.trigger}
            className="mt-0.5 max-w-36 truncate text-[11px] text-muted-foreground"
          />
        )}
      </Table.Cell>
      <Table.Cell className="max-w-44 px-3 py-2.5 align-top">
        <OverflowTooltip text={branch} title={branch} className="block truncate font-mono text-xs text-foreground" />
      </Table.Cell>
      <Table.Cell className="max-w-36 px-3 py-2.5 align-top">
        <OverflowTooltip text={environment} title={environment} className="block truncate text-xs text-muted-foreground" />
      </Table.Cell>
      <Table.Cell className="px-3 py-2.5 align-top">
        <StatusBadge status={run.status} size="sm" />
      </Table.Cell>
      <Table.Cell className="px-3 py-2.5 align-top text-xs text-muted-foreground">
        {run.durationMs != null ? formatDuration(run.durationMs) : '—'}
      </Table.Cell>
      <Table.Cell className="px-3 py-2.5 text-right align-top">
        <Button type="button" variant="ghost" size="sm" onPress={onOpen} className="h-7 gap-1 px-2 text-[11px]">
          <TerminalIcon className="size-3" />
          <span>日志</span>
        </Button>
      </Table.Cell>
    </Table.Row>
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
    <ScrollArea className="min-h-0 flex-1 overscroll-contain [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-5">
        <Card>
          <Card.Header className="flex flex-row items-start justify-between gap-3 pb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <GitBranchIcon className="size-4 shrink-0 text-primary" />
                <OverflowTooltip
                  as="h2"
                  text={displayRepoName}
                  title={displayRepoName}
                  className="min-w-0 truncate text-sm font-semibold text-foreground"
                />
                <Chip size="sm" variant="soft" color="default">#{target.repoId}</Chip>
              </div>
              <Card.Description className="mt-1 text-xs">
                {binding ? `${ciProviderLabel(binding)}${binding.provider === 'flow' && binding.pipelineName ? ` · ${binding.pipelineName}` : ''}` : '未绑定 CI'}
              </Card.Description>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={binding ? ciStatusText(entry?.snapshot?.status, entry) : '未绑定'} />
              <Button type="button" variant="ghost" isIconOnly size="sm" aria-label="刷新运行记录" isDisabled={entry?.loading} onPress={refresh}>
                <RefreshCwIcon className={cn('size-3.5', entry?.loading && 'animate-spin')} />
              </Button>
            </div>
          </Card.Header>
          <Card.Content className="pt-2">
            <Descriptions
              variant="plain"
              items={[
                {
                  key: 'target',
                  label: '构建目标',
                  children: <OverflowTooltip text={buildTarget} title={buildTarget} className="min-w-0 flex-1 truncate font-mono font-medium" />,
                  contentClassName: 'font-mono font-medium',
                },
                {
                  key: 'branch',
                  label: '最近分支',
                  children: <OverflowTooltip text={recentBranch} title={recentBranch} className="min-w-0 flex-1 truncate font-mono font-medium" />,
                  contentClassName: 'font-mono font-medium',
                },
                {
                  key: 'environment',
                  label: '最近环境',
                  children: <OverflowTooltip text={recentEnvironment} title={recentEnvironment} className="min-w-0 flex-1 truncate font-mono font-medium" />,
                  contentClassName: 'font-mono font-medium',
                },
              ]}
            />
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <BuildWorkbenchTrigger
                target={targetWithoutRun(target)}
                label={binding ? '发起构建' : '选择 CI 构建'}
                title={binding ? `为 ${target.title} 发起构建` : '选择 Jenkins Job 并发起构建'}
              />
              {!binding && (
                <Button type="button" variant="outline" size="sm" onPress={() => openSettings('ci')}>
                  <Link2Icon className="size-3.5" />
                  <span>去绑定 CI</span>
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onPress={() => onNavigate('parameters')}>
                <WorkflowIcon className="size-3.5" />
                <span>参数页</span>
              </Button>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="flex flex-row items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <Card.Title className="text-sm font-semibold">最近运行</Card.Title>
              <Card.Description className="mt-1 text-xs">点击某次运行进入日志；日志目标按提供方严格区分。</Card.Description>
            </div>
            <Chip size="sm" variant="soft" color="default">{runs.length} 次</Chip>
          </Card.Header>
          <Card.Content className="p-0">
            {entry?.error && (
              <div className="p-4 pb-0">
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>查询失败</Alert.Title>
                    <Alert.Description>{humanizeError(entry.error, '未能获取运行记录，请稍后重试')}</Alert.Description>
                  </Alert.Content>
                </Alert>
              </div>
            )}
            <Table variant="secondary" className="w-full">
              <Table.ScrollContainer>
                <Table.Content aria-label="最近运行记录" className="text-xs">
                  <Table.Header className="border-b border-border/60 bg-transparent text-[11px] text-muted-foreground">
                    <Table.Column isRowHeader className="px-3 py-2 text-start text-[11px] font-medium text-muted-foreground">运行</Table.Column>
                    <Table.Column className="px-3 py-2 text-start text-[11px] font-medium text-muted-foreground">分支</Table.Column>
                    <Table.Column className="px-3 py-2 text-start text-[11px] font-medium text-muted-foreground">环境</Table.Column>
                    <Table.Column className="px-3 py-2 text-start text-[11px] font-medium text-muted-foreground">状态</Table.Column>
                    <Table.Column className="px-3 py-2 text-start text-[11px] font-medium text-muted-foreground">耗时</Table.Column>
                    <Table.Column className="px-3 py-2 text-end text-[11px] font-medium text-muted-foreground">操作</Table.Column>
                  </Table.Header>
                  <Table.Body>
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
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
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
          </Card.Content>
        </Card>
      </div>
    </ScrollArea>
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
      useQuickBuild.getState().recordBuild({
        id: `flow:${target.repoId}`,
        type: 'flow',
        repoId: target.repoId,
        repoName: repo?.name || target.title,
        pipelineName: binding.pipelineName || '云效 Flow 流水线',
      });
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
    <ScrollArea className="min-h-0 flex-1 overscroll-contain [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-5">
        <Card>
          <Card.Header className="pb-2">
            <div className="flex items-center gap-2">
              <WorkflowIcon className="size-4 text-primary" />
              <Card.Title className="text-sm font-semibold">按当前配置发起流水线</Card.Title>
            </div>
            <Card.Description className="mt-1 text-xs">
              Flow 不需要在 nervd 中重新填写参数，将使用云效流水线当前绑定的配置运行。提交前请确认下面的目标信息。
            </Card.Description>
          </Card.Header>
          <Card.Content className="pt-2">
            <Descriptions
              variant="plain"
              items={[
                { key: 'repo', label: '仓库', children: <OverflowTooltip text={repo?.pathWithNamespace || target.title} title={repo?.pathWithNamespace || target.title} className="min-w-0 flex-1 truncate" /> },
                { key: 'pipeline', label: '流水线', children: <OverflowTooltip text={binding?.provider === 'flow' ? binding.pipelineName || '未选择流水线' : '绑定已变更'} title={binding?.provider === 'flow' ? binding.pipelineName || '未选择流水线' : '绑定已变更'} className="min-w-0 flex-1 truncate" /> },
                { key: 'mode', label: '运行方式', children: '使用流水线当前配置' },
              ]}
            />
          </Card.Content>
        </Card>
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-border/70 bg-popover/95 px-1 py-3 backdrop-blur-sm">
          <Button type="button" variant="outline" size="sm" onPress={onCancel}>返回</Button>
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
    </ScrollArea>
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
    <ScrollArea className="min-h-0 flex-1 overscroll-contain [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-5">
        <Card>
          <Card.Header className="flex flex-row items-center justify-between gap-3 pb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <WorkflowIcon className="size-4 shrink-0 text-primary" />
                <OverflowTooltip
                  as="h2"
                  text={pipeline?.pipelineName || target.title}
                  title={pipeline?.pipelineName || target.title}
                  className="min-w-0 truncate text-sm font-semibold text-foreground"
                />
                <Chip size="sm" variant="soft" color="default">#{target.pipelineId}</Chip>
              </div>
              <Card.Description className="mt-1 text-xs">云效 Flow 流水线运行记录</Card.Description>
            </div>
            <Button type="button" variant="outline" size="sm" onPress={() => void loadRuns(target.pipelineId)}>
              <RefreshCwIcon className={cn('size-3.5', loadingPipelines && 'animate-spin')} />
              <span>刷新</span>
            </Button>
          </Card.Header>
          <Card.Content className="pt-2">
            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
              <BuildWorkbenchTrigger
                target={targetWithoutRun(target)}
                label="运行流水线"
                title={`运行 ${pipeline?.pipelineName || target.title}`}
              />
            </div>
          </Card.Content>
        </Card>
        <Card>
          <Card.Header className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
            <div>
              <Card.Title className="text-sm font-semibold">最近运行</Card.Title>
              <Card.Description className="mt-1 text-xs">点击日志前先解析运行详情中的 job，避免串到其他运行。</Card.Description>
            </div>
            <Chip size="sm" variant="soft" color="default">{runs.length} 次</Chip>
          </Card.Header>
          <Card.Content className="p-0">
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
                      onPress={() => {
                        void openPipelineRunLogs(target.pipelineId, run.pipelineRunId, pipeline?.pipelineName || target.title, { internal: true });
                        onNavigate('logs');
                      }}
                    >
                      <TerminalIcon className="size-3.5" />
                      <span>日志</span>
                    </Button>
                  </span>
                </div>
              ))}
              {!runs.length && <p className="p-8 text-center text-xs text-muted-foreground">暂无流水线运行记录。</p>}
            </div>
          </Card.Content>
        </Card>
      </div>
    </ScrollArea>
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
    <ScrollArea className="min-h-0 flex-1 overscroll-contain [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-5">
        <Card>
          <Card.Header className="pb-2">
            <div className="flex items-center gap-2">
              <WorkflowIcon className="size-4 text-primary" />
              <Card.Title className="text-sm font-semibold">运行流水线</Card.Title>
            </div>
            <Card.Description className="mt-1 text-xs">
              该流水线由云效 Flow 管理，nervd 将按流水线当前配置提交一次运行。
            </Card.Description>
          </Card.Header>
          <Card.Content className="pt-2">
            <Descriptions
              variant="plain"
              items={[
                { key: 'pipeline', label: '流水线', children: <OverflowTooltip text={pipeline?.pipelineName || target.title} title={pipeline?.pipelineName || target.title} className="min-w-0 flex-1 truncate" /> },
                { key: 'pipelineId', label: '流水线 ID', children: String(target.pipelineId), contentClassName: 'font-mono' },
                { key: 'mode', label: '运行方式', children: '使用当前流水线配置' },
              ]}
            />
          </Card.Content>
        </Card>
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-border/70 bg-popover/95 px-1 py-3 backdrop-blur-sm">
          <Button type="button" variant="outline" size="sm" onPress={onCancel}>返回</Button>
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
    </ScrollArea>
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
    <ScrollArea className="min-h-0 flex-1 overscroll-contain [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-5">
        <Card>
          <Card.Header className="pb-2">
            <div className="flex items-center gap-2">
              <WorkflowIcon className="size-4 text-primary" />
              <Card.Title className="text-sm font-semibold">Jenkins 构建参数</Card.Title>
            </div>
            <Card.Description className="mt-1 text-xs">
              {repo?.pathWithNamespace || target.title} · 选择 Job、分支和环境后提交。
            </Card.Description>
          </Card.Header>
        </Card>
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
    </ScrollArea>
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
      <DrawerContent className="w-full sm:w-[560px] md:w-[600px] lg:w-[640px] sm:max-w-none">
        {page === 'logs' ? (
          <LogViewerContent
            fallbackTitle={`${title} · 日志`}
            onBack={back}
            onClose={closeWorkbench}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <DrawerHeader className="shrink-0 border-b border-border/70 px-5 py-3 sm:px-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  {page !== 'runs' && (
                    <Button type="button" variant="ghost" isIconOnly size="sm" aria-label="返回运行记录" onPress={back}>
                      <ArrowLeftIcon className="size-4" />
                    </Button>
                  )}
                  <div className="min-w-0">
                    <DrawerTitle className="min-w-0 text-sm font-semibold">
                      <OverflowTooltip
                        text={`${title} · ${pageLabel}`}
                        title={`${title} · ${pageLabel}`}
                        className="truncate text-sm font-semibold"
                      />
                    </DrawerTitle>
                    <DrawerDescription
                      className="mt-0.5 truncate text-xs"
                      title={target?.kind === 'repo' ? `仓库 #${target.repoId} · 构建工作台` : `流水线 #${target?.kind === 'pipeline' ? target.pipelineId : ''} · 构建工作台`}
                    >
                      {target?.kind === 'repo' ? `仓库 #${target.repoId}` : `流水线 #${target?.kind === 'pipeline' ? target.pipelineId : ''}`} · 构建工作台
                    </DrawerDescription>
                  </div>
                </div>
                <Button type="button" variant="ghost" isIconOnly size="sm" aria-label="关闭构建工作台" onPress={closeWorkbench}>
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
