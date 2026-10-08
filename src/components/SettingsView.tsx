import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { useApp } from '../store/app';
import type { JenkinsConnection, RepoCiBinding, Settings } from '../types';
import { PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
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
    workitemRepos: {},
    jenkinsConnections: [],
    repoCiBindings: {},
  });
  const [repos, setRepos] = useState<{ id: number; name: string; pathWithNamespace?: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [pipelines, setPipelines] = useState<{ pipelineId: number; pipelineName: string }[]>([]);
  const [jenkinsTokens, setJenkinsTokens] = useState<Record<string, string>>({});
  const [ciResults, setCiResults] = useState<Record<string, string>>({});
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
      void api.listPipelines(100).then(setPipelines).catch((e) => {
        setTestResult(`云效流水线列表获取失败：${String(e)}`);
      });
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
    for (const [repoId, binding] of Object.entries(form.repoCiBindings)) {
      if (binding.provider === 'flow' && (binding.pipelineId <= 0 || !binding.pipelineName.trim())) {
        setTestResult(`仓库 #${repoId} 的云效流水线尚未选定`);
        return;
      }
      if (binding.provider === 'jenkins' &&
          (!form.jenkinsConnections.some((connection) => connection.id === binding.connectionId) || !binding.jobFullName.trim())) {
        setTestResult(`仓库 #${repoId} 的 Jenkins 实例或 Job 全路径尚未填写`);
        return;
      }
    }
    setSaving(true);
    try {
      const oldJenkinsIds = (settings?.jenkinsConnections ?? []).map((connection) => connection.id);
      await saveAll(form, pat.trim() || undefined);
      for (const connection of form.jenkinsConnections) {
        const token = jenkinsTokens[connection.id]?.trim();
        if (token) await api.saveJenkinsToken(connection.id, token);
      }
      const currentIds = new Set(form.jenkinsConnections.map((connection) => connection.id));
      for (const id of oldJenkinsIds) {
        if (!currentIds.has(id)) await api.deleteJenkinsToken(id);
      }
      const refreshed = await api.getSettings();
      const { hasPat: _hasPat, ...refreshedForm } = refreshed;
      setForm(refreshedForm);
      useApp.setState({ settings: refreshed });
      const currentStore = useApp.getState();
      await Promise.all((currentStore.trace?.repositories ?? []).map((repo) => currentStore.loadRepoCi(repo.repoId)));
      setJenkinsTokens({});
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

  const addJenkins = () => {
    const id = crypto.randomUUID().replace(/-/g, '');
    setForm((f) => ({
      ...f,
      jenkinsConnections: [...f.jenkinsConnections, { id, name: '', baseUrl: '', username: '' }],
    }));
  };

  const updateJenkins = (id: string, patch: Partial<JenkinsConnection>) => {
    setForm((f) => ({
      ...f,
      jenkinsConnections: f.jenkinsConnections.map((connection) =>
        connection.id === id ? { ...connection, ...patch } : connection),
    }));
  };

  const removeJenkins = (id: string) => {
    setForm((f) => {
      const repoCiBindings = { ...f.repoCiBindings };
      for (const [repoId, binding] of Object.entries(repoCiBindings)) {
        if (binding.provider === 'jenkins' && binding.connectionId === id) delete repoCiBindings[repoId];
      }
      return {
        ...f,
        jenkinsConnections: f.jenkinsConnections.filter((connection) => connection.id !== id),
        repoCiBindings,
      };
    });
    setJenkinsTokens((tokens) => {
      const next = { ...tokens };
      delete next[id];
      return next;
    });
  };

  const setRepoBinding = (repoId: number, binding: RepoCiBinding | null) => {
    setForm((f) => {
      const repoCiBindings = { ...f.repoCiBindings };
      if (binding) repoCiBindings[String(repoId)] = binding;
      else delete repoCiBindings[String(repoId)];
      return { ...f, repoCiBindings };
    });
  };

  const testJenkins = async (connection: JenkinsConnection) => {
    setCiResults((result) => ({ ...result, [connection.id]: '连接测试中…' }));
    try {
      const message = await api.testJenkinsConnection(connection, jenkinsTokens[connection.id]);
      setCiResults((result) => ({ ...result, [connection.id]: message }));
    } catch (e) {
      setCiResults((result) => ({ ...result, [connection.id]: `连接失败：${String(e)}` }));
    }
  };

  const verifyJenkinsJob = async (repoId: number, binding: Extract<RepoCiBinding, { provider: 'jenkins' }>) => {
    const key = `repo-${repoId}`;
    setCiResults((result) => ({ ...result, [key]: 'Job 查询中…' }));
    try {
      const job = await api.getJenkinsJob(binding.connectionId, binding.jobFullName);
      setCiResults((result) => ({ ...result, [key]: `Job 有效：${job.fullName}${job.color ? ` · ${job.color}` : ''}` }));
    } catch (e) {
      setCiResults((result) => ({ ...result, [key]: `Job 查询失败：${String(e)}` }));
    }
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
    <Card className={cn('w-full min-w-0 max-w-[860px]')}>
      <CardHeader>
        <CardTitle className="text-xl">nervd 设置</CardTitle>
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
            <FieldLabel>默认仓库（需求未单独配置关联时参与扫描{repos.length ? ` · ${repos.length} 个` : ''}）</FieldLabel>
            <ScrollArea className="h-45 rounded-md border border-border bg-background">
              <div className="flex flex-col gap-1 p-1.5">
                {repos.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted"
                  >
                    <Checkbox
                      checked={form.watchedRepos.includes(r.id)}
                      onCheckedChange={() => toggleRepo(r.id)}
                    />
                    <span className="font-mono text-[11px]">{r.pathWithNamespace || r.name}</span>
                  </label>
                ))}
                {!repos.length && (
                  <div className="p-2 text-sm text-muted-foreground">
                    {settings?.hasPat ? '仓库加载中…' : '先保存令牌后自动加载'}
                  </div>
                )}
              </div>
            </ScrollArea>
          </Field>

          <FieldSet>
            <div className="flex items-center justify-between gap-3">
              <FieldLegend variant="label">Jenkins 实例</FieldLegend>
              <Button type="button" variant="outline" size="sm" onClick={addJenkins}>
                <PlusIcon /> 添加实例
              </Button>
            </div>
            <FieldDescription>用户名和 API Token 通过 HTTP Basic 认证；Token 保存在 macOS Keychain。</FieldDescription>
            <div className="flex flex-col gap-3">
              {form.jenkinsConnections.map((connection) => {
                const saved = settings?.jenkinsConnections.find((item) => item.id === connection.id);
                return (
                  <div key={connection.id} className="grid gap-2 rounded-md border border-border bg-background p-3 md:grid-cols-2">
                    <Input aria-label="Jenkins 实例名称" value={connection.name} placeholder="实例名称" onChange={(e) => updateJenkins(connection.id, { name: e.target.value })} />
                    <Input aria-label="Jenkins 地址" value={connection.baseUrl} placeholder="https://jenkins.example.com" onChange={(e) => updateJenkins(connection.id, { baseUrl: e.target.value })} />
                    <Input aria-label="Jenkins 用户名" value={connection.username} placeholder="用户名" onChange={(e) => updateJenkins(connection.id, { username: e.target.value })} />
                    <Input aria-label="Jenkins API Token" type="password" value={jenkinsTokens[connection.id] ?? ''} placeholder={saved?.hasToken ? 'Token 已保存（留空保持不变）' : 'API Token'} onChange={(e) => setJenkinsTokens((tokens) => ({ ...tokens, [connection.id]: e.target.value }))} />
                    <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void testJenkins(connection)}>测试连接</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeJenkins(connection.id)}>
                        <Trash2Icon /> 删除
                      </Button>
                      <span className="text-xs text-muted-foreground">{saved?.hasToken ? 'Keychain Token 已保存' : '尚未保存 Token'}</span>
                      {ciResults[connection.id] && <span className="text-xs text-muted-foreground">{ciResults[connection.id]}</span>}
                    </div>
                  </div>
                );
              })}
              {!form.jenkinsConnections.length && <p className="text-sm text-muted-foreground">尚未添加 Jenkins 实例。</p>}
            </div>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">仓库当前 CI Job</FieldLegend>
            <FieldDescription>每个仓库绑定一个当前 Job；构建记录属于该仓库 Job，不代表由某个需求专属触发。</FieldDescription>
            <FieldDescription>保存 Jenkins 实例和 Token 后，可验证 Job 是否存在；全路径使用 folder/subfolder/job 格式。</FieldDescription>
            <div className="flex flex-col gap-3">
              {repos.map((repo) => {
                const binding = form.repoCiBindings[String(repo.id)];
                const label = repo.pathWithNamespace || repo.name;
                const savedProfile = binding?.provider === 'jenkins'
                  ? settings?.jenkinsConnections.find((connection) => connection.id === binding.connectionId)
                  : undefined;
                const formProfile = binding?.provider === 'jenkins'
                  ? form.jenkinsConnections.find((connection) => connection.id === binding.connectionId)
                  : undefined;
                const canVerifyJob = Boolean(savedProfile?.hasToken && formProfile
                  && savedProfile.baseUrl === formProfile.baseUrl
                  && savedProfile.username === formProfile.username);
                return (
                  <div key={repo.id} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{label}</span>
                      <select
                        aria-label={`${label} CI 提供方`}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                        value={binding?.provider ?? 'none'}
                        onChange={(e) => {
                          if (e.target.value === 'none') setRepoBinding(repo.id, null);
                          else if (e.target.value === 'flow') {
                            const pipeline = pipelines[0];
                            setRepoBinding(repo.id, { provider: 'flow', pipelineId: pipeline?.pipelineId ?? 0, pipelineName: pipeline?.pipelineName ?? '' });
                          } else {
                            setRepoBinding(repo.id, { provider: 'jenkins', connectionId: form.jenkinsConnections[0]?.id ?? '', jobFullName: '' });
                          }
                        }}
                      >
                        <option value="none">未绑定</option>
                        <option value="flow">云效 Flow</option>
                        <option value="jenkins">Jenkins</option>
                      </select>
                    </div>
                    {binding?.provider === 'flow' && (
                      <select
                        aria-label={`${label} 云效流水线`}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                        value={binding.pipelineId ? String(binding.pipelineId) : ''}
                        onChange={(e) => {
                          const pipeline = pipelines.find((item) => String(item.pipelineId) === e.target.value);
                          setRepoBinding(repo.id, { provider: 'flow', pipelineId: pipeline?.pipelineId ?? 0, pipelineName: pipeline?.pipelineName ?? '' });
                        }}
                      >
                        <option value="">选择云效流水线</option>
                        {pipelines.map((pipeline) => <option key={pipeline.pipelineId} value={String(pipeline.pipelineId)}>{pipeline.pipelineName}</option>)}
                      </select>
                    )}
                    {binding?.provider === 'jenkins' && (
                      <>
                        <div className="grid gap-2 md:grid-cols-[minmax(10rem,0.7fr)_minmax(12rem,1fr)]">
                          <select
                            aria-label={`${label} Jenkins 实例`}
                            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                            value={binding.connectionId}
                            onChange={(e) => setRepoBinding(repo.id, { ...binding, connectionId: e.target.value })}
                          >
                            <option value="">选择 Jenkins 实例</option>
                            {form.jenkinsConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name || connection.baseUrl || connection.id}</option>)}
                          </select>
                          <Input aria-label={`${label} Jenkins Job 全路径`} value={binding.jobFullName} placeholder="folder/job-name" onChange={(e) => setRepoBinding(repo.id, { ...binding, jobFullName: e.target.value })} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="outline" size="sm" disabled={!canVerifyJob || !binding.connectionId || !binding.jobFullName.trim()} onClick={() => void verifyJenkinsJob(repo.id, binding)}>验证 Job</Button>
                          {ciResults[`repo-${repo.id}`] && <span className="text-xs text-muted-foreground">{ciResults[`repo-${repo.id}`]}</span>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {!repos.length && <p className="text-sm text-muted-foreground">先配置云效令牌并加载仓库。</p>}
            </div>
          </FieldSet>

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
          {testResult && <p className="mt-3 text-sm text-muted-foreground">{testResult}</p>}
        </FieldGroup>
      </CardContent>
    </Card>
  );

  if (embedded) return card;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="size-2 rounded-sm bg-primary" />
        <span className="text-sm font-semibold tracking-tight">nervd</span>
        <span className="text-border">/</span>
        <span className="text-sm text-muted-foreground">初始配置</span>
      </header>
      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-muted/20 px-6 py-8">
        {card}
      </main>
    </div>
  );
}
