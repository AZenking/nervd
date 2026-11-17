// CI 集成共享区（UX 评审 A1）：Jenkins 实例 + 仓库 CI 绑定只此一份实现，
// CI 集成设置卡，和其他设置区编辑同一份 settings 草稿。
import { useDeferredValue, useState } from 'react';
import { PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { errorLog, humanizeError } from '@/lib/error-format';
import { cn } from '@/lib/utils';
import type { JenkinsConnection, RepoCiBinding } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { ListBox } from '@/components/ui/list-box';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { EmptyHint } from '@/components/empty-hint';
import { ConfirmButton } from '@/components/ConfirmButton';
import { SearchableSelect } from '../searchable-select';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { SettingsGroup } from './settings-group';

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
        <Button type="button" variant="secondary" size="sm" onPress={addJenkins}>
          <PlusIcon data-icon="inline-start" />
          添加实例
        </Button>
      )}
    >
      {connections.map((connection) => {
        const saved = settings?.jenkinsConnections.find((item) => item.id === connection.id);
        const error = fieldErrors[`jenkins-${connection.id}`];
        const errorId = `jenkins-${connection.id}-error`;
        const boundRepoCount = Object.values(draft?.repoCiBindings ?? {}).filter(
          (binding) => binding.provider === 'jenkins' && binding.connectionId === connection.id,
        ).length;
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
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) => updateJenkins(connection.id, { name: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.nativeEvent.isComposing) return;
                }}
                onBlur={() => void flushAutoSave()}
              />
              <Input
                aria-label="Jenkins 地址"
                value={connection.baseUrl}
                placeholder="https://jenkins.example.com"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) => updateJenkins(connection.id, { baseUrl: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.nativeEvent.isComposing) return;
                }}
                onBlur={() => void flushAutoSave()}
              />
              <Input
                aria-label="Jenkins 用户名"
                value={connection.username}
                placeholder="用户名"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) => updateJenkins(connection.id, { username: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.nativeEvent.isComposing) return;
                }}
                onBlur={() => void flushAutoSave()}
              />
              <Input
                aria-label="Jenkins API Token"
                type="password"
                value={jenkinsTokens[connection.id] ?? ''}
                placeholder={hasSavedToken ? 'Token 已保存（留空保持不变）' : 'API Token'}
                onChange={(e) => setJenkinsToken(connection.id, e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.nativeEvent.isComposing) return;
                }}
                onBlur={() => void flushAutoSave()}
              />
              {error && (
                <div className="md:col-span-2">
                  <p id={errorId} role="alert" className="text-destructive text-xs">
                    {error}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isDisabled={isTesting}
                  onPress={() => void testJenkins(connection)}
                >
                  测试连接
                </Button>
                <ConfirmButton
                  label="删除"
                  title={`删除 Jenkins 实例「${connection.name || connection.baseUrl || connection.id}」？`}
                  description={
                    boundRepoCount > 0
                      ? `该实例正被 ${boundRepoCount} 个仓库 CI 绑定使用，删除将连带解除这 ${boundRepoCount} 个仓库的绑定，并移除已保存的 API Token；操作不可恢复。`
                      : '删除后将同时移除已保存的 API Token；操作不可恢复。'
                  }
                  confirmLabel="删除实例"
                  variant="ghost"
                  size="sm"
                  disabled={isTesting}
                  onConfirm={() => removeJenkins(connection.id)}
                >
                  <Trash2Icon className="size-3.5" />
                  <span>删除</span>
                </ConfirmButton>
                {hasSavedToken ? (
                  <Chip size="sm" variant="soft" color="success" className="text-xs">
                    Token 已保存
                  </Chip>
                ) : draftToken ? (
                  <span className="text-xs text-warning">Token 待保存</span>
                ) : (
                  <span className="text-xs text-muted-foreground">尚未保存 Token</span>
                )}
                {testResult && (
                  <span
                    className={cn(
                      'min-w-0 flex-1 whitespace-normal break-words text-xs',
                      testSuccess && 'text-success',
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
        <EmptyHint compact title="尚未添加 Jenkins 实例" />
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
  const [showArchived, setShowArchived] = useState(false);
  const deferredFilter = useDeferredValue(repoFilter);

  const archivedCount = repositories.filter((repo) => repo.archived).length;
  // 已绑定的归档仓库仍显示，否则用户无法解绑
  const scoped = showArchived
    ? repositories
    : repositories.filter((repo) => !repo.archived || Boolean(bindings[String(repo.id)]));
  const keyword = deferredFilter.trim().toLowerCase();
  const boundCount = scoped.filter((repo) => bindings[String(repo.id)]).length;
  const matchedRepos = scoped.filter((repo) => {
    if (boundOnly && !bindings[String(repo.id)]) return false;
    return !keyword || (repo.pathWithNamespace || repo.name).toLowerCase().includes(keyword);
  });
  // 组织仓库可能上千：只挂载有限行（已绑定项始终保留），其余靠过滤定位
  const renderLimit = keyword ? 120 : 80;
  const boundVisible = matchedRepos.filter((repo) => bindings[String(repo.id)]).slice(0, renderLimit);
  const unboundVisible = matchedRepos
    .filter((repo) => !bindings[String(repo.id)])
    .slice(0, Math.max(0, renderLimit - boundVisible.length));
  const visibleIds = new Set([...boundVisible, ...unboundVisible].map((repo) => repo.id));
  const visibleRepos = matchedRepos.filter((repo) => visibleIds.has(repo.id));
  const hiddenCount = matchedRepos.length - visibleRepos.length;

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
          <Chip size="sm" variant="secondary">
            <span className="font-mono tabular-nums">{Object.keys(bindings).length}</span> 个绑定
          </Chip>
          <Button type="button" variant="secondary" size="sm" onPress={() => void loadPipelines()}>
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
            className="min-w-40 flex-1"
            placeholder="输入名称过滤…"
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.nativeEvent.isComposing) return;
            }}
          />
          {archivedCount > 0 && (
            <Checkbox
              isSelected={showArchived}
              onChange={(v) => setShowArchived(v)}
              className="cursor-pointer text-muted-foreground"
            >
              显示已归档（{archivedCount}）
            </Checkbox>
          )}
          <Tabs
            value={boundOnly ? 'bound' : 'all'}
            onValueChange={(key) => {
              if (key) setBoundOnly(key === 'bound');
            }}
          >
            <TabsList aria-label="仓库过滤" containerClassName="overflow-x-auto">
              <TabsTrigger value="bound">
                已绑定 <span className="font-mono tabular-nums">{boundCount}</span>
              </TabsTrigger>
              <TabsTrigger value="all">
                全部 <span className="font-mono tabular-nums">{scoped.length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
        const errorId = `repo-${repo.id}-error`;
        return (
          <div key={repo.id} className="flex flex-col gap-2.5 border-b border-border/50 px-4 py-3.5 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2">
              <OverflowTooltip text={label} className="min-w-0 flex-1 truncate font-mono text-xs" />
              <Chip size="sm" variant={binding ? 'soft' : 'secondary'} color={binding ? 'accent' : 'default'}>
                {binding ? '已绑定' : '未绑定'}
              </Chip>
              <Select
                className="w-32"
                aria-label={`${label} CI 提供方`}
                selectedKey={binding?.provider ?? 'none'}
                onSelectionChange={(key) => {
                  const v = String(key);
                  if (!v || v === 'none') setRepoBinding(repo.id, null);
                  else if (v === 'flow') {
                    const pipeline = pipelines[0];
                    setRepoBinding(repo.id, { provider: 'flow', pipelineId: pipeline?.pipelineId ?? 0, pipelineName: pipeline?.pipelineName ?? '' });
                  } else {
                    setRepoBinding(repo.id, { provider: 'jenkins', connectionId: (draft?.jenkinsConnections ?? [])[0]?.id ?? '', jobFullName: '' });
                  }
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="none" textValue="未绑定"><span title="未绑定">未绑定</span><ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="flow" textValue="云效 Flow"><span title="云效 Flow">云效 Flow</span><ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="jenkins" textValue="Jenkins"><span title="Jenkins">Jenkins</span><ListBox.ItemIndicator /></ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            {binding?.provider === 'flow' && (
              <div role="group" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}>
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
              </div>
            )}
            {binding?.provider === 'jenkins' && (
              <>
                <div
                  role="group"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  className="grid gap-2 md:grid-cols-[minmax(10rem,0.7fr)_minmax(12rem,1fr)]"
                >
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
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(e) => setRepoBinding(repo.id, { ...binding, jobFullName: e.target.value }, false)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.nativeEvent.isComposing) return;
                    }}
                    onBlur={() => void flushAutoSave()}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    isDisabled={!canVerifyJob || !binding.connectionId || !binding.jobFullName.trim()}
                    onPress={() => void verifyJenkinsJob(repo.id, binding)}
                  >
                    验证 Job
                  </Button>
                  {ciResults[`repo-${repo.id}`] && (
                    <span className="min-w-0 flex-1 whitespace-normal break-words text-xs text-muted-foreground">
                      {ciResults[`repo-${repo.id}`]}
                    </span>
                  )}
                </div>
              </>
            )}
            {error && (
              <p id={errorId} role="alert" className="text-destructive text-xs">
                {error}
              </p>
            )}
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <div className="border-b border-border/50 px-4 py-2.5 text-[11px] leading-4 text-muted-foreground last:border-b-0">
          还有 {hiddenCount} 个仓库未显示，输入名称过滤可快速定位。
        </div>
      )}
      {!visibleRepos.length && (
        <EmptyHint
          compact
          title={scoped.length ? '无匹配仓库' : '仓库列表为空'}
          description={scoped.length ? undefined : '请先在「设置 → 云效连接」配置并保存云效连接'}
        />
      )}
    </SettingsGroup>
  );
}
