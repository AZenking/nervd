import { useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';
import type { WorkitemStatusOption } from '../lib/api';
import { extractRichImageUrls, imagePlaceholderLine, richTextToPlain } from '../lib/richtext';
import { useApp } from '../store/app';
import type { Category, WorkitemSummary } from '../types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusDot } from './StatusDot';
import { WriteOpButton } from './WriteOpButton';

export function WorkitemDetail() {
  const { selectedId, detail, comments, loadingDetail, items, settings, repositories, saveWorkitemRepos, setToast } = useApp();
  const cur: WorkitemSummary | undefined = items.find((i) => i.workitemId === selectedId);
  const isRequirement = cur?.category === 'Req';
  const hasRepoOverride = selectedId != null && Object.prototype.hasOwnProperty.call(settings?.workitemRepos ?? {}, selectedId);
  const effectiveRepoIds = hasRepoOverride
    ? settings?.workitemRepos[selectedId!] ?? []
    : settings?.watchedRepos ?? [];
  const [repoDraft, setRepoDraft] = useState<number[]>(effectiveRepoIds);
  const [savingRepos, setSavingRepos] = useState(false);

  useEffect(() => {
    setRepoDraft(effectiveRepoIds);
  }, [selectedId, settings?.workitemRepos, settings?.watchedRepos]);

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
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
        选择一个工作项以查看详情
      </div>
    );
  }
  if (loadingDetail) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
        加载详情…
      </div>
    );
  }

  const kv: [string, string][] = [
    ['状态', cur?.status || s('status') || '—'],
    ['处理人', cur?.assignedTo || s('assignedTo') || '—'],
    ['项目', cur?.spaceName || s('spaceName') || '—'],
    ['更新', cur?.updatedAt || s('updatedAt') || '—'],
  ];

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background">
      <header className="mx-auto max-w-3xl px-8 pt-10 pb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{cur?.spaceName || '工作项'}</span>
          {cur?.identifier && (
            <>
              <span aria-hidden="true">/</span>
              <Badge variant="secondary" className="font-mono">{cur.identifier}</Badge>
            </>
          )}
        </div>
        <h1 className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-foreground">
          {s('subject') || cur?.subject}
        </h1>
      </header>

      <div className="mx-auto grid max-w-3xl grid-cols-2 gap-x-6 gap-y-4 px-8 py-4 sm:grid-cols-4">
        {kv.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="mt-1 flex items-center gap-1.5 truncate text-sm text-foreground">
              {k === '状态' && <StatusDot status={cur?.status} />}
              <span className="truncate">{v}</span>
            </div>
          </div>
        ))}
      </div>

      <Separator className="mx-auto max-w-3xl" />

      <div className="mx-auto max-w-3xl px-8 py-6 text-sm leading-7 text-foreground/85">
        <RichDescription raw={wi.description ?? wi.content} />
      </div>

      <Separator className="mx-auto max-w-3xl" />

      {isRequirement && (
        <section className="mx-auto max-w-3xl px-8 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">关联仓库</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasRepoOverride ? '此需求使用单独配置的仓库。' : '当前使用设置中的默认仓库；保存选择后将覆盖默认值。'}
              </p>
            </div>
            <div className="flex gap-2">
              {hasRepoOverride && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={savingRepos}
                  onClick={() => {
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
              <Button
                type="button"
                size="sm"
                disabled={savingRepos || (hasRepoOverride && repoDraft.length === effectiveRepoIds.length && repoDraft.every((id) => effectiveRepoIds.includes(id)))}
                onClick={() => {
                  setSavingRepos(true);
                  void saveWorkitemRepos(selectedId, repoDraft)
                    .then(() => setToast({ text: '需求仓库关联已保存', kind: 'ok' }))
                    .catch((e) => setToast({ text: `仓库关联保存失败：${String(e)}`, kind: 'fail' }))
                    .finally(() => setSavingRepos(false));
                }}
              >
                {savingRepos ? '保存中…' : '保存关联'}
              </Button>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-1 rounded-md border border-border bg-muted/20 p-2">
            {repositories.map((repo) => (
              <label key={repo.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox
                  checked={repoDraft.includes(repo.id)}
                  onCheckedChange={(checked) => setRepoDraft((ids) => checked
                    ? ids.includes(repo.id) ? ids : [...ids, repo.id]
                    : ids.filter((id) => id !== repo.id))}
                />
                <span className="font-mono text-xs">{repo.pathWithNamespace || repo.name}</span>
              </label>
            ))}
            {!repositories.length && <p className="px-2 py-3 text-center text-xs text-muted-foreground">仓库列表为空，请先在设置中配置云效连接。</p>}
            {repositories.length > 0 && repoDraft.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">未选择仓库。保存后将显式覆盖默认仓库。</p>}
          </div>
        </section>
      )}

      {isRequirement && <Separator className="mx-auto max-w-3xl" />}

      <section className="mx-auto max-w-3xl px-8 py-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">代码操作</h2>
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
      </section>

      <Separator className="mx-auto max-w-3xl" />

      <section className="mx-auto max-w-3xl px-8 pt-6 pb-10">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">评论</h2>
          <Badge variant="secondary">{comments.length}</Badge>
        </div>
        {comments.length ? (
          <div className="mt-3 divide-y divide-border">
            {(comments as Record<string, unknown>[]).map((c, i) => (
              <article key={i} className="py-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-foreground">
                    {String((c.author as Record<string, unknown>)?.name ?? c.creator ?? '—')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {String(c.createdAt ?? c.gmtCreate ?? '')}
                  </span>
                </div>
                <div className="mt-2 text-sm leading-6 whitespace-pre-wrap text-foreground/85">
                  {String(c.content ?? '')}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-lg bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
            暂无评论
          </div>
        )}
      </section>

      {settings?.allowWriteOps === false && (
        <div className="mx-auto max-w-3xl px-8 pb-6 text-xs text-muted-foreground">
          写操作未开启：设置 → 允许写操作
        </div>
      )}
    </div>
  );
}

/** 描述区：纯文本 + 附件图片内联直显（代理失败/未返回时保留 📎 占位行） */
function RichDescription({ raw }: { raw: unknown }) {
  const images = useMemo(() => extractRichImageUrls(raw), [raw]);
  const [resolved, setResolved] = useState<Record<string, string>>({});

  // 并发代理图片，不阻塞文本渲染；任一失败则该张退回 📎 占位
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
          return null; // 鉴权不可用/超限/非图片等：稳定降级占位
        }
      }),
    ).then((results) => {
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const r of results) if (r) next[r[0]] = r[1];
      setResolved(next);
    });
    return () => {
      alive = false;
    };
  }, [images]);

  // 已成功内联的图片：从纯文本中移除对应 📎 占位行，避免重复
  const resolvedPlaceholders = useMemo(
    () => new Set(images.filter((img) => resolved[img.url]).map((img) => imagePlaceholderLine(img.name))),
    [images, resolved],
  );
  const text = useMemo(() => {
    const t = richTextToPlain(raw);
    if (!resolvedPlaceholders.size) return t;
    return t
      .split('\n')
      .filter((line) => !resolvedPlaceholders.has(line.trim()))
      .join('\n');
  }, [raw, resolvedPlaceholders]);

  return (
    <div>
      <div className="whitespace-pre-wrap break-words">{text || '（无描述）'}</div>
      {images.filter((img) => resolved[img.url]).length > 0 && (
        <div className="mt-4 flex flex-col items-start gap-3">
          {images
            .filter((img) => resolved[img.url])
            .map((img) => (
              <img
                key={img.url}
                src={resolved[img.url]}
                alt={img.name}
                title={img.name}
                className="h-auto max-h-64 w-auto max-w-full border border-border"
              />
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
        <SelectTrigger className="w-full font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((it) => (
              <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
            ))}
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

  // 按当前工作项 category 拉工作流状态；失败/为空时降级回手输 statusIdentifier
  useEffect(() => {
    let alive = true;
    setOptions([]);
    setManual(false);
    if (!category) {
      setManual(true);
      return;
    }
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
            <SelectTrigger id="status-id" className="w-full font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {items.map((it) => (
                  <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
                ))}
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
