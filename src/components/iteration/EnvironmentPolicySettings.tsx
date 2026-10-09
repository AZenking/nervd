import { useEffect, useState } from 'react';
import { Link2Icon, PlusIcon, RefreshCwIcon, Trash2Icon, WorkflowIcon } from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import type { JenkinsConnection, RepoCiBinding, Settings } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '../searchable-select';

/**
 * 环境与策略（nervd-new-ui 基准布局）：
 * Jenkins 实例管理与仓库 CI 绑定均为真实 IPC（保存 / 测试连接 / 验证 Job）。
 */
export function EnvironmentPolicySettings() {
  const { settings, saveAll, setToast, repositories, pipelines, loadPipelines } = useApp();
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
  const [jenkinsTokens, setJenkinsTokens] = useState<Record<string, string>>({});
  const [ciResults, setCiResults] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      const { hasPat: _hasPat, ...rest } = settings;
      setForm(rest);
    }
  }, [settings]);

  useEffect(() => {
    if (settings?.hasPat && !pipelines.length) void loadPipelines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.hasPat]);

  const updateJenkins = (id: string, patch: Partial<JenkinsConnection>) => {
    setForm((f) => ({
      ...f,
      jenkinsConnections: f.jenkinsConnections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
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
        jenkinsConnections: f.jenkinsConnections.filter((c) => c.id !== id),
        repoCiBindings,
      };
    });
    setJenkinsTokens((tokens) => {
      const next = { ...tokens };
      delete next[id];
      return next;
    });
  };

  const testJenkins = async (connection: JenkinsConnection) => {
    setCiResults((r) => ({ ...r, [connection.id]: '连接测试中…' }));
    try {
      const message = await api.testJenkinsConnection(connection, jenkinsTokens[connection.id]);
      setCiResults((r) => ({ ...r, [connection.id]: message }));
    } catch (e) {
      setCiResults((r) => ({ ...r, [connection.id]: `连接失败：${String(e)}` }));
    }
  };

  const verifyJenkinsJob = async (repoId: number, binding: Extract<RepoCiBinding, { provider: 'jenkins' }>) => {
    const key = `repo-${repoId}`;
    setCiResults((r) => ({ ...r, [key]: 'Job 查询中…' }));
    try {
      const job = await api.getJenkinsJob(binding.connectionId, binding.jobFullName);
      setCiResults((r) => ({ ...r, [key]: `Job 有效：${job.fullName}${job.color ? ` · ${job.color}` : ''}` }));
    } catch (e) {
      setCiResults((r) => ({ ...r, [key]: `Job 查询失败：${String(e)}` }));
    }
  };

  const setRepoBinding = (repoId: number, binding: RepoCiBinding | null) => {
    setForm((f) => {
      const repoCiBindings = { ...f.repoCiBindings };
      if (binding) repoCiBindings[String(repoId)] = binding;
      else delete repoCiBindings[String(repoId)];
      return { ...f, repoCiBindings };
    });
  };

  const save = async () => {
    for (const [repoId, binding] of Object.entries(form.repoCiBindings)) {
      if (binding.provider === 'flow' && (binding.pipelineId <= 0 || !binding.pipelineName.trim())) {
        setToast({ text: `仓库 #${repoId} 的云效流水线尚未选定`, kind: 'fail' });
        return;
      }
      if (binding.provider === 'jenkins' &&
          (!form.jenkinsConnections.some((c) => c.id === binding.connectionId) || !binding.jobFullName.trim())) {
        setToast({ text: `仓库 #${repoId} 的 Jenkins 实例或 Job 全路径尚未填写`, kind: 'fail' });
        return;
      }
    }
    setSaving(true);
    try {
      const oldIds = (settings?.jenkinsConnections ?? []).map((c) => c.id);
      await saveAll(form);
      for (const connection of form.jenkinsConnections) {
        const token = jenkinsTokens[connection.id]?.trim();
        if (token) await api.saveJenkinsToken(connection.id, token);
      }
      const currentIds = new Set(form.jenkinsConnections.map((c) => c.id));
      for (const id of oldIds) {
        if (!currentIds.has(id)) await api.deleteJenkinsToken(id);
      }
      setJenkinsTokens({});
      setToast({ text: '环境与策略已保存', kind: 'ok' });
    } catch (e) {
      setToast({ text: `保存失败：${String(e)}`, kind: 'fail' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-xl border bg-card px-6 py-5 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary">
        <p className="text-xs font-medium text-primary">工作区设置</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">环境与策略</h1>
            <p className="mt-2 text-sm text-muted-foreground">集中管理持续集成服务与仓库流水线绑定关系</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">CI 集成</Badge>
            <Button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</Button>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><WorkflowIcon className="size-4" />Jenkins 实例</CardTitle>
                <CardDescription className="mt-1">使用用户名和 API Token 连接 Jenkins 服务（Token 存于 macOS Keychain）</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{form.jenkinsConnections.length} 个实例</Badge>
                <Button
                  variant="outline" size="sm"
                  onClick={() => {
                    const id = crypto.randomUUID().replace(/-/g, '');
                    setForm((f) => ({ ...f, jenkinsConnections: [...f.jenkinsConnections, { id, name: '', baseUrl: '', username: '' }] }));
                  }}
                >
                  <PlusIcon data-icon="inline-start" />添加实例
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-5">
            {form.jenkinsConnections.map((connection) => {
              const saved = settings?.jenkinsConnections.find((item) => item.id === connection.id);
              return (
                <div key={connection.id} className="grid gap-2 rounded-lg border bg-muted/20 p-4 md:grid-cols-2">
                  <Input aria-label="Jenkins 实例名称" value={connection.name} placeholder="例如：研发 Jenkins" onChange={(e) => updateJenkins(connection.id, { name: e.target.value })} />
                  <Input aria-label="Jenkins 地址" value={connection.baseUrl} placeholder="https://jenkins.example.com" onChange={(e) => updateJenkins(connection.id, { baseUrl: e.target.value })} />
                  <Input aria-label="Jenkins 用户名" value={connection.username} placeholder="用户名" onChange={(e) => updateJenkins(connection.id, { username: e.target.value })} />
                  <Input aria-label="Jenkins API Token" type="password" value={jenkinsTokens[connection.id] ?? ''} placeholder={saved?.hasToken ? 'Token 已保存（留空保持不变）' : 'API Token'} onChange={(e) => setJenkinsTokens((tokens) => ({ ...tokens, [connection.id]: e.target.value }))} />
                  <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                    <Button variant="outline" size="sm" onClick={() => void testJenkins(connection)}>测试连接</Button>
                    <Button variant="ghost" size="sm" onClick={() => removeJenkins(connection.id)}>
                      <Trash2Icon data-icon="inline-start" />删除
                    </Button>
                    <span className="text-xs text-muted-foreground">{saved?.hasToken ? 'Token 已保存' : '尚未保存 Token'}</span>
                    {ciResults[connection.id] && <span className="text-xs text-muted-foreground">{ciResults[connection.id]}</span>}
                  </div>
                </div>
              );
            })}
            {!form.jenkinsConnections.length && (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">尚未添加 Jenkins 实例</p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><Link2Icon className="size-4" />仓库 CI Job 绑定</CardTitle>
                <CardDescription className="mt-1">每个仓库绑定一个默认 CI（云效 Flow 流水线或 Jenkins Job）</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{Object.keys(form.repoCiBindings).length} 个绑定</Badge>
                <Button variant="outline" size="sm" onClick={() => void loadPipelines()}>
                  <RefreshCwIcon data-icon="inline-start" />刷新流水线
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-5">
            {repositories.map((repo) => {
              const binding = form.repoCiBindings[String(repo.id)];
              const label = repo.pathWithNamespace || repo.name;
              const savedProfile = binding?.provider === 'jenkins'
                ? settings?.jenkinsConnections.find((c) => c.id === binding.connectionId)
                : undefined;
              const formProfile = binding?.provider === 'jenkins'
                ? form.jenkinsConnections.find((c) => c.id === binding.connectionId)
                : undefined;
              const canVerifyJob = Boolean(savedProfile?.hasToken && formProfile
                && savedProfile.baseUrl === formProfile.baseUrl
                && savedProfile.username === formProfile.username);
              return (
                <div key={repo.id} className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{label}</span>
                    <Badge variant={binding ? 'secondary' : 'outline'}>{binding ? '已绑定' : '未绑定'}</Badge>
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
                            ...form.jenkinsConnections.map((c) => ({
                              label: c.name || c.baseUrl || c.id,
                              value: c.id,
                            })),
                          ]}
                        />
                        <Input aria-label={`${label} Jenkins Job 全路径`} value={binding.jobFullName} placeholder="folder/job-name" onChange={(e) => setRepoBinding(repo.id, { ...binding, jobFullName: e.target.value })} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" disabled={!canVerifyJob || !binding.connectionId || !binding.jobFullName.trim()} onClick={() => void verifyJenkinsJob(repo.id, binding)}>验证 Job</Button>
                        {ciResults[`repo-${repo.id}`] && <span className="text-xs text-muted-foreground">{ciResults[`repo-${repo.id}`]}</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {!repositories.length && (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                仓库列表为空，请先在「工作区设置」配置云效连接
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel>说明</FieldLabel>
          <p className="text-xs text-muted-foreground">
            写操作策略、追溯规则与默认仓库在「工作区设置」中管理；此处保存仅涉及 CI 集成。
          </p>
        </Field>
      </FieldGroup>
    </div>
  );
}
