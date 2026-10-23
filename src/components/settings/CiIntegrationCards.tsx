// CI 集成共享区（UX 评审 A1）：Jenkins 实例 + 仓库 CI 绑定只此一份实现，
// CI 集成设置卡，和其他设置区编辑同一份 settings 草稿。
import { useState } from 'react';
import { PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { errorLog, humanizeError } from '@/lib/error-format';
import { cn } from '@/lib/utils';
import type { JenkinsConnection, RepoCiBinding } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchableSelect } from '../searchable-select';
import { SettingsGroup } from './settings-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** Jenkins 实例管理卡（读写设置草稿；测试连接 / 验证 Job 的瞬态结果显示在卡内） */
export function JenkinsInstancesCard() {
  const { settings } = useApp();
  const { draft, jenkinsTokens, addJenkins, updateJenkins, removeJenkins, setJenkinsToken, flushAutoSave, fieldErrors } = useSettingsDraft();
  const [ciResults, setCiResults] = useState<Record<string, string>>({});

  const connections = draft?.jenkinsConnections ?? [];

  const testJenkins = async (connection: JenkinsConnection) => {
    setCiResults((r) => ({ ...r, [connection.id]: '连接测试中…' }));
    try {
      if (jenkinsTokens[connection.id]?.trim()) {
        await flushAutoSave();
      }
      const message = await api.testJenkinsConnection(connection, jenkinsTokens[connection.id]);
      setCiResults((r) => ({ ...r, [connection.id]: message }));
    } catch (e) {
      errorLog('ci-connection-test', e);
      setCiResults((r) => ({ ...r, [connection.id]: `连接失败：${humanizeError(e, '无法建立连接，请检查地址与凭证')}` }));
    }
  };

  return (
    <SettingsGroup
      title="Jenkins 实例"
      description="使用用户名和 API Token 连接 Jenkins 服务（Token 存于 macOS Keychain）"
      action={(
        <Button type="button" variant="outline" size="sm" onClick={addJenkins}>
          <PlusIcon data-icon="inline-start" />
          添加实例
        </Button>
      )}
    >
      {connections.map((connection) => {
        const saved = settings?.jenkinsConnections.find((item) => item.id === connection.id);
        const error = fieldErrors[`jenkins-${connection.id}`];
        const draftToken = jenkinsTokens[connection.id]?.trim();
        const hasSavedToken = Boolean(saved?.hasToken);
        const isTesting = ciResults[connection.id] === '连接测试中…';
        const testResult = ciResults[connection.id];
        const testSuccess = Boolean(testResult && testResult.includes('连接正常'));
        const testFail = Boolean(testResult && testResult.includes('失败'));

        return (
          <div key={connection.id} className="flex flex-col gap-2.5 border-b border-border/50 px-4 py-4 last:border-b-0">
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                aria-label="Jenkins 实例名称"
                value={connection.name}
                placeholder="例如：研发 Jenkins"
                onChange={(e) => updateJenkins(connection.id, { name: e.target.value })}
                onBlur={() => void flushAutoSave()}
              />
              <Input
                aria-label="Jenkins 地址"
                value={connection.baseUrl}
                placeholder="https://jenkins.example.com"
                onChange={(e) => updateJenkins(connection.id, { baseUrl: e.target.value })}
                onBlur={() => void flushAutoSave()}
              />
              <Input
                aria-label="Jenkins 用户名"
                value={connection.username}
                placeholder="用户名"
                onChange={(e) => updateJenkins(connection.id, { username: e.target.value })}
                onBlur={() => void flushAutoSave()}
              />
              <Input
                aria-label="Jenkins API Token"
                type="password"
                value={jenkinsTokens[connection.id] ?? ''}
                placeholder={hasSavedToken ? 'Token 已保存（留空保持不变）' : 'API Token'}
                onChange={(e) => setJenkinsToken(connection.id, e.target.value)}
                onBlur={() => void flushAutoSave()}
              />
              {error && (
                <div className="md:col-span-2">
                  <FieldError>{error}</FieldError>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isTesting}
                  onClick={() => void testJenkins(connection)}
                >
                  测试连接
                </Button>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeJenkins(connection.id)}
                      />
                    }
                  >
                    <Trash2Icon data-icon="inline-start" />
                    删除
                  </TooltipTrigger>
                  <TooltipContent>删除实例，并解除使用它的仓库 CI 绑定</TooltipContent>
                </Tooltip>
                {hasSavedToken ? (
                  <Badge variant="secondary" className="text-xs text-emerald-600 dark:text-emerald-400">
                    Token 已保存
                  </Badge>
                ) : draftToken ? (
                  <span className="text-xs text-amber-500">Token 待保存</span>
                ) : (
                  <span className="text-xs text-muted-foreground">尚未保存 Token</span>
                )}
                {testResult && (
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-xs',
                      testSuccess && 'text-emerald-600 dark:text-emerald-400',
                      testFail && 'text-destructive',
                      !testSuccess && !testFail && 'text-muted-foreground',
                    )}
                  >
                    {testResult}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {!connections.length && (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">尚未添加 Jenkins 实例</div>
      )}
    </SettingsGroup>
  );
}

/** 仓库 CI Job 绑定卡（云效 Flow 流水线 / Jenkins Job，读写设置草稿） */
export function RepoCiBindingsCard() {
  const { settings, repositories, pipelines, loadPipelines } = useApp();
  const { draft, setRepoBinding, fieldErrors, flushAutoSave } = useSettingsDraft();
  const [ciResults, setCiResults] = useState<Record<string, string>>({});

  const bindings = draft?.repoCiBindings ?? {};
  const [repoFilter, setRepoFilter] = useState('');
  const [boundOnly, setBoundOnly] = useState(false);

  const keyword = repoFilter.trim().toLowerCase();
  const boundCount = repositories.filter((repo) => bindings[String(repo.id)]).length;
  const visibleRepos = repositories.filter((repo) => {
    if (boundOnly && !bindings[String(repo.id)]) return false;
    return !keyword || (repo.pathWithNamespace || repo.name).toLowerCase().includes(keyword);
  });

  const verifyJenkinsJob = async (repoId: number, binding: Extract<RepoCiBinding, { provider: 'jenkins' }>) => {
    const key = `repo-${repoId}`;
    setCiResults((r) => ({ ...r, [key]: 'Job 查询中…' }));
    try {
      if (useSettingsDraft.getState().isDirty()) {
        await flushAutoSave();
      }
      const job = await api.getJenkinsJob(binding.connectionId, binding.jobFullName);
      setCiResults((r) => ({ ...r, [key]: `Job 有效：${job.fullName}${job.color ? ` · ${job.color}` : ''}` }));
    } catch (e) {
      errorLog('ci-job-query', e);
      setCiResults((r) => ({ ...r, [key]: `Job 查询失败：${humanizeError(e)}` }));
    }
  };

  return (
    <SettingsGroup
      title="仓库 CI Job 绑定"
      description="每个仓库绑定一个默认 CI（云效 Flow 流水线或 Jenkins Job）；构建记录属于该仓库 Job"
      action={(
        <>
          <Badge variant="outline">{Object.keys(bindings).length} 个绑定</Badge>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadPipelines()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新流水线
          </Button>
        </>
      )}
    >
      {repositories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-3">
          <Input
            aria-label="按仓库名称过滤"
            className="h-8 min-w-40 flex-1 text-xs"
            placeholder="输入名称过滤…"
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
          />
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={boundOnly ? ['bound'] : ['all']}
            onValueChange={(v) => setBoundOnly(v.includes('bound'))}
          >
            <ToggleGroupItem value="bound" className="text-xs">
              已绑定 {boundCount}
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="text-xs">
              全部 {repositories.length}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      {visibleRepos.map((repo) => {
        const binding = bindings[String(repo.id)];
        const label = repo.pathWithNamespace || repo.name;
        const savedProfile = binding?.provider === 'jenkins'
          ? settings?.jenkinsConnections.find((c) => c.id === binding.connectionId)
          : undefined;
        const draftProfile = binding?.provider === 'jenkins'
          ? (draft?.jenkinsConnections ?? []).find((c) => c.id === binding.connectionId)
          : undefined;
        const canVerifyJob = Boolean(savedProfile?.hasToken && draftProfile
          && savedProfile.baseUrl === draftProfile.baseUrl
          && savedProfile.username === draftProfile.username);
        const error = fieldErrors[`repo-${repo.id}`];
        return (
          <div key={repo.id} className="flex flex-col gap-2.5 border-b border-border/50 px-4 py-3.5 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{label}</span>
              <Badge variant={binding ? 'secondary' : 'outline'}>{binding ? '已绑定' : '未绑定'}</Badge>
              <SearchableSelect
                className="w-32 text-xs"
                ariaLabel={`${label} CI 提供方`}
                value={binding?.provider ?? 'none'}
                onValueChange={(v) => {
                  if (!v || v === 'none') setRepoBinding(repo.id, null);
                  else if (v === 'flow') {
                    const pipeline = pipelines[0];
                    setRepoBinding(repo.id, { provider: 'flow', pipelineId: pipeline?.pipelineId ?? 0, pipelineName: pipeline?.pipelineName ?? '' });
                  } else {
                    setRepoBinding(repo.id, { provider: 'jenkins', connectionId: (draft?.jenkinsConnections ?? [])[0]?.id ?? '', jobFullName: '' });
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
                      ...(draft?.jenkinsConnections ?? []).map((c) => ({
                        label: c.name || c.baseUrl || c.id,
                        value: c.id,
                      })),
                    ]}
                  />
                  <Input
                    aria-label={`${label} Jenkins Job 全路径`}
                    value={binding.jobFullName}
                    placeholder="folder/job-name"
                    onChange={(e) => setRepoBinding(repo.id, { ...binding, jobFullName: e.target.value }, false)}
                    onBlur={() => void flushAutoSave()}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={!canVerifyJob || !binding.connectionId || !binding.jobFullName.trim()} onClick={() => void verifyJenkinsJob(repo.id, binding)}>验证 Job</Button>
                  {ciResults[`repo-${repo.id}`] && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{ciResults[`repo-${repo.id}`]}</span>}
                </div>
              </>
            )}
            {error && <FieldError>{error}</FieldError>}
          </div>
        );
      })}
      {!visibleRepos.length && (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          {repositories.length
            ? '无匹配仓库'
            : '仓库列表为空，请先在「设置 → 云效连接」配置并保存云效连接'}
        </div>
      )}
    </SettingsGroup>
  );
}
