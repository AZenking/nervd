import { useEffect } from 'react';
import { Link2Icon, RefreshCwIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import type { RepoSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Descriptions } from '@/components/ui/descriptions';
import { SectionHeader } from '../section-header';
import { StatusBadge } from '../StatusBadge';
import { WriteOpButton } from '../WriteOpButton';
import { JenkinsBuildDialog } from './JenkinsBuildDialog';
import { TableEmptyRow } from '../table-empty-row';
import { buildRunParameter, ciProviderLabel, ciStatusText, triggerRepoCiWithFeedback } from '@/lib/ci';
import { humanizeError } from '@/lib/error-format';
import { formatDuration } from '@/lib/format';

/**
 * CI 详情模态弹窗（迭代页 / 需求详情共用）：统一为 Linear 居中 Dialog 规范。
 * Flow 绑定 → 流水线状态 + 触发流水线；Jenkins 绑定 → Job 参数构建；未绑定 → 引导去绑定，不误导"Jenkins 未配置"。
 */
export function RepositoryCiDetails({
  repo,
  open,
  onOpenChange,
}: {
  repo: RepoSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { repoCiByRepo, settings, loadRepoCi, openRepoCiLogs } = useApp();
  const openSettings = useUi((s) => s.openSettings);
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const binding = settings?.repoCiBindings?.[String(repo.id)];
  const isFlow = binding?.provider === 'flow';
  const isJenkins = binding?.provider === 'jenkins';
  const isBound = Boolean(binding);
  const runs = isBound ? snapshot?.runs ?? [] : [];
  const latestRun = runs[0];
  const jenkinsBinding = isJenkins ? binding : undefined;
  const latestBranch = buildRunParameter(latestRun, jenkinsBinding?.branchParameter, 'branch');
  const latestEnvironment = buildRunParameter(latestRun, jenkinsBinding?.environmentParameter, 'environment');
  const providerLabel = ciProviderLabel(binding);

  useEffect(() => {
    if (open && isBound) void loadRepoCi(repo.id);
  }, [open, isBound, repo.id, loadRepoCi]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-2xl overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 border-b border-border/70">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>{repo.name} · CI 详情</DialogTitle>
              <DialogDescription>仓库 #{repo.id} · {providerLabel}{isFlow && binding.pipelineName ? ` · ${binding.pipelineName}` : ''}</DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2 pr-6">
              <StatusBadge status={isBound ? ciStatusText(snapshot?.status, entry) : '未绑定'} />
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 p-4">
            <section className="flex flex-col gap-3">
              <SectionHeader
                title="构建详情"
                hint="按仓库绑定的 CI 提供方展示；分支 / 环境取自最近一次构建的实际参数，未记录时显示「未记录」"
              />
              <Descriptions
                  column={{ xs: 1, sm: 3 }}
                  items={[
                    {
                      key: 'target',
                      label: 'CI 目标',
                      children: isFlow ? binding.pipelineName || '未选择流水线'
                        : isJenkins ? binding.jobFullName || '未填写 Job'
                          : '未绑定',
                      copyable: Boolean(isFlow ? binding.pipelineName : isJenkins ? binding.jobFullName : false),
                      contentClassName: 'font-mono font-medium',
                    },
                    {
                      key: 'branch',
                      label: '最近构建分支',
                      children: latestBranch,
                      copyable: latestBranch !== '未记录',
                      contentClassName: 'font-mono font-medium',
                    },
                    {
                      key: 'environment',
                      label: '最近构建环境',
                      children: latestEnvironment,
                      copyable: latestEnvironment !== '未记录',
                      contentClassName: 'font-mono font-medium',
                    },
                  ]}
                />
            </section>
            <section className="flex flex-col gap-3">
              <SectionHeader
                title="构建操作"
                hint={<>
                  {isJenkins && '选择 Jenkins Job、环境和分支；勾选记住后，下次会预填本次选择。'}
                  {isFlow && '触发该仓库绑定的云效 Flow 流水线（按流水线当前配置运行）。'}
                  {!isBound && '先为该仓库绑定 CI（云效 Flow 流水线或 Jenkins Job），或直接在此选择 Jenkins Job。'}
                </>}
              />
              <div className="flex flex-wrap items-center gap-2">
                {isJenkins && (
                  <JenkinsBuildDialog
                    repoId={repo.id}
                    repoName={repo.name}
                    defaultBranch={latestBranch === '未记录' ? undefined : latestBranch}
                    buttonLabel="再次构建"
                  />
                )}
                {isFlow && (
                  <WriteOpButton
                    label="触发流水线"
                    title={`触发流水线 ${binding.pipelineName}`}
                    variant="outline"
                    onAction={() => triggerRepoCiWithFeedback(repo.id, repo.name)}
                  />
                )}
                {!isBound && (
                  <>
                    <JenkinsBuildDialog
                      repoId={repo.id}
                      repoName={repo.name}
                      defaultBranch={latestBranch === '未记录' ? undefined : latestBranch}
                      buttonLabel="选择 Jenkins Job"
                      buttonVariant="outline"
                    />
                    <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); openSettings('ci'); }}>
                      <Link2Icon data-icon="inline-start" />
                      去绑定 CI
                    </Button>
                  </>
                )}
                {isBound && (
                  <Button variant="outline" size="sm" disabled={entry?.loading} onClick={() => void loadRepoCi(repo.id)}>
                    <RefreshCwIcon data-icon="inline-start" />
                    {entry?.loading ? '刷新中…' : '刷新状态'}
                  </Button>
                )}
              </div>
            </section>
            <section className="flex flex-col gap-3">
              <SectionHeader title="最近运行" hint="最近 5 次构建；参数取自各自构建记录，点击查看日志" />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>运行</TableHead>
                      <TableHead>分支</TableHead>
                      <TableHead>环境</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>耗时</TableHead>
                      <TableHead className="text-right">日志</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.runId}>
                        <TableCell className="font-log text-xs">
                          <div>#{run.runId}</div>
                          {run.trigger && (
                            <Tooltip>
                              <TooltipTrigger render={<div className="max-w-32 truncate text-muted-foreground" />}>
                                {run.trigger}
                              </TooltipTrigger>
                              <TooltipContent>{run.trigger}</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell className="max-w-32 truncate text-xs">
                          <Tooltip>
                            <TooltipTrigger render={<span className="block truncate" />}>
                              {buildRunParameter(run, jenkinsBinding?.branchParameter, 'branch')}
                            </TooltipTrigger>
                            <TooltipContent className="max-w-96 break-all">
                              {buildRunParameter(run, jenkinsBinding?.branchParameter, 'branch')}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="max-w-28 truncate text-xs">
                          <Tooltip>
                            <TooltipTrigger render={<span className="block truncate" />}>
                              {buildRunParameter(run, jenkinsBinding?.environmentParameter, 'environment')}
                            </TooltipTrigger>
                            <TooltipContent className="max-w-96 break-all">
                              {buildRunParameter(run, jenkinsBinding?.environmentParameter, 'environment')}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={run.status} size="sm" />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {run.durationMs != null ? formatDuration(run.durationMs) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void openRepoCiLogs(repo.id, run.runId, `${repo.name} · #${run.runId}`)}
                          >
                            查看
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {entry?.loading && !runs.length ? (
                      [0, 1, 2, 3].map((i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-12 rounded" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-14 rounded" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-28 rounded" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16 rounded" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24 rounded" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-7 w-12 ml-auto rounded" /></TableCell>
                        </TableRow>
                      ))
                    ) : !runs.length ? (
                      <TableEmptyRow
                        colSpan={6}
                        title={entry?.error
                          ? `查询失败：${humanizeError(entry.error, '未能获取运行记录，请稍后重试')}`
                          : isBound ? '暂无运行记录，触发一次构建后展示' : '未绑定 CI，请先绑定流水线或 Jenkins Job'}
                      />
                    ) : null}
                  </TableBody>
                </Table>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
