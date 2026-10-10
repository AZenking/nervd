import { useEffect } from 'react';
import { Link2Icon, RefreshCwIcon, XIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import type { RepoSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '../StatusBadge';
import { WriteOpButton } from '../WriteOpButton';
import { JenkinsBuildDialog } from './JenkinsBuildDialog';
import { InfoItem } from '../info-item';
import { TableEmptyRow } from '../table-empty-row';
import { buildRunParameter, ciProviderLabel, ciStatusText, triggerRepoCiWithFeedback } from '@/lib/ci';
import { humanizeError } from '@/lib/error-format';
import { formatDuration } from '@/lib/format';

/**
 * CI 详情抽屉（迭代页 / 需求详情共用）：按仓库实际绑定的 CI 提供方展示状态、运行与操作。
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
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="w-[100vw] sm:w-[min(40rem,100vw)]">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DrawerTitle>{repo.name} · CI 详情</DrawerTitle>
              <DrawerDescription>仓库 #{repo.id} · {providerLabel}{isFlow && binding.pipelineName ? ` · ${binding.pipelineName}` : ''}</DrawerDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge status={isBound ? ciStatusText(snapshot?.status, entry) : '未绑定'} />
              <DrawerClose
                render={<Button variant="ghost" size="icon-sm" aria-label="关闭" />}
              >
                <XIcon />
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 p-4">
            <Card>
              <CardHeader>
                <CardTitle>构建详情</CardTitle>
                <CardDescription>
                  按仓库绑定的 CI 提供方展示；分支 / 环境取自最近一次构建的实际参数，未记录时显示"未记录"。
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <InfoItem label="CI 目标" value={
                  isFlow ? binding.pipelineName || '未选择流水线'
                    : isJenkins ? binding.jobFullName || '未填写 Job'
                      : '未绑定'
                } />
                <InfoItem label="最近构建分支" value={latestBranch} />
                <InfoItem label="最近构建环境" value={latestEnvironment} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>构建操作</CardTitle>
                <CardDescription>
                  {isJenkins && '选择 Jenkins Job、环境和分支；勾选记住后，下次会预填本次选择。'}
                  {isFlow && '触发该仓库绑定的云效 Flow 流水线（按流水线当前配置运行）。'}
                  {!isBound && '先为该仓库绑定 CI（云效 Flow 流水线或 Jenkins Job），或直接在此选择 Jenkins Job。'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
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
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>最近运行</CardTitle>
                <CardDescription>最近 5 次构建；参数取自各自构建记录，点击查看日志</CardDescription>
              </CardHeader>
              <CardContent>
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
                    {!runs.length && (
                      <TableEmptyRow
                        colSpan={6}
                        title={entry?.loading
                          ? '加载运行记录…'
                          : entry?.error
                            ? `查询失败：${humanizeError(entry.error, '未能获取运行记录，请稍后重试')}`
                            : isBound ? '暂无运行记录，触发一次构建后展示' : '未绑定 CI，请先绑定流水线或 Jenkins Job'}
                      />
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
