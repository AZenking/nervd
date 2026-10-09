import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { useApp } from '../store/app';
import type { JenkinsConnection, RepoCiBinding, Settings } from '../types';
import {
  CloudIcon,
  GitBranchIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldIcon,
  Trash2Icon,
  WorkflowIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
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
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from './searchable-select';

const SECTIONS = [
  { value: 'connection', label: '云效连接', icon: CloudIcon },
  { value: 'trace', label: '追溯与云效仓库', icon: GitBranchIcon },
  { value: 'ci', label: 'CI 集成', icon: WorkflowIcon },
  { value: 'security', label: '安全', icon: ShieldIcon },
] as const;

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
    branchRuleTemplates: [],
    workitemRepoBranchTemplates: {},
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

  const view = (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">设置</h1>
        <p className="text-sm text-muted-foreground">
          个人访问令牌：云效网页 → 个人设置 → 个人访问令牌；组织 ID 在 devops.aliyun.com/organization/&lt;此处&gt;
        </p>
      </div>

      <Tabs defaultValue="connection" orientation="vertical" className="gap-6">
        <TabsList variant="line" className="h-fit w-52 shrink-0 items-stretch justify-stretch py-1">
          {SECTIONS.map((section) => (
            <TabsTrigger
              key={section.value}
              value={section.value}
              className="h-auto justify-start px-3 py-2"
            >
              <section.icon />
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <TabsContent value="connection">
            <Card>
              <CardHeader>
                <CardTitle>云效连接</CardTitle>
                <CardDescription>令牌与组织信息，用于访问云效 DevOps API。</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="pat" className="gap-1.5">
                      个人访问令牌
                      {settings?.hasPat && <Badge variant="secondary">已保存</Badge>}
                    </FieldLabel>
                    <Input
                      id="pat"
                      type="password"
                      className="font-mono"
                      value={pat}
                      onChange={(e) => setPat(e.target.value)}
                      placeholder={settings?.hasPat ? '已保存（留空则不修改）' : 'agp_…'}
                    />
                    <FieldDescription>令牌仅保存在本机，留空表示保持现有令牌不变。</FieldDescription>
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
                    <FieldDescription>浏览器地址 devops.aliyun.com/organization/&lt;组织 ID&gt; 中的一段。</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="space">默认项目空间</FieldLabel>
                    <div className="flex gap-2">
                      <SearchableSelect
                        id="space"
                        className="min-w-0 flex-1 font-mono"
                        value={form.defaultSpaceIdentifier || null}
                        onValueChange={(v) => setForm({ ...form, defaultSpaceIdentifier: v ?? '' })}
                        items={projectItems.map((it) => ({
                          label: it.label,
                          value: it.value,
                        }))}
                      />
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
                    <FieldDescription>工作项列表从此项目空间读取。</FieldDescription>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trace">
            <Card>
              <CardHeader>
                <CardTitle>追溯与云效仓库</CardTitle>
                <CardDescription>
                  仓库从云效组织获取。这里选择需求未单独关联云效仓库时参与扫描的默认仓库。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="pattern">关联正则</FieldLabel>
                    <Input
                      id="pattern"
                      className="font-mono"
                      value={form.linkPattern}
                      onChange={(e) => setForm({ ...form, linkPattern: e.target.value })}
                    />
                    <FieldDescription>命中后自动关联对应工作项，如 (?:REQ|BUG|TASK)[-_]?(\d+)。</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel>默认云效仓库{repos.length ? `（${repos.length} 个）` : ''}</FieldLabel>
                    <ScrollArea className="h-45 rounded-md border border-border bg-background">
                      <div className="flex flex-col gap-1 p-1.5">
                        {repos.map((r) => (
                          <Label
                            key={r.id}
                            className="cursor-pointer rounded-md px-2 py-1.5 font-normal text-foreground hover:bg-muted"
                          >
                            <Checkbox
                              checked={form.watchedRepos.includes(r.id)}
                              onCheckedChange={() => toggleRepo(r.id)}
                            />
                            <span className="font-mono text-[11px]">{r.pathWithNamespace || r.name}</span>
                          </Label>
                        ))}
                        {!repos.length && (
                          <div className="p-2 text-sm text-muted-foreground">
                            {settings?.hasPat ? '仓库加载中…' : '先保存令牌后自动加载'}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ci">
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Jenkins 实例</CardTitle>
                  <CardDescription>
                    用户名和 API Token 通过 HTTP Basic 认证；Token 保存在 macOS Keychain。
                  </CardDescription>
                  <CardAction>
                    <Button type="button" variant="outline" size="sm" onClick={addJenkins}>
                      <PlusIcon data-icon="inline-start" /> 添加实例
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
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
                              <Trash2Icon data-icon="inline-start" /> 删除
                            </Button>
                            <span className="text-xs text-muted-foreground">{saved?.hasToken ? 'Keychain Token 已保存' : '尚未保存 Token'}</span>
                            {ciResults[connection.id] && <span className="text-xs text-muted-foreground">{ciResults[connection.id]}</span>}
                          </div>
                        </div>
                      );
                    })}
                    {!form.jenkinsConnections.length && <p className="text-sm text-muted-foreground">尚未添加 Jenkins 实例。</p>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>仓库 CI Job 绑定</CardTitle>
                  <CardDescription>
                    每个仓库绑定一个当前 Job；构建记录属于该仓库 Job，不代表由某个需求专属触发。保存 Jenkins 实例和 Token 后可验证 Job 是否存在，全路径使用 folder/subfolder/job 格式。
                  </CardDescription>
                </CardHeader>
                <CardContent>
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
                            <SearchableSelect
                              className="text-xs"
                              ariaLabel={`${label} CI 提供方`}
                              value={binding?.provider ?? 'none'}
                              onValueChange={(v) => {
                                if (!v || v === 'none') setRepoBinding(repo.id, null);
                                else if (v === 'flow') {
                                  const pipeline = pipelines[0];
                                  setRepoBinding(repo.id, { provider: 'flow', pipelineId: pipeline?.pipelineId ?? 0, pipelineName: pipeline?.pipelineName ?? '' });
                                } else {
                                  setRepoBinding(repo.id, { provider: 'jenkins', connectionId: form.jenkinsConnections[0]?.id ?? '', jobFullName: '' });
                                }
                              }}
                              items={[
                                { label: '未绑定', value: 'none' },
                                { label: '云效 Flow', value: 'flow' },
                                { label: 'Jenkins', value: 'jenkins' },
                              ]}
                            />
                          </div>
                          {binding?.provider === 'flow' && (
                            <SearchableSelect
                              className="text-xs"
                              ariaLabel={`${label} 云效流水线`}
                              value={binding.pipelineId ? String(binding.pipelineId) : '__unset'}
                              onValueChange={(v) => {
                                const pipeline = pipelines.find((item) => String(item.pipelineId) === v);
                                setRepoBinding(repo.id, { provider: 'flow', pipelineId: pipeline?.pipelineId ?? 0, pipelineName: pipeline?.pipelineName ?? '' });
                              }}
                              items={[
                                { label: '选择云效流水线', value: '__unset' },
                                ...pipelines.map((pipeline) => ({
                                  label: pipeline.pipelineName,
                                  value: String(pipeline.pipelineId),
                                })),
                              ]}
                            />
                          )}
                          {binding?.provider === 'jenkins' && (
                            <>
                              <div className="grid gap-2 md:grid-cols-[minmax(10rem,0.7fr)_minmax(12rem,1fr)]">
                                <SearchableSelect
                                  className="text-xs"
                                  ariaLabel={`${label} Jenkins 实例`}
                                  value={binding.connectionId || '__unset'}
                                  onValueChange={(v) => setRepoBinding(repo.id, { ...binding, connectionId: v && v !== '__unset' ? v : '' })}
                                  items={[
                                    { label: '选择 Jenkins 实例', value: '__unset' },
                                    ...form.jenkinsConnections.map((connection) => ({
                                      label: connection.name || connection.baseUrl || connection.id,
                                      value: connection.id,
                                    })),
                                  ]}
                                />
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
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>安全</CardTitle>
                <CardDescription>写操作会对云效上的真实资源生效，请谨慎开启。</CardDescription>
              </CardHeader>
              <CardContent>
                <Field orientation="horizontal">
                  <Switch
                    id="allow-write-ops"
                    checked={form.allowWriteOps}
                    onCheckedChange={(v) => setForm({ ...form, allowWriteOps: v })}
                  />
                  <div className="flex flex-col gap-1">
                    <FieldLabel htmlFor="allow-write-ops">允许写操作</FieldLabel>
                    <FieldDescription>建分支 / MR / 合并 / 触发流水线 —— 需写权限令牌</FieldDescription>
                  </div>
                </Field>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-background/95 px-4 py-3 shadow-md backdrop-blur">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button variant="outline" onClick={() => void test()}>
          测试连接
        </Button>
        {connection === 'ok' && (
          <span className="self-center font-mono text-[11px] text-sig-ok">● 已连接</span>
        )}
        {testResult && (
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={testResult}>
            {testResult}
          </p>
        )}
      </div>
    </div>
  );

  if (embedded) return view;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="size-2 rounded-sm bg-primary" />
        <span className="text-sm font-semibold tracking-tight">nervd</span>
        <span className="text-border">/</span>
        <span className="text-sm text-muted-foreground">初始配置</span>
      </header>
      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-muted/20 px-6 py-8">
        {view}
      </main>
    </div>
  );
}
