import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { RefreshCwIcon, WorkflowIcon } from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { isBranchParameterName, isEnvironmentParameterName } from '@/lib/ci';
import type { JenkinsJobParameter, JenkinsJobSummary, RepoCiBinding } from '@/types';
import { errorLog, humanizeError } from '@/lib/error-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WriteOpButton } from '@/components/WriteOpButton';
import { SearchableSelect } from '../searchable-select';

function branchNames(value: unknown): string[] {
  const collect = (input: unknown): string[] => {
    if (Array.isArray(input)) {
      return input.flatMap((item) => {
        if (typeof item === 'string') return [item];
        if (!item || typeof item !== 'object') return [];
        const record = item as Record<string, unknown>;
        const name = record.name ?? record.branchName ?? record.branch_name;
        return typeof name === 'string' ? [name] : [];
      });
    }
    if (!input || typeof input !== 'object') return [];
    const record = input as Record<string, unknown>;
    for (const key of ['branches', 'items', 'data', 'result']) {
      if (record[key] !== undefined) {
        const names = collect(record[key]);
        if (names.length) return names;
      }
    }
    return [];
  };
  return [...new Set(collect(value).map((name) => name.trim()).filter(Boolean))].sort();
}

function ParameterInput({
  parameter,
  value,
  options,
  onChange,
  allowCustomValue = false,
}: {
  parameter: JenkinsJobParameter;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  allowCustomValue?: boolean;
}) {
  const choices = [...new Set([...options, ...(value ? [value] : [])])];
  // UX：自由值输入用 Combobox 自定义值候选替代原生 datalist（去除原生弹层）
  if (allowCustomValue) {
    return (
      <SearchableSelect
        ariaLabel={parameter.name}
        value={value || null}
        onValueChange={(v) => onChange(v ?? '')}
        allowCustomValue
        placeholder="输入或选择分支"
        searchPlaceholder="输入或搜索分支…"
        items={choices.map((choice): { label: string; value: string } => ({ label: choice, value: choice }))}
      />
    );
  }
  if (choices.length) {
    return (
      <SearchableSelect
        ariaLabel={parameter.name}
        value={value || '__none'}
        onValueChange={(v) => onChange(v && v !== '__none' ? v : '')}
        items={[
          { label: '选择值', value: '__none' },
          ...choices.map((choice): { label: string; value: string } => ({ label: choice, value: choice })),
        ]}
      />
    );
  }
  return (
    <Input
      aria-label={parameter.name}
      value={value}
      placeholder={`输入 ${parameter.name}`}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function JenkinsBuildDialog({
  repoId,
  repoName,
  defaultBranch,
  buttonLabel = '触发 CI',
  buttonVariant = 'default',
}: {
  repoId: number;
  repoName: string;
  defaultBranch?: string;
  buttonLabel?: string;
  buttonVariant?: ComponentProps<typeof Button>['variant'];
}) {
  const { settings, setToast, loadRepoCi, saveRepoCiBinding } = useApp();
  const connections = (settings?.jenkinsConnections ?? []).filter((connection) => connection.hasToken);
  const currentBinding = settings?.repoCiBindings?.[String(repoId)];
  const savedBinding = currentBinding?.provider === 'jenkins' ? currentBinding : undefined;
  const [open, setOpen] = useState(false);
  const [connectionId, setConnectionId] = useState('');
  const [jobs, setJobs] = useState<JenkinsJobSummary[]>([]);
  const [jobFullName, setJobFullName] = useState('');
  const [parameters, setParameters] = useState<JenkinsJobParameter[]>([]);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [environmentParameter, setEnvironmentParameter] = useState('');
  const [branchParameter, setBranchParameter] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsRefresh, setJobsRefresh] = useState(0);
  const [parametersLoading, setParametersLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const environment = parameters.find((parameter) => parameter.name === environmentParameter);
  const branch = parameters.find((parameter) => parameter.name === branchParameter);
  const usedParameterNames = useMemo(
    () => new Set([environmentParameter, branchParameter].filter(Boolean)),
    [environmentParameter, branchParameter],
  );
  const environmentValue = environment ? parameterValues[environment.name] ?? '' : '';
  const branchValue = branch ? parameterValues[branch.name] ?? '' : '';

  const openDialog = () => {
    const initialConnectionId = savedBinding?.connectionId || connections[0]?.id || '';
    setConnectionId(initialConnectionId);
    setJobs([]);
    setJobFullName(savedBinding?.jobFullName ?? '');
    setParameters([]);
    setParameterValues(savedBinding?.parameters ?? {});
    setEnvironmentParameter(savedBinding?.environmentParameter ?? '');
    setBranchParameter(savedBinding?.branchParameter ?? '');
    setBranches([]);
    setError('');
    setRemember(Boolean(savedBinding));
    setOpen(true);
  };

  useEffect(() => {
    if (!open || !connectionId) return;
    let active = true;
    setJobsLoading(true);
    setError('');
    void api.listJenkinsJobs(connectionId)
      .then((items) => {
        if (!active) return;
        const next = [...items];
        if (savedBinding?.connectionId === connectionId
          && !next.some((job) => job.fullName === savedBinding.jobFullName)) {
          next.unshift({ name: savedBinding.jobFullName.split('/').pop() || savedBinding.jobFullName, fullName: savedBinding.jobFullName });
        }
        setJobs(next);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        errorLog('jenkins.listJobs', cause);
        setError(`读取 Jenkins Job 失败：${humanizeError(cause, '未能获取 Job 列表，请稍后重试')}`);
      })
      .finally(() => { if (active) setJobsLoading(false); });
    setBranchesLoading(true);
    void api.listBranches(repoId, undefined, 1, 100)
      .then((result) => { if (active) setBranches(branchNames(result)); })
      .catch(() => { if (active) setBranches([]); })
      .finally(() => { if (active) setBranchesLoading(false); });
    return () => { active = false; };
  }, [open, connectionId, repoId, savedBinding, jobsRefresh]);

  useEffect(() => {
    if (!open || !connectionId || !jobFullName) {
      setParameters([]);
      return;
    }
    let active = true;
    setParametersLoading(true);
    setError('');
    void api.getJenkinsJobParameters(connectionId, jobFullName)
      .then((definitions) => {
        if (!active) return;
        const environmentName = (savedBinding?.connectionId === connectionId && savedBinding.jobFullName === jobFullName
          ? definitions.find((parameter) => parameter.name === savedBinding.environmentParameter)?.name
          : undefined)
          ?? definitions.find((parameter) => isEnvironmentParameterName(parameter.name))?.name
          ?? definitions[0]?.name ?? '';
        const branchName = (savedBinding?.connectionId === connectionId && savedBinding.jobFullName === jobFullName
          ? definitions.find((parameter) => parameter.name === savedBinding.branchParameter)?.name
          : undefined)
          ?? definitions.find((parameter) => isBranchParameterName(parameter.name)
          && parameter.name !== environmentName)?.name
          ?? definitions.find((parameter) => parameter.name !== environmentName)?.name ?? '';
        const values: Record<string, string> = {};
        for (const parameter of definitions) {
          const choices = parameter.choices ?? [];
          const preferredBranch = branches.includes(defaultBranch ?? '')
            ? defaultBranch ?? ''
            : branches[0] ?? '';
          values[parameter.name] = (parameter.name === branchName && preferredBranch ? preferredBranch : undefined)
            ?? parameter.defaultValue
            ?? choices[0]
            ?? '';
          if (!values[parameter.name] && choices.length) values[parameter.name] = choices[0];
        }
        if (savedBinding?.connectionId === connectionId && savedBinding.jobFullName === jobFullName) {
          Object.assign(values, savedBinding.parameters ?? {});
        }
        setParameters(definitions);
        setEnvironmentParameter(environmentName);
        setBranchParameter(branchName);
        setParameterValues(values);
      })
      .catch((cause: unknown) => {
        if (active) {
          errorLog('jenkins.parameters', cause);
          setParameters([]);
          setError(`读取 Job 参数失败：${humanizeError(cause, '未能获取 Job 参数，请稍后重试')}`);
        }
      })
      .finally(() => { if (active) setParametersLoading(false); });
    return () => { active = false; };
  }, [open, connectionId, jobFullName, branches, defaultBranch, savedBinding]);

  const updateParameter = (name: string, value: string) => {
    setParameterValues((current) => ({ ...current, [name]: value }));
  };

  const updateEnvironmentParameter = (name: string) => {
    setEnvironmentParameter(name);
    const definition = parameters.find((parameter) => parameter.name === name);
    if (definition && !parameterValues[name]) {
      updateParameter(name, definition.defaultValue ?? definition.choices[0] ?? '');
    }
  };

  const updateBranchParameter = (name: string) => {
    setBranchParameter(name);
    const definition = parameters.find((parameter) => parameter.name === name);
    if (definition && !parameterValues[name]) {
      const branchOptions = definition.choices.length ? definition.choices : branches;
      const preferred = branches.includes(defaultBranch ?? '') ? defaultBranch ?? '' : '';
      updateParameter(name, definition.defaultValue ?? (preferred || branchOptions[0] || ''));
    }
  };

  // UX A11：有参数时至少映射一个（环境或分支）即可触发；无参数 Job 按默认配置直接触发
  const buildDisabledReason = !connectionId
    ? '请选择已保存 Token 的 Jenkins 实例'
    : !jobFullName
      ? '请选择 Jenkins Job'
      : jobsLoading || parametersLoading
        ? '正在读取 Job 参数'
        : environmentParameter && environmentParameter === branchParameter
          ? '环境参数与分支参数不能相同'
          : parameters.length && !environment && !branch
            ? '请至少映射一个参数（环境或分支）'
            : environment && !environmentValue.trim()
              ? '请填写环境值'
              : branch && !branchValue.trim()
                ? '请填写分支值'
                : undefined;

  const trigger = async () => {
    if (!connectionId || !jobFullName || buildDisabledReason) return;
    if (parameters.length && !environment && !branch) return;
    const values = {
      ...parameterValues,
      ...(environment ? { [environment.name]: environmentValue.trim() } : {}),
      ...(branch ? { [branch.name]: branchValue.trim() } : {}),
    };
    setTriggering(true);
    try {
      if (remember) {
        const binding: RepoCiBinding = {
          provider: 'jenkins', connectionId, jobFullName, parameters: values,
          environmentParameter: environment?.name ?? '',
          branchParameter: branch?.name ?? '',
        };
        await saveRepoCiBinding(repoId, binding);
      }
      await api.triggerJenkinsJob(repoId, connectionId, jobFullName, values);
      setToast({ text: `已触发 ${repoName} 构建：${jobFullName}`, kind: 'ok' });
      setOpen(false);
      if (remember) void loadRepoCi(repoId);
    } catch (cause) {
      errorLog('jenkins.trigger', cause);
      setToast({ text: `触发失败：${humanizeError(cause, `${repoName} 的 Jenkins 构建触发失败，请稍后重试`)}`, kind: 'fail' });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant={buttonVariant} onClick={openDialog}>
        <WorkflowIcon data-icon="inline-start" />
        {buttonLabel}
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>触发 Jenkins 构建</DialogTitle>
          <DialogDescription>{repoName} · 选择 Job、环境和分支后运行构建。</DialogDescription>
        </DialogHeader>
        {!connections.length ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            请先在「设置 → CI 集成」中配置 Jenkins 实例并保存 API Token。
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="jenkins-connection">Jenkins 实例</FieldLabel>
              <SearchableSelect
                id="jenkins-connection"
                value={connectionId || null}
                onValueChange={(v) => {
                  setConnectionId(v ?? '');
                  setJobFullName('');
                  setJobs([]);
                  setParameters([]);
                  setParameterValues({});
                }}
                items={connections.map((connection) => ({
                  label: connection.name || connection.baseUrl,
                  value: connection.id,
                }))}
              />
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="jenkins-job">Job</FieldLabel>
                <Button
                  type="button" variant="outline" size="sm" disabled={jobsLoading}
                  onClick={() => {
                    setJobsRefresh((current) => current + 1);
                  }}
                >
                  <RefreshCwIcon data-icon="inline-start" />刷新
                </Button>
              </div>
              <SearchableSelect
                id="jenkins-job"
                value={jobFullName || '__none'}
                onValueChange={(v) => {
                  setJobFullName(v && v !== '__none' ? v : '');
                  setParameterValues({});
                  setEnvironmentParameter('');
                  setBranchParameter('');
                }}
                disabled={jobsLoading}
                items={[
                  { label: jobsLoading ? '正在读取 Jenkins Jobs…' : '选择 Jenkins Job', value: '__none' },
                  ...jobs.map((job) => ({ label: job.fullName, value: job.fullName })),
                ]}
              />
            </Field>
            {jobFullName && !parametersLoading && parameters.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground">
                  将 Job 参数映射为「环境 / 分支」，用于在构建记录中标注本次构建；Job 无对应参数时可留空不映射，至少映射一个即可触发。
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="jenkins-env-param">环境参数</FieldLabel>
                    <SearchableSelect
                      id="jenkins-env-param"
                      value={environmentParameter || '__none'}
                      onValueChange={(v) => updateEnvironmentParameter(v && v !== '__none' ? v : '')}
                      items={[
                        { label: '不映射', value: '__none' },
                        ...parameters.map((parameter) => ({
                          label: parameter.name,
                          value: parameter.name,
                          disabled: parameter.name === branchParameter,
                        })),
                      ]}
                    />
                    {environment && (
                      <ParameterInput
                        parameter={environment}
                        value={environmentValue}
                        options={environment.choices}
                        onChange={(value) => updateParameter(environment.name, value)}
                      />
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="jenkins-branch-param">分支参数</FieldLabel>
                    <SearchableSelect
                      id="jenkins-branch-param"
                      value={branchParameter || '__none'}
                      onValueChange={(v) => updateBranchParameter(v && v !== '__none' ? v : '')}
                      items={[
                        { label: '不映射', value: '__none' },
                        ...parameters.map((parameter) => ({
                          label: parameter.name,
                          value: parameter.name,
                          disabled: parameter.name === environmentParameter,
                        })),
                      ]}
                    />
                    {branch && (
                      <ParameterInput
                        parameter={branch}
                        value={branchValue}
                        options={branch.choices.length ? branch.choices : branches}
                        onChange={(value) => updateParameter(branch.name, value)}
                        allowCustomValue
                      />
                    )}
                  </Field>
                </div>
                {branchesLoading && <p className="text-xs text-muted-foreground">正在查询仓库分支…</p>}
                <Collapsible className="rounded-lg border px-3 py-2">
                  <CollapsibleTrigger className="cursor-pointer text-xs font-medium">
                    其他 Job 参数
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 flex flex-col gap-3">
                    {parameters.filter((parameter) => !usedParameterNames.has(parameter.name)).map((parameter) => (
                      <Field key={parameter.name}>
                        <FieldLabel>
                          {parameter.name}
                          <Badge variant="outline" className="text-xs">{parameter.type || '参数'}</Badge>
                        </FieldLabel>
                        <ParameterInput
                          parameter={parameter}
                          value={parameterValues[parameter.name] ?? ''}
                          options={parameter.choices}
                          onChange={(value) => updateParameter(parameter.name, value)}
                        />
                      </Field>
                    ))}
                    {!parameters.some((parameter) => !usedParameterNames.has(parameter.name)) && (
                      <p className="text-xs text-muted-foreground">没有其他参数。</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
            {jobFullName && !parametersLoading && !parameters.length && !error && (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                此 Job 没有可读取的 Jenkins 参数，将按 Job 默认配置直接触发构建。
              </p>
            )}
            {parametersLoading && <p className="text-xs text-muted-foreground">正在读取 Job 参数…</p>}
            {error && <p className="rounded-md bg-destructive/5 p-2 text-xs text-destructive">{error}</p>}
            <Label className="font-normal">
              <Checkbox
                checked={remember}
                onCheckedChange={(checked) => setRemember(checked === true)}
              />
              记住本次选择（保存到此仓库的本机 CI 关联）
            </Label>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
          {/* UX A5：向导内两段式确认，不再弹窗套弹窗 */}
          <WriteOpButton
            label={triggering ? '构建中…' : '构建'}
            title={jobFullName ? `触发 Jenkins Job ${jobFullName}` : '触发 Jenkins 构建'}
            confirm="inline"
            confirmLabel="确认触发"
            disabled={Boolean(buildDisabledReason) || !connections.length || triggering}
            disabledReason={buildDisabledReason}
            onAction={trigger}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
