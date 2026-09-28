import { useState } from 'react';
import * as api from '../lib/api';
import { useApp } from '../store/app';
import type { WorkitemSummary } from '../types';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  const { selectedId, detail, comments, loadingDetail, items, settings } = useApp();
  const cur: WorkitemSummary | undefined = items.find((i) => i.workitemId === selectedId);

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

  if (!selectedId) return <div className="overflow-y-auto py-10 text-center font-mono text-xs text-ink-2">← 选择一个工作项</div>;
  if (loadingDetail) return <div className="overflow-y-auto py-10 text-center font-mono text-xs text-ink-2">加载详情…</div>;

  const kv: [string, string][] = [
    ['状态', cur?.status || s('status') || '—'],
    ['处理人', cur?.assignedTo || s('assignedTo') || '—'],
    ['项目', cur?.spaceName || s('spaceName') || '—'],
    ['更新', cur?.updatedAt || s('updatedAt') || '—'],
  ];

  return (
    <div className="h-full min-h-0 overflow-y-auto border-x border-line">
      <div className="border-b border-line px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2">
          {cur?.identifier && (
            <Badge variant="outline" className="border-transparent bg-transparent font-mono text-sig-run">
              {cur.identifier}
            </Badge>
          )}
          <h2 className="text-[15px] leading-normal font-semibold text-ink-0">
            {s('subject') || cur?.subject}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
        {kv.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] tracking-wide uppercase text-ink-2">{k}</div>
            <div className="flex items-center gap-1.5 font-mono text-xs text-ink-0">
              {k === '状态' && <StatusDot status={cur?.status} />}
              {v}
            </div>
          </div>
        ))}
      </div>

      <div className="max-h-[30%] overflow-y-auto px-4 py-3 text-[12.5px] whitespace-pre-wrap text-ink-1">
        {s('description') || s('content') || '（无描述）'}
      </div>

      <Separator className="bg-line" />

      <div className="p-2.5 px-3">
        <Card className="gap-3 rounded-none border border-line bg-bg-1 py-3">
          <CardHeader>
            <CardTitle className="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-2">
              代码操作
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="branch">
              <TabsList className="w-full">
                <TabsTrigger value="branch" className="flex-1 text-xs">建分支</TabsTrigger>
                <TabsTrigger value="mr" className="flex-1 text-xs">建 MR</TabsTrigger>
                <TabsTrigger value="status" className="flex-1 text-xs">回写状态</TabsTrigger>
              </TabsList>
              <TabsContent value="branch" className="mt-3">
                <BranchForm identifier={cur?.identifier ?? ''} />
              </TabsContent>
              <TabsContent value="mr" className="mt-3">
                <MrForm identifier={cur?.identifier ?? ''} subject={cur?.subject ?? ''} />
              </TabsContent>
              <TabsContent value="status" className="mt-3">
                <StatusForm workitemId={selectedId} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="px-3 pb-2.5">
        <Card className="gap-3 rounded-none border border-line bg-bg-1 py-3">
          <CardHeader>
            <CardTitle className="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-2">
              评论
              <Badge variant="secondary" className="ml-1 font-mono">{comments.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {(comments as Record<string, unknown>[]).map((c, i) => (
              <div key={i} className="mx-2 border-l-2 border-line bg-bg-1 px-2.5 py-1.5 font-mono text-[11.5px]">
                <span className="text-ink-0">{String((c.author as Record<string, unknown>)?.name ?? c.creator ?? '—')}</span>
                <span className="text-ink-2"> · {String(c.createdAt ?? c.gmtCreate ?? '')}</span>
                <div className="whitespace-pre-wrap text-ink-1">{String(c.content ?? '')}</div>
              </div>
            ))}
            {!comments.length && <div className="p-3 text-center font-mono text-xs text-ink-2">无评论</div>}
          </CardContent>
        </Card>
      </div>

      {settings?.allowWriteOps === false && (
        <div className="px-4 pb-4 font-mono text-[11px] text-ink-2">
          写操作未开启：设置 → 允许写操作
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

function BranchForm({ identifier }: { identifier: string }) {
  const { settings, setToast, loadTrace } = useApp();
  const repos = settings?.watchedRepos ?? [];
  const [repoId, setRepoId] = useState(repos[0] ?? 0);
  const [name, setName] = useState(identifier ? `feature/${identifier}` : '');
  const [refName, setRefName] = useState('master');
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

function MrForm({ identifier, subject }: { identifier: string; subject: string }) {
  const { settings, setToast, loadTrace } = useApp();
  const repos = settings?.watchedRepos ?? [];
  const [repoId, setRepoId] = useState(repos[0] ?? 0);
  const [src, setSrc] = useState(identifier ? `feature/${identifier}` : '');
  const [tgt, setTgt] = useState('master');
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

function StatusForm({ workitemId }: { workitemId: string }) {
  const { setToast } = useApp();
  const [st, setSt] = useState('');
  return (
    <FieldGroup className="gap-3">
      <Field>
        <FieldLabel htmlFor="status-id" className="sr-only">statusIdentifier</FieldLabel>
        <Input id="status-id" className="font-mono" value={st} onChange={(e) => setSt(e.target.value)} placeholder="statusIdentifier" />
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
