import { useEffect, useMemo, useState } from 'react';
import {
  CheckIcon, ChevronDownIcon, GitBranchIcon, SearchIcon, WorkflowIcon, XIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import type { WorkitemChild, WorkitemStatusOption } from '@/lib/api';
import { extractRichImageUrls, imagePlaceholderLine, richTextToPlain } from '@/lib/richtext';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { CATEGORY_LABELS, type Category, type RepoSummary } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusDot } from '../StatusDot';
import { WriteOpButton } from '../WriteOpButton';

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-sm font-semibold" title={value}>{value}</p>
    </div>
  );
}

/** 无 cmdk 的可搜索选择器：Popover + 过滤列表，交互与 v0 Command 版一致 */
function SearchableSelect({
  value, onValueChange, options, placeholder,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState('');
  const filtered = options.filter((o) => o.toLowerCase().includes(kw.trim().toLowerCase()));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className="w-full justify-between font-normal" />}>
        <span className={value ? '' : 'text-muted-foreground'}>{value || placeholder}</span>
        <ChevronDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--anchor-width)] p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 opacity-50" />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder={placeholder}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => { onValueChange(option); setOpen(false); setKw(''); }}
              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="truncate">{option}</span>
              {value === option && <CheckIcon className="size-4 shrink-0" />}
            </button>
          ))}
          {!filtered.length && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">没有匹配结果</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 描述区：纯文本 + 附件图片内联直显（代理失败/未返回时保留 📎 占位行） */
function RichDescription({ raw }: { raw: unknown }) {
  const images = useMemo(() => extractRichImageUrls(raw), [raw]);
  const [resolved, setResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    setResolved({});
    if (!images.length) return;
    void Promise.all(
      images.map(async (img): Promise<[string, string] | null> => {
        try {
          const dataUrl = await api.proxyWorkitemFile(img.url);
          return [img.url, dataUrl];
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const r of results) if (r) next[r[0]] = r[1];
      setResolved(next);
    });
    return () => { alive = false; };
  }, [images]);

  const resolvedPlaceholders = useMemo(
    () => new Set(images.filter((img) => resolved[img.url]).map((img) => imagePlaceholderLine(img.name))),
    [images, resolved],
  );
  const text = useMemo(() => {
    const t = richTextToPlain(raw);
    if (!resolvedPlaceholders.size) return t;
    return t.split('\n').filter((line) => !resolvedPlaceholders.has(line.trim())).join('\n');
  }, [raw, resolvedPlaceholders]);

  return (
    <div>
      <div className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/85">{text || '（无描述）'}</div>
      {images.filter((img) => resolved[img.url]).length > 0 && (
        <div className="mt-4 flex flex-col items-start gap-3">
          {images.filter((img) => resolved[img.url]).map((img) => (
            <img key={img.url} src={resolved[img.url]} alt={img.name} title={img.name} className="h-auto max-h-64 w-auto max-w-full border border-border" />
          ))}
        </div>
      )}
    </div>
  );
}

function RepoSelect({ repos, value, onChange }: { repos: number[]; value: number; onChange: (v: number) => void }) {
  if (repos.length < 2) return null;
  const items = repos.map((id) => ({ label: `仓库 #${id}`, value: String(id) }));
  return (
    <div className="mb-2">
      <Select items={items} value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function BranchForm({ identifier, repoIds }: { identifier: string; repoIds?: number[] }) {
  const { settings, setToast, loadTrace } = useApp();
  const repos = repoIds ?? settings?.watchedRepos ?? [];
  const [repoId, setRepoId] = useState(repos[0] ?? 0);
  const [name, setName] = useState(identifier ? `feature/${identifier}` : '');
  const [refName, setRefName] = useState('master');
  useEffect(() => {
    if (!repos.includes(repoId)) setRepoId(repos[0] ?? 0);
  }, [repos, repoId]);
  if (!repos.length) return <p className="text-sm text-muted-foreground">请先为此需求关联仓库，或在设置中选择默认仓库。</p>;
  return (
    <FieldGroup className="gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel htmlFor="branch-name" className="sr-only">分支名</FieldLabel>
          <Input id="branch-name" className="font-mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="feature/REQ-xxx" />
        </Field>
        <Field>
          <FieldLabel htmlFor="branch-ref" className="sr-only">基准分支</FieldLabel>
          <Input id="branch-ref" className="font-mono" value={refName} onChange={(e) => setRefName(e.target.value)} placeholder="基准分支" />
        </Field>
      </div>
      <RepoSelect repos={repos} value={repoId} onChange={setRepoId} />
      <WriteOpButton
        label="建分支"
        onAction={async () => {
          try {
            await api.createBranch(repoId, name, refName);
            setToast({ text: `分支已创建：${name}`, kind: 'ok' });
            void loadTrace();
          } catch (e) { setToast({ text: String(e), kind: 'fail' }); }
        }}
      />
    </FieldGroup>
  );
}

function MrForm({ identifier, subject, repoIds }: { identifier: string; subject: string; repoIds?: number[] }) {
  const { settings, setToast, loadTrace } = useApp();
  const repos = repoIds ?? settings?.watchedRepos ?? [];
  const [repoId, setRepoId] = useState(repos[0] ?? 0);
  const [src, setSrc] = useState(identifier ? `feature/${identifier}` : '');
  const [tgt, setTgt] = useState('master');
  useEffect(() => {
    if (!repos.includes(repoId)) setRepoId(repos[0] ?? 0);
  }, [repos, repoId]);
  if (!repos.length) return <p className="text-sm text-muted-foreground">请先为此需求关联仓库，或在设置中选择默认仓库。</p>;
  return (
    <FieldGroup className="gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel htmlFor="mr-src" className="sr-only">源分支</FieldLabel>
          <Input id="mr-src" className="font-mono" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="源分支" />
        </Field>
        <Field>
          <FieldLabel htmlFor="mr-tgt" className="sr-only">目标分支</FieldLabel>
          <Input id="mr-tgt" className="font-mono" value={tgt} onChange={(e) => setTgt(e.target.value)} placeholder="目标分支" />
        </Field>
      </div>
      <RepoSelect repos={repos} value={repoId} onChange={setRepoId} />
      <WriteOpButton
        label="建 MR"
        onAction={async () => {
          try {
            await api.createMergeRequest({
              repoId, title: `${identifier} ${subject}`.trim(), sourceBranch: src, targetBranch: tgt,
              description: `关联工作项：${identifier}`,
            });
            setToast({ text: 'MR 已创建', kind: 'ok' });
            void loadTrace();
          } catch (e) { setToast({ text: String(e), kind: 'fail' }); }
        }}
      />
    </FieldGroup>
  );
}

function StatusForm({ workitemId, category }: { workitemId: string; category?: Category }) {
  const { setToast } = useApp();
  const [st, setSt] = useState('');
  const [options, setOptions] = useState<WorkitemStatusOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    let alive = true;
    setOptions([]);
    setManual(false);
    if (!category) { setManual(true); return; }
    setLoading(true);
    api.listWorkitemStatus(category)
      .then((opts) => {
        if (!alive) return;
        if (opts.length) setOptions(opts);
        else setManual(true);
      })
      .catch((e) => {
        if (!alive) return;
        setManual(true);
        setToast({ text: `工作流状态接口不可用，已回退手输：${String(e)}`, kind: 'fail' });
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [category, setToast]);

  const items = options.map((o) => ({
    label: o.stageName ? `${o.name}（${o.stageName}）` : o.name,
    value: o.identifier,
  }));

  return (
    <FieldGroup className="gap-3">
      <Field>
        <FieldLabel htmlFor="status-id" className="sr-only">状态</FieldLabel>
        {loading ? (
          <Input id="status-id" disabled className="font-mono" placeholder="加载工作流状态…" />
        ) : manual || !items.length ? (
          <Input id="status-id" className="font-mono" value={st} onChange={(e) => setSt(e.target.value)} placeholder="statusIdentifier" />
        ) : (
          <Select items={items} value={st} onValueChange={(v) => setSt(v ?? '')}>
            <SelectTrigger id="status-id" className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {items.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </Field>
      <WriteOpButton
        label="回写状态"
        onAction={async () => {
          try {
            await api.updateWorkitemStatus(workitemId, st);
            setToast({ text: '状态已回写', kind: 'ok' });
          } catch (e) { setToast({ text: String(e), kind: 'fail' }); }
        }}
      />
    </FieldGroup>
  );
}

/** 子工作项卡片：真实数据（getRelations relationType=SUB），点击子项直接打开其详情 */
function SubtaskCard({ subtasks, error, debug, onSelect }: { subtasks: WorkitemChild[]; error?: string | null; debug?: string | null; onSelect: (workitemId: string) => void }) {
  const labelOf = (category?: string): string | null => {
    const key = (category ?? '').trim();
    return key in CATEGORY_LABELS ? CATEGORY_LABELS[key as Category] : key || null;
  };
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>子任务</CardTitle>
            <CardDescription className="mt-1">来自云效的子工作项（SUB 关联），点击可打开详情</CardDescription>
          </div>
          <Badge variant="outline">{subtasks.length} 项</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-5">
        {subtasks.map((task) => {
          const label = labelOf(task.category);
          return (
            <button
              key={task.identifier}
              type="button"
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
              onClick={() => onSelect(task.identifier)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{task.subject || task.identifier}</span>
                  {label && <Badge variant="outline">{label}</Badge>}
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{task.identifier}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{task.gmtModified || ''}</span>
            </button>
          );
        })}
        {!subtasks.length && !error && (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
            暂无子工作项
          </div>
        )}
        {!subtasks.length && debug && (
          <p className="max-h-20 overflow-y-auto break-all rounded bg-muted/50 px-3 py-2 font-mono text-[10px] leading-4 text-muted-foreground" title="接口原始返回（诊断用）">
            接口返回：{debug}
          </p>
        )}
        {!subtasks.length && error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
            子任务加载失败：{error}
          </div>
        )}
        <p className="text-xs text-muted-foreground">新增子工作项请在云效网页端操作（端内创建接口暂未接入）。</p>
      </CardContent>
    </Card>
  );
}

/** 仓库行：CI 状态真实，分支/差异占位，触发 Jenkins 真实 */
function LinkedRepoRow({ repo }: { repo: RepoSummary }) {
  const { repoCiByRepo, loadRepoCi, setToast } = useApp();
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const [triggering, setTriggering] = useState(false);

  const trigger = () => {
    setTriggering(true);
    api.triggerRepoCi(repo.id)
      .then(() => setToast({ text: `已触发 ${repo.name} 构建`, kind: 'ok' }))
      .catch((e) => setToast({ text: `触发失败：${String(e)}`, kind: 'fail' }))
      .finally(() => { setTriggering(false); void loadRepoCi(repo.id); });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex flex-col">
          <span>{repo.pathWithNamespace || repo.name}</span>
          <span className="text-xs text-muted-foreground">#{repo.id}</span>
        </div>
      </TableCell>
      <TableCell><code className="text-xs text-muted-foreground">—</code></TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5 text-sm">
          <StatusDot status={snapshot?.status} />
          {snapshot?.status ?? (entry?.loading ? '加载中' : '—')}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {(snapshot?.runs ?? []).length ? `最近 ${snapshot!.runs.length} 次` : '—'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Popover>
          <PopoverTrigger render={<Button size="sm" />}>
            <WorkflowIcon className="size-4" />
            触发 CI
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                将触发仓库绑定的 CI（环境与 Job 由「环境与策略」的绑定决定）。
              </p>
              <Button disabled={triggering} onClick={trigger}>
                {triggering ? '触发中…' : '确认触发构建'}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>
    </TableRow>
  );
}

/** 需求/工作项详情（nervd-new-ui 基准布局 + 真实数据/操作） */
export function RequirementDetails() {
  const {
    selectedId, detail, comments, children, childrenError, childrenDebug, loadingDetail, items, settings, repositories,
    saveWorkitemRepos, setToast, select,
  } = useApp();
  const cur = items.find((i) => i.workitemId === selectedId);
  const isRequirement = cur?.category === 'Req';
  const hasRepoOverride = selectedId != null && Object.prototype.hasOwnProperty.call(settings?.workitemRepos ?? {}, selectedId);
  const effectiveRepoIds = hasRepoOverride
    ? settings?.workitemRepos[selectedId!] ?? []
    : settings?.watchedRepos ?? [];
  const [linkDraft, setLinkDraft] = useState('');
  const [savingRepos, setSavingRepos] = useState(false);

  const wi = (detail?.workitem ?? detail ?? {}) as Record<string, unknown>;
  const s = (k: string): string => {
    const v = wi[k];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return typeof o.name === 'string' ? o.name : '';
    }
    return '';
  };

  if (!selectedId) {
    return (
      <div className="mt-16 rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
        在侧栏「迭代」分组或迭代页工作项卡片中选择一项以查看详情
      </div>
    );
  }
  if (loadingDetail) {
    return <div className="mt-16 py-16 text-center text-sm text-muted-foreground">加载详情…</div>;
  }

  const linkedRepos = repositories.filter((r) => effectiveRepoIds.includes(r.id));

  const linkRepository = () => {
    if (!selectedId || !linkDraft) return;
    const repo = repositories.find((r) => (r.pathWithNamespace || r.name) === linkDraft);
    if (!repo || effectiveRepoIds.includes(repo.id)) return;
    setSavingRepos(true);
    void saveWorkitemRepos(selectedId, [...effectiveRepoIds, repo.id])
      .then(() => setToast({ text: `已关联仓库 ${linkDraft}`, kind: 'ok' }))
      .catch((e) => setToast({ text: `仓库关联保存失败：${String(e)}`, kind: 'fail' }))
      .finally(() => { setSavingRepos(false); setLinkDraft(''); });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-xl border bg-card px-6 py-5 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-medium text-primary">{cur?.identifier ?? '工作项'} · 详情</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{s('subject') || cur?.subject}</h1>
            <p className="mt-2 text-sm text-muted-foreground">集中管理工作项上下文、交付任务与仓库构建状态</p>
          </div>
          <Badge variant="secondary">{cur?.status || s('status') || '—'}</Badge>
        </div>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>基本信息</CardTitle>
          <CardDescription>负责人、协作关系与代码分支概览</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="编号" value={cur?.identifier ?? '—'} />
          <InfoItem label="状态" value={cur?.status || s('status') || '—'} />
          <InfoItem label="处理人" value={cur?.assignedTo || s('assignedTo') || '—'} />
          <InfoItem label="项目" value={cur?.spaceName || s('spaceName') || '—'} />
          <InfoItem label="更新" value={cur?.updatedAt || s('updatedAt') || '—'} />
          <InfoItem label="关联仓库" value={`${effectiveRepoIds.length} 个`} />
          <InfoItem label="迭代分支" value="iteration/Benz-20261016（占位）" />
          <InfoItem label="开发分支约定" value={cur?.identifier ? `feature/${cur.identifier}` : 'feature/<编号>'} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>描述</CardTitle>
          <CardDescription>来自云效的富文本描述与内联附件</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <RichDescription raw={wi.description ?? wi.content} />
        </CardContent>
      </Card>

      {isRequirement && (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <SubtaskCard
            subtasks={children}
            error={childrenError}
            debug={childrenDebug}
            onSelect={(workitemId) => void select(workitemId)}
          />
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <CardHeader className="border-b bg-muted/30">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>缺陷</CardTitle>
                  <CardDescription className="mt-1">演示占位 · 关联缺陷需切换到「缺陷」类别查看</CardDescription>
                </div>
                <Badge variant="outline">0 个</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
                暂无关联缺陷数据（待云效关联关系 API 接入）
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><GitBranchIcon className="size-4" />涉及仓库</CardTitle>
              <CardDescription className="mt-1">
                {hasRepoOverride ? '此需求使用单独配置的仓库' : '当前使用设置中的默认仓库；保存选择后将覆盖默认值'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{effectiveRepoIds.length} 个仓库</Badge>
              {hasRepoOverride && (
                <Button
                  variant="outline" size="sm" disabled={savingRepos}
                  onClick={() => {
                    if (!selectedId) return;
                    setSavingRepos(true);
                    void saveWorkitemRepos(selectedId, null)
                      .then(() => setToast({ text: '已恢复默认仓库', kind: 'ok' }))
                      .catch((e) => setToast({ text: `仓库关联保存失败：${String(e)}`, kind: 'fail' }))
                      .finally(() => setSavingRepos(false));
                  }}
                >
                  恢复默认
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Field>
              <FieldLabel>关联新仓库</FieldLabel>
              <SearchableSelect
                value={linkDraft}
                onValueChange={setLinkDraft}
                options={repositories.filter((r) => !effectiveRepoIds.includes(r.id)).map((r) => r.pathWithNamespace || r.name)}
                placeholder="搜索并选择仓库"
              />
            </Field>
            <div className="flex items-end">
              <Button onClick={linkRepository} disabled={!linkDraft || savingRepos}>关联仓库</Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>仓库</TableHead>
                <TableHead>当前分支</TableHead>
                <TableHead>CI 状态</TableHead>
                <TableHead>运行记录</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedRepos.map((repo) => <LinkedRepoRow key={repo.id} repo={repo} />)}
              {!linkedRepos.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                    未关联仓库；可在上方选择后关联，或在设置中选择默认仓库
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>代码操作</CardTitle>
          <CardDescription>建分支 / 建 MR / 回写状态（真实写操作，受只读策略约束）</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <Tabs defaultValue="branch">
            <TabsList className="w-full sm:w-fit">
              <TabsTrigger value="branch" className="flex-1 px-3 text-sm sm:flex-none">建分支</TabsTrigger>
              <TabsTrigger value="mr" className="flex-1 px-3 text-sm sm:flex-none">建 MR</TabsTrigger>
              <TabsTrigger value="status" className="flex-1 px-3 text-sm sm:flex-none">回写状态</TabsTrigger>
            </TabsList>
            <TabsContent value="branch" className="mt-4">
              <BranchForm identifier={cur?.identifier ?? ''} repoIds={isRequirement ? effectiveRepoIds : undefined} />
            </TabsContent>
            <TabsContent value="mr" className="mt-4">
              <MrForm identifier={cur?.identifier ?? ''} subject={cur?.subject ?? ''} repoIds={isRequirement ? effectiveRepoIds : undefined} />
            </TabsContent>
            <TabsContent value="status" className="mt-4">
              <StatusForm workitemId={selectedId} category={cur?.category} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>评论</CardTitle>
          <CardDescription>来自云效的工作项评论</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-5">
          {comments.length ? (
            <div className="divide-y divide-border">
              {(comments as Record<string, unknown>[]).map((c, i) => (
                <article key={i} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-foreground">
                      {String((c.author as Record<string, unknown>)?.name ?? c.creator ?? '—')}
                    </span>
                    <span className="text-xs text-muted-foreground">{String(c.createdAt ?? c.gmtCreate ?? '')}</span>
                  </div>
                  <div className="mt-2 text-sm leading-6 whitespace-pre-wrap text-foreground/85">{String(c.content ?? '')}</div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">暂无评论</div>
          )}
        </CardContent>
      </Card>

      {settings?.allowWriteOps === false && (
        <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground')}>
          <XIcon className="size-3.5" />
          写操作未开启：设置 → 允许写操作
        </p>
      )}
    </div>
  );
}
