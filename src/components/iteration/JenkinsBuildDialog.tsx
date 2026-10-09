import { useEffect, useMemo, useState } from 'react';
import { RefreshCwIcon, WorkflowIcon } from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import type { JenkinsJobParameter, JenkinsJobSummary, RepoCiBinding } from '@/types';
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

function isEnvironmentParameter(name: string): boolean {
  return /(^|[_-])(env|environment|deployenv|targetenv)([_-]|$)/i.test(name)
    || /environment/i.test(name);
}

function isBranchParameter(name: string): boolean {
  return /(^|[_-])(git)?branch([_-]|$)/i.test(name)
    || /branchname|gitref|scmref/i.test(name);
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
  if (allowCustomValue) {
    const listId = `jenkins-parameter-${parameter.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-options`;
    return (
      <>
        <Input
          aria-label={parameter.name}
          list={choices.length ? listId : undefined}
          value={value}
          placeholder="输入或选择分支"
          onChange={(event) => onChange(event.target.value)}
        />
        {choices.length > 0 && (
          <datalist id={listId}>
            {choices.map((choice) => <option key={choice} value={choice} />)}
          </datalist>
        )}
      </>
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
}: {
  repoId: number;
  repoName: string;
  defaultBranch?: string;
  buttonLabel?: string;
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
      .catch((cause: unknown) => { if (active) setError(`读取 Jenkins Job 失败：${String(cause)}`); })
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
          ?? definitions.find((parameter) => isEnvironmentParameter(parameter.name))?.name
          ?? definitions[0]?.name ?? '';
        const branchName = (savedBinding?.connectionId === connectionId && savedBinding.jobFullName === jobFullName
          ? definitions.find((parameter) => parameter.name === savedBinding.branchParameter)?.name
          : undefined)
          ?? definitions.find((parameter) => isBranchParameter(parameter.name)
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
          setParameters([]);
          setError(`读取 Job 参数失败：${String(cause)}`);
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

  const buildDisabledReason = !connectionId
    ? '请选择已保存 Token 的 Jenkins 实例'
    : !jobFullName
      ? '请选择 Jenkins Job'
      : jobsLoading || parametersLoading
        ? '正在读取 Job 参数'
        : !environment || !branch
          ? 'Job 至少需要两个参数，分别映射环境和分支'
          : environmentParameter === branchParameter
            ? '环境参数与分支参数不能相同'
            : !environmentValue.trim() || !branchValue.trim()
              ? '请填写环境和分支值'
              : undefined;

  const trigger = async () => {
    if (!connectionId || !jobFullName || !environment || !branch || buildDisabledReason) return;
    const values = {
      ...parameterValues,
      [environment.name]: environmentValue.trim(),
      [branch.name]: branchValue.trim(),
    };
    setTriggering(true);
    try {
      if (remember) {
        const binding: RepoCiBinding = {
          provider: 'jenkins', connectionId, jobFullName, parameters: values,
          environmentParameter: environment.name,
          branchParameter: branch.name,
        };
        await saveRepoCiBinding(repoId, binding);
      }
      await api.triggerJenkinsJob(repoId, connectionId, jobFullName, values);
      setToast({ text: `已触发 ${repoName} 构建：${jobFullName}`, kind: 'ok' });
      setOpen(false);
      if (remember) void loadRepoCi(repoId);
    } catch (cause) {
      setToast({ text: `Jenkins 构建触发失败：${String(cause)}`, kind: 'fail' });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <WorkflowIcon className="size-4" />
        {buttonLabel}
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>触发 Jenkins 构建</DialogTitle>
          <DialogDescription>{repoName} · 选择 Job、环境和分支后运行构建。</DialogDescription>
        </DialogHeader>
        {!connections.length ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            请先在「环境与策略」中配置 Jenkins 实例并保存 API Token。
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
                  type="button" variant="ghost" size="sm" disabled={jobsLoading}
                  onClick={() => {
                    setJobsRefresh((current) => current + 1);
                  }}
                >
                  <RefreshCwIcon className="size-3.5" />刷新
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="jenkins-env-param">环境参数</FieldLabel>
                    <SearchableSelect
                      id="jenkins-env-param"
                      value={environmentParameter || '__none'}
                      onValueChange={(v) => updateEnvironmentParameter(v && v !== '__none' ? v : '')}
                      items={[
                        { label: '选择参数', value: '__none' },
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
                        { label: '选择参数', value: '__none' },
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
                          <Badge variant="outline" className="text-[10px]">{parameter.type || '参数'}</Badge>
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
                此 Job 没有可读取的 Jenkins 参数，无法在此选择环境和分支。请先在 Jenkins Job 中定义环境与分支参数。
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
          <WriteOpButton
            label={triggering ? '构建中…' : '构建'}
            title={jobFullName ? `触发 Jenkins Job ${jobFullName}` : '触发 Jenkins 构建'}
            disabled={Boolean(buildDisabledReason) || !connections.length || triggering}
            disabledReason={buildDisabledReason}
            onAction={trigger}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
