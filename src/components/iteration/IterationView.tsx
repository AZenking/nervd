import { useEffect, useState } from 'react';
import {
  GitBranchIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  DatabaseIcon,
  WorkflowIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { PLACEHOLDER_ITERATIONS } from '@/store/ui';
import { CATEGORY_LABELS, type Category, type RepoSummary } from '@/types';
import { StatusDot } from '../StatusDot';

/** 迭代分支来源关系（占位：后端暂无迭代 API） */
const PLACEHOLDER_BRANCH_RELATIONS = [
  { source: 'main', target: 'iteration/Benz-20261016', label: '创建迭代分支' },
  { source: 'dev', target: 'feature/REQ-2048-trace', label: '创建开发分支' },
];

function BranchNode({ label, branch }: { label: string; branch: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <GitBranchIcon className="size-4 shrink-0" />
        <code className="truncate text-xs font-medium">{branch}</code>
      </div>
    </div>
  );
}

function BranchArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground md:flex-col">
      <span className="whitespace-nowrap">{label}</span>
      <ChevronRightIcon className="size-4" />
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-sm font-semibold" title={value}>{value}</p>
    </div>
  );
}

/** 仓库行：CI 状态真实（repoCiByRepo），分支差异为占位 */
function RepositoryRow({ repo }: { repo: RepoSummary }) {
  const { repoCiByRepo, settings } = useApp();
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const binding = settings?.repoCiBindings?.[String(repo.id)];
  const providerLabel = binding?.provider === 'jenkins' ? 'Jenkins' : binding?.provider === 'flow' ? '云效 Flow' : '未绑定';
  const status = snapshot?.status ?? (entry?.loading ? '加载中' : '—');

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex flex-col">
          <span>{repo.pathWithNamespace || repo.name}</span>
          <span className="text-xs text-muted-foreground">#{repo.id} · {providerLabel}</span>
        </div>
      </TableCell>
      <TableCell><code className="text-xs text-muted-foreground">—</code></TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5 text-sm">
          <StatusDot status={status} />
          {status}
        </span>
      </TableCell>
      <TableCell><Badge variant="outline">—</Badge></TableCell>
      <TableCell><Badge variant="outline">—</Badge></TableCell>
      <TableCell className="text-right">
        <RepositoryDrawer repo={repo} />
      </TableCell>
    </TableRow>
  );
}

/** 仓库详情抽屉：构建触发 / 运行记录 / 日志均为真实 IPC */
function RepositoryDrawer({ repo }: { repo: RepoSummary }) {
  const { repoCiByRepo, loadRepoCi, openRepoCiLogs, setToast } = useApp();
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const [triggering, setTriggering] = useState(false);

  const trigger = () => {
    setTriggering(true);
    api.triggerRepoCi(repo.id)
      .then(() => setToast({ text: `已触发 ${repo.name} 构建`, kind: 'ok' }))
      .catch((e) => setToast({ text: `触发失败：${String(e)}`, kind: 'fail' }))
      .finally(() => {
        setTriggering(false);
        void loadRepoCi(repo.id);
      });
  };

  return (
    <Drawer swipeDirection="right">
      <DrawerTrigger render={<Button variant="outline" size="sm" />}>详情与构建</DrawerTrigger>
      <DrawerContent className="[--drawer-content-width:min(48rem,100vw)]">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DrawerTitle>{repo.pathWithNamespace || repo.name}</DrawerTitle>
              <DrawerDescription>仓库 #{repo.id} · CI 运行记录与构建操作</DrawerDescription>
            </div>
            <Badge variant={snapshot?.status === 'SUCCESS' ? 'secondary' : snapshot?.status === 'FAIL' ? 'destructive' : 'outline'}>
              {snapshot?.status ?? '未知'}
            </Badge>
          </div>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 p-4">
            <Card>
              <CardHeader>
                <CardTitle>构建操作</CardTitle>
                <CardDescription>
                  触发仓库绑定的 CI（云效 Flow / Jenkins）；环境与 Job 在「环境与策略」中配置
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={triggering} onClick={trigger}>
                    <WorkflowIcon className="size-4" />
                    {triggering ? '触发中…' : '触发构建'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void loadRepoCi(repo.id)}>
                    <RefreshCwIcon className="size-4" />
                    刷新状态
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">构建参数（环境 / 分支）随仓库 CI 绑定下发，暂不支持逐次覆盖。</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>最近运行</CardTitle>
                <CardDescription>最近 5 次 CI 运行，点击查看日志</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>运行</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>耗时</TableHead>
                      <TableHead className="text-right">日志</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(snapshot?.runs ?? []).map((run) => (
                      <TableRow key={run.runId}>
                        <TableCell className="font-mono text-xs">#{run.runId}</TableCell>
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
                    {!snapshot?.runs.length && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                          {entry?.loading ? '加载运行记录…' : '暂无运行记录（或未绑定 CI）'}
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

/** 迭代视图（nervd-new-ui 基准）：迭代信息 + 分支关系（占位）+ 仓库（真实）+ 需求列表（真实） */
export function IterationView() {
  const { iterationKey, openRequirement } = useUi();
  const { items, repositories, category, setCategory, loadingList, loadList, nextToken, select, loadRepoCi } = useApp();
  const [kw, setKw] = useState('');

  // 进入迭代视图时拉齐仓库 CI 快照（真实 IPC）
  useEffect(() => {
    void Promise.all(repositories.map((repo) => loadRepoCi(repo.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositories]);

  const iteration = PLACEHOLDER_ITERATIONS.find((it) => it.name === iterationKey) ?? PLACEHOLDER_ITERATIONS[0];
  const filtered = items.filter((it) => {
    const k = kw.trim().toLowerCase();
    if (!k) return true;
    return it.subject.toLowerCase().includes(k) || it.identifier.toLowerCase().includes(k);
  });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardDescription>当前迭代（占位数据 · 后端暂未接入云效迭代 API）</CardDescription>
              <CardTitle className="mt-1">{iteration.name}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{iteration.state}</Badge>
              <Button variant="outline" size="sm" onClick={() => void loadList(false)}>
                <RefreshCwIcon className="size-4" />
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{iteration.title}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label="工作项（当前类别）" value={String(items.length)} />
            <InfoItem label="关联仓库" value={`${repositories.length} 个`} />
            <InfoItem label="迭代分支" value="—" />
            <InfoItem label="默认开发分支" value="dev" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>分支来源关系</CardTitle>
          <CardDescription>一个迭代可包含多组来源关系，每组都明确标注源分支和目标分支（演示占位）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-2">
            {PLACEHOLDER_BRANCH_RELATIONS.map((relation) => (
              <div key={`${relation.source}-${relation.target}`} className="grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto_1fr]">
                <BranchNode label="源分支" branch={relation.source} />
                <BranchArrow label={relation.label} />
                <BranchNode label="目标分支" branch={relation.target} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DatabaseIcon className="size-4" />涉及仓库</CardTitle>
          <CardDescription>点击仓库查看 CI 运行记录、日志与构建操作；分支差异待迭代 API 接入后提供</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>仓库</TableHead>
                <TableHead>当前分支</TableHead>
                <TableHead>CI 状态</TableHead>
                <TableHead>相对迭代分支</TableHead>
                <TableHead>相对 dev</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repositories.map((repo) => <RepositoryRow key={repo.id} repo={repo} />)}
              {!repositories.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                    仓库列表为空，请先在设置中配置云效连接并选择关注仓库
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>迭代工作项</CardTitle>
              <CardDescription>{CATEGORY_LABELS[category]} · {filtered.length} 项{loadingList ? ' · 加载中…' : ''}</CardDescription>
            </div>
            <Input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="搜索编号 / 标题"
              className="w-56"
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs value={category} onValueChange={(v) => void setCategory(v as Category)}>
            <TabsList>
              {(['Req', 'Bug', 'Task'] as Category[]).map((c) => (
                <TabsTrigger key={c} value={c}>{CATEGORY_LABELS[c]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((item) => (
              <button
                key={item.workitemId || item.identifier}
                type="button"
                className="flex items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                onClick={() => {
                  void select(item.workitemId);
                  openRequirement();
                }}
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{item.identifier}</p>
                  <p className="mt-1 text-sm font-medium">{item.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.status} · {item.assignedTo}</p>
                </div>
                <StatusDot status={item.status} />
              </button>
            ))}
            {!filtered.length && !loadingList && (
              <div className="col-span-full rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                无匹配工作项{nextToken ? '（可点击下方加载更多）' : ''}
              </div>
            )}
          </div>
          {nextToken && (
            <Button variant="outline" size="sm" className="self-start" onClick={() => void loadList(true)}>
              加载更多
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
