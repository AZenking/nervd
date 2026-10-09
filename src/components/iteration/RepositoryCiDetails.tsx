import { useEffect } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useApp } from '@/store/app';
import type { CiRunSummary, RepoSummary } from '@/types';
import { StatusDot } from '../StatusDot';
import { JenkinsBuildDialog } from './JenkinsBuildDialog';

function CiInfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-sm font-semibold" title={value}>{value}</p>
    </div>
  );
}

function buildParameter(run: CiRunSummary | undefined, selectedName: string | undefined, kind: 'branch' | 'environment') {
  const parameters = run?.parameters ?? {};
  const selectedValue = selectedName ? parameters[selectedName] : undefined;
  if (selectedValue?.trim()) return selectedValue;
  const matcher = kind === 'branch'
    ? /(^|[_-])(git)?branch([_-]|$)|branchname|gitref|scmref/i
    : /(^|[_-])(env|environment|deployenv|targetenv)([_-]|$)|environment/i;
  const inferred = Object.entries(parameters).find(([name]) => matcher.test(name))?.[1];
  return inferred?.trim() || '未记录';
}

/** 迭代页和需求详情共用的 Jenkins 构建详情面板。 */
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
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const binding = settings?.repoCiBindings?.[String(repo.id)];
  const jenkinsBinding = binding?.provider === 'jenkins' ? binding : undefined;
  const isJenkins = Boolean(jenkinsBinding);
  const runs = isJenkins ? snapshot?.runs ?? [] : [];
  const latestRun = runs[0];
  const latestBranch = buildParameter(latestRun, jenkinsBinding?.branchParameter, 'branch');
  const latestEnvironment = buildParameter(latestRun, jenkinsBinding?.environmentParameter, 'environment');

  useEffect(() => {
    if (open && isJenkins) void loadRepoCi(repo.id);
  }, [open, isJenkins, repo.id, loadRepoCi]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="[--drawer-content-width:min(48rem,100vw)]">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DrawerTitle>{repo.name} · CI 详情</DrawerTitle>
              <DrawerDescription>仓库 #{repo.id} · Jenkins Job、实际构建分支与环境</DrawerDescription>
            </div>
            <Badge variant={isJenkins && snapshot?.status === 'SUCCESS' ? 'secondary' : isJenkins && snapshot?.status === 'FAIL' ? 'destructive' : 'outline'}>
              {isJenkins ? snapshot?.status ?? (entry?.loading ? '加载中' : '未知') : '未配置 Jenkins'}
            </Badge>
          </div>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 p-4">
            <Card>
              <CardHeader>
                <CardTitle>构建详情</CardTitle>
                <CardDescription>分支和环境来自这次 Jenkins 构建的实际参数；旧构建未记录参数时显示“未记录”。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <CiInfoItem label="Jenkins Job" value={jenkinsBinding?.jobFullName ?? '未配置'} />
                <CiInfoItem label="最近构建分支" value={latestBranch} />
                <CiInfoItem label="最近构建环境" value={latestEnvironment} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>构建操作</CardTitle>
                <CardDescription>选择 Jenkins Job、环境和分支；勾选记住后，下次会预填本次选择。</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <JenkinsBuildDialog
                  repoId={repo.id}
                  repoName={repo.name}
                  defaultBranch={latestBranch === '未记录' ? undefined : latestBranch}
                  buttonLabel={isJenkins ? '再次构建' : '选择 Jenkins Job'}
                />
                <Button variant="outline" size="sm" disabled={entry?.loading} onClick={() => void loadRepoCi(repo.id)}>
                  <RefreshCwIcon className="size-4" />
                  {entry?.loading ? '刷新中…' : '刷新状态'}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>最近运行</CardTitle>
                <CardDescription>最近 5 次 Jenkins 构建；参数取自各自构建记录，点击查看日志</CardDescription>
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
                        <TableCell className="font-mono text-xs">
                          <div>#{run.runId}</div>
                          {run.trigger && <div className="max-w-32 truncate text-muted-foreground" title={run.trigger}>{run.trigger}</div>}
                        </TableCell>
                        <TableCell className="max-w-32 truncate text-xs" title={buildParameter(run, jenkinsBinding?.branchParameter, 'branch')}>
                          {buildParameter(run, jenkinsBinding?.branchParameter, 'branch')}
                        </TableCell>
                        <TableCell className="max-w-28 truncate text-xs" title={buildParameter(run, jenkinsBinding?.environmentParameter, 'environment')}>
                          {buildParameter(run, jenkinsBinding?.environmentParameter, 'environment')}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            <StatusDot status={run.status} />
                            {run.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {run.durationMs != null ? `${Math.round(run.durationMs / 1000)}s` : '—'}
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
                      <TableRow>
                        <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                          {entry?.loading ? '加载运行记录…' : entry?.error ? `查询失败：${entry.error}` : '暂无 Jenkins 运行记录，请先选择 Jenkins Job 并构建'}
                        </TableCell>
                      </TableRow>
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
