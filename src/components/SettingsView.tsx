import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { useApp } from '../store/app';
import type { Settings } from '../types';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export function SettingsView({ embedded = false }: { embedded?: boolean }) {
  const { settings, saveAll, setToast, connection } = useApp();
  const [pat, setPat] = useState('');
  const [form, setForm] = useState<Settings>({
    organizationId: '',
    defaultSpaceIdentifier: '',
    linkPattern: '(?:REQ|BUG|TASK)[-_]?(\\d+)',
    watchedRepos: [],
    allowWriteOps: false,
  });
  const [repos, setRepos] = useState<{ id: number; name: string; pathWithNamespace?: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      const { hasPat: _hasPat, ...rest } = settings;
      setForm(rest);
    }
  }, [settings]);

  // 已配置令牌时自动拉取项目与仓库列表，下拉/勾选直接可用
  useEffect(() => {
    if (settings?.hasPat && settings.organizationId) {
      void loadProjects();
      void loadRepos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.hasPat, settings?.organizationId]);

  const loadProjects = async () => {
    try {
      const list = await api.listProjects();
      setProjects(list);
      if (!list.length) setTestResult('未返回项目（检查令牌权限/组织）');
    } catch (e) {
      setTestResult(`项目拉取失败：${String(e)}`);
    }
  };

  const loadRepos = async () => {
    try {
      const list = await api.listRepos();
      setRepos(list);
    } catch (e) {
      setTestResult(`仓库列表获取失败：${String(e)}`);
    }
  };

  const test = async () => {
    setTestResult('测试中…');
    try {
      const orgs = await api.checkConnection();
      setTestResult(orgs.length
        ? `连接正常，可见组织：${orgs.map((o) => o.organizationName).slice(0, 3).join('、')}${orgs.length > 3 ? '…' : ''}`
        : '连接正常，但未返回组织（检查令牌权限）');
    } catch (e) {
      setTestResult(`连接失败：${String(e)}`);
    }
  };

  const save = async () => {
    const space = form.defaultSpaceIdentifier.trim();
    if (space && !/^[0-9a-f]{16,}$/i.test(space)) {
      setTestResult(`✗ 项目空间必须是下拉选择的项目 ID（当前 "${space}" 像是名字）——点「拉取项目」后从下拉选`);
      return;
    }
    setSaving(true);
    try {
      await saveAll(form, pat.trim() || undefined);
      setToast({ text: '设置已保存', kind: 'ok' });
    } catch (e) {
      setToast({ text: `保存失败：${String(e)}`, kind: 'fail' });
    } finally {
      setSaving(false);
    }
  };

  const toggleRepo = (id: number) => {
    setForm((f) => ({
      ...f,
      watchedRepos: f.watchedRepos.includes(id)
        ? f.watchedRepos.filter((x) => x !== id)
        : [...f.watchedRepos, id],
    }));
  };

  // Base UI Select 数据源（value:null 项即占位）
  const projectItems = [
    {
      label: projects.length ? '— 选择项目 —' : settings?.hasPat ? '项目加载中…/点击刷新' : '先保存令牌后自动加载',
      value: null,
    },
    ...projects.map((p) => ({ label: p.name, value: p.id })),
  ];

  const card = (
    <Card className={cn('w-full min-w-0 max-w-[560px] border-line')}>
      <CardHeader>
        <CardTitle className="text-base">nervd 设置</CardTitle>
        <CardDescription>
          个人访问令牌：云效网页 → 个人设置 → 个人访问令牌；组织 ID 在 devops.aliyun.com/organization/&lt;此处&gt;
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pat">
              个人访问令牌{' '}
              {settings?.hasPat && <span className="text-sig-ok">[已保存]</span>}
            </FieldLabel>
            <Input
              id="pat"
              type="password"
              className="font-mono"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder={settings?.hasPat ? '已保存（留空则不修改）' : 'agp_…'}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="org">组织 ID</FieldLabel>
            <Input
              id="org"
              className="font-mono"
              value={form.organizationId}
              onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
              placeholder="60de7a68…"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="space">默认项目空间</FieldLabel>
            <div className="flex gap-2">
              <Select
                items={projectItems}
                value={form.defaultSpaceIdentifier}
                onValueChange={(v) => setForm({ ...form, defaultSpaceIdentifier: v ?? '' })}
              >
                <SelectTrigger id="space" className="min-w-0 flex-1 font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {projectItems.map((it) => (
                      <SelectItem key={it.value ?? '__placeholder__'} value={it.value}>
                        {it.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                title="重新拉取项目列表"
                aria-label="重新拉取项目列表"
                onClick={() => void loadProjects()}
              >
                <RefreshCwIcon />
              </Button>
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="pattern">关联正则（分支/commit/MR 标题 → 工作项）</FieldLabel>
            <Input
              id="pattern"
              className="font-mono"
              value={form.linkPattern}
              onChange={(e) => setForm({ ...form, linkPattern: e.target.value })}
            />
          </Field>

          <Field>
            <FieldLabel>追溯仓库（勾选后参与需求关联扫描{repos.length ? ` · ${repos.length} 个` : ''}）</FieldLabel>
            <ScrollArea className="h-45 rounded-none border border-line">
              <div className="flex flex-col gap-1 p-1.5">
                {repos.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-ink-1"
                  >
                    <Checkbox
                      checked={form.watchedRepos.includes(r.id)}
                      onCheckedChange={() => toggleRepo(r.id)}
                    />
                    <span className="font-mono text-[11px]">{r.pathWithNamespace || r.name}</span>
                  </label>
                ))}
                {!repos.length && (
                  <div className="p-1 text-[11px] text-ink-2">
                    {settings?.hasPat ? '仓库加载中…' : '先保存令牌后自动加载'}
                  </div>
                )}
              </div>
            </ScrollArea>
          </Field>

          <FieldSet>
            <FieldLegend variant="label">写操作</FieldLegend>
            <Field orientation="horizontal">
              <Switch
                id="allow-write-ops"
                checked={form.allowWriteOps}
                onCheckedChange={(v) => setForm({ ...form, allowWriteOps: v })}
              />
              <FieldLabel htmlFor="allow-write-ops" className="font-normal text-xs">
                允许写操作（建分支 / MR / 合并 / 触发流水线 / 回写状态 —— 需写权限令牌）
              </FieldLabel>
              <FieldDescription className="sr-only">写操作门控开关</FieldDescription>
            </Field>
          </FieldSet>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? '保存中…' : '保存'}
            </Button>
            <Button variant="outline" onClick={() => void test()}>
              测试连接
            </Button>
            {connection === 'ok' && (
              <span className="self-center font-mono text-[11px] text-sig-ok">● 已连接</span>
            )}
          </div>
          {testResult && <p className="mt-2.5 font-mono text-[11px] text-ink-1">{testResult}</p>}
        </FieldGroup>
      </CardContent>
    </Card>
  );

  if (embedded) return card;
  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-3.5 border-b border-line bg-card px-3 select-none">
        <span className="flex items-center gap-2 font-mono text-[13px] font-medium tracking-wide text-ink-0">
          <span className="inline-block size-[7px] translate-y-px bg-primary" />
          nervd
        </span>
        <span className="font-mono text-[11px] text-ink-2">初始配置</span>
      </div>
      <div className="flex h-[calc(100%-36px)] justify-center overflow-y-auto py-10 px-5">{card}</div>
    </>
  );
}
