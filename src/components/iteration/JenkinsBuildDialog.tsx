import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import {
  ChevronDownIcon,
  GitBranchIcon,
  RefreshCwIcon,
  Settings2Icon,
  WorkflowIcon,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { WriteOpButton, WriteOpGatedTrigger } from '@/components/WriteOpButton';
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

interface ParameterFieldProps {
  parameter: JenkinsJobParameter;
  value: string;
  isBranch: boolean;
  isEnv: boolean;
  branchOptions: string[];
  branchesLoading: boolean;
  onChange: (value: string) => void;
}

function ParameterField({
  parameter,
  value,
  isBranch,
  isEnv,
  branchOptions,
  branchesLoading,
  onChange,
}: ParameterFieldProps) {
  const hasChoices = Boolean(parameter.choices && parameter.choices.length > 0);
  const isBoolean = Boolean(parameter.type?.toLowerCase().includes('boolean'));

  return (
    <Field className="gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={`param-${parameter.name}`} className="font-mono text-xs font-medium">
          {parameter.name}
        </FieldLabel>
        <div className="flex items-center gap-1.5">
          {isBranch && (
            <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20">
              代码分支
            </Badge>
          )}
          {isEnv && (
            <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 h-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
              部署环境
            </Badge>
          )}
          <span className="text-[10px] font-mono text-muted-foreground/80">
            {isBranch ? '分支 (支持手动填写)' : hasChoices ? '下拉选择' : isBoolean ? '布尔' : '文本'}
          </span>
        </div>
      </div>

      {isBranch ? (
        <div className="flex gap-2">
          <Input
            id={`param-${parameter.name}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="输入分支名（如 master，支持手动填写）"
            className="font-mono text-xs h-8 flex-1"
          />
          {(branchOptions.length > 0 || branchesLoading) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1 px-2.5 text-xs"
                    title="从已有分支列表中选择并填充"
                  />
                }
              >
                <GitBranchIcon className="size-3.5 text-muted-foreground" />
                <span>选择分支</span>
                <ChevronDownIcon className="size-3 text-muted-foreground opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-h-72 overflow-y-auto z-[60]">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/40 text-[11px] font-medium text-muted-foreground select-none">
                  <span>{branchesLoading ? '正在拉取远端分支…' : '可选分支列表'}</span>
                  {branchOptions.length > 0 && (
                    <span className="text-[10px] font-mono opacity-70">{branchOptions.length} 个分支</span>
                  )}
                </div>
                {branchOptions.length === 0 && !branchesLoading && (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">暂无可用的分支候选</div>
                )}
                {branchOptions.map((b) => (
                  <DropdownMenuItem
                    key={b}
                    onClick={() => onChange(b)}
                    className="font-mono text-xs cursor-pointer flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{b}</span>
                    {b === value && <span className="text-[10px] text-primary shrink-0 font-sans">当前</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ) : hasChoices ? (
        <SearchableSelect
          id={`param-${parameter.name}`}
          value={value || '__none'}
          onValueChange={(v) => onChange(v && v !== '__none' ? v : '')}
          placeholder={`选择 ${parameter.name}`}
          items={parameter.choices.map((c) => ({ label: c, value: c }))}
          className="text-xs h-8"
        />
      ) : isBoolean ? (
        <div className="flex items-center gap-2 pt-0.5">
          <Checkbox
            id={`param-${parameter.name}`}
            checked={value === 'true' || value === '1'}
            onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
          />
          <Label htmlFor={`param-${parameter.name}`} className="text-xs text-muted-foreground font-normal cursor-pointer">
            启用 {parameter.name}
          </Label>
        </div>
      ) : (
        <Input
          id={`param-${parameter.name}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`输入 ${parameter.name}`}
          className="text-xs h-8"
        />
      )}
    </Field>
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
  const allowWriteOps = settings?.allowWriteOps ?? false;
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
        const isCurrentJobSaved = savedBinding?.connectionId === connectionId && savedBinding.jobFullName === jobFullName;
        const savedBranch = isCurrentJobSaved ? savedBinding.branchParameter : undefined;
        const savedEnv = isCurrentJobSaved ? savedBinding.environmentParameter : undefined;

        let branchName = '';
        let environmentName = '';

        // Detect corrupted / inverted bindings from the old bug (e.g. savedEnv is GitBranch, savedBranch is Model)
        if (savedEnv && isBranchParameterName(savedEnv) && (!savedBranch || !isBranchParameterName(savedBranch))) {
          branchName = definitions.find((p) => p.name === savedEnv)?.name ?? '';
          environmentName = savedBranch && isEnvironmentParameterName(savedBranch)
            ? definitions.find((p) => p.name === savedBranch)?.name ?? ''
            : '';
        } else {
          branchName = (savedBranch ? definitions.find((p) => p.name === savedBranch)?.name : undefined)
            ?? definitions.find((p) => isBranchParameterName(p.name))?.name ?? '';
          environmentName = (savedEnv && savedEnv !== branchName ? definitions.find((p) => p.name === savedEnv)?.name : undefined)
            ?? definitions.find((p) => isEnvironmentParameterName(p.name) && p.name !== branchName)?.name ?? '';
        }

        if (!branchName) {
          branchName = definitions.find((p) => isBranchParameterName(p.name))?.name ?? '';
        }
        if (!environmentName) {
          environmentName = definitions.find((p) => isEnvironmentParameterName(p.name) && p.name !== branchName)?.name ?? '';
        }

        const values: Record<string, string> = {};
        for (const parameter of definitions) {
          const choices = parameter.choices ?? [];
          const isBranch = parameter.name === branchName;
          const preferredBranch = isBranch
            ? (defaultBranch?.trim() || (branches.includes(defaultBranch ?? '') ? defaultBranch ?? '' : branches[0] ?? ''))
            : undefined;
          const savedVal = isCurrentJobSaved ? savedBinding?.parameters?.[parameter.name] : undefined;

          values[parameter.name] = (preferredBranch ? preferredBranch : undefined)
            ?? savedVal
            ?? parameter.defaultValue
            ?? choices[0]
            ?? '';
          if (!values[parameter.name] && choices.length) values[parameter.name] = choices[0];
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

  const allBranchOptions = useMemo(() => {
    const options = new Set<string>();
    if (defaultBranch?.trim()) options.add(defaultBranch.trim());
    for (const b of branches) {
      if (b.trim()) options.add(b.trim());
    }
    for (const p of parameters) {
      if (p.name === branchParameter) {
        for (const c of p.choices) {
          if (c.trim()) options.add(c.trim());
        }
      }
    }
    return [...options];
  }, [defaultBranch, branches, parameters, branchParameter]);

  const buildDisabledReason = !connectionId
    ? '请选择已保存 Token 的 Jenkins 实例'
    : !jobFullName
      ? '请选择 Jenkins Job'
      : jobsLoading || parametersLoading
        ? '正在读取 Job 参数'
        : branchParameter && !parameterValues[branchParameter]?.trim()
          ? '请填写代码分支'
          : undefined;

  const trigger = async () => {
    if (!connectionId || !jobFullName || buildDisabledReason) return;
    setTriggering(true);
    try {
      if (remember) {
        const binding: RepoCiBinding = {
          provider: 'jenkins',
          connectionId,
          jobFullName,
          parameters: parameterValues,
          environmentParameter: environmentParameter || undefined,
          branchParameter: branchParameter || undefined,
        };
        await saveRepoCiBinding(repoId, binding);
      }
      await api.triggerJenkinsJob(repoId, connectionId, jobFullName, parameterValues);
      setToast({ text: `已触发 ${repoName} 构建：${jobFullName}`, kind: 'ok' });
      setOpen(false);
      useApp.getState().markRepoCiActive(90_000);
      void loadRepoCi(repoId);
    } catch (cause) {
      errorLog('jenkins.trigger', cause);
      setToast({ text: `触发失败：${humanizeError(cause, `${repoName} 的 Jenkins 构建触发失败，请稍后重试`)}`, kind: 'fail' });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* 只读门控（与 WriteOpButton 同规则）：写操作关闭时灰阶展示 + 说明弹窗，不进入向导 */}
      <WriteOpGatedTrigger
        label={buttonLabel}
        icon={<WorkflowIcon data-icon="inline-start" />}
        variant={buttonVariant}
      />
      {allowWriteOps && (
        <Button size="sm" variant={buttonVariant} onClick={openDialog}>
          <WorkflowIcon data-icon="inline-start" />
          {buttonLabel}
        </Button>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <ErrorBoundary fallbackTitle="构建参数面板加载异常">
          <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WorkflowIcon className="size-4 text-primary" />
            触发 Jenkins 构建
          </DialogTitle>
          <DialogDescription>{repoName} · 填写参数后运行构建</DialogDescription>
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
                  setBranchParameter('');
                  setEnvironmentParameter('');
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
                <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-card/40 p-3">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        Job 构建参数 ({parameters.length})
                      </span>
                      {branchesLoading && (
                        <span className="text-[11px] text-muted-foreground animate-pulse">
                          (正在拉取分支…)
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      需要如下参数用于构建项目
                    </span>
                  </div>

                  <div className="flex flex-col gap-3">
                    {parameters.map((parameter) => (
                      <ParameterField
                        key={parameter.name}
                        parameter={parameter}
                        value={parameterValues[parameter.name] ?? ''}
                        isBranch={parameter.name === branchParameter}
                        isEnv={parameter.name === environmentParameter}
                        branchOptions={allBranchOptions}
                        branchesLoading={branchesLoading}
                        onChange={(val) => updateParameter(parameter.name, val)}
                      />
                    ))}
                  </div>
                </div>

                <Collapsible className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                  <CollapsibleTrigger className="flex w-full items-center justify-between font-medium text-muted-foreground hover:text-foreground">
                    <span className="flex items-center gap-1.5">
                      <Settings2Icon className="size-3.5" />
                      CI 记录展示映射（高级）
                    </span>
                    <ChevronDownIcon className="size-3.5 transition-transform" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2.5 flex flex-col gap-3 pt-2 border-t border-border/40">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      指定哪个 Jenkins 参数对应「代码分支」与「部署环境」，用于在 nervd 的构建记录与迭代仓库列表中展示。已自动完成智能推断。
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field className="gap-1">
                        <FieldLabel className="text-xs">代码分支参数</FieldLabel>
                        <SearchableSelect
                          value={branchParameter || '__none'}
                          onValueChange={(v) => setBranchParameter(v && v !== '__none' ? v : '')}
                          items={[
                            { label: '不映射', value: '__none' },
                            ...parameters.map((p) => ({
                              label: p.name,
                              value: p.name,
                              disabled: p.name === environmentParameter,
                            })),
                          ]}
                          className="text-xs h-8"
                        />
                      </Field>
                      <Field className="gap-1">
                        <FieldLabel className="text-xs">部署环境参数</FieldLabel>
                        <SearchableSelect
                          value={environmentParameter || '__none'}
                          onValueChange={(v) => setEnvironmentParameter(v && v !== '__none' ? v : '')}
                          items={[
                            { label: '不映射', value: '__none' },
                            ...parameters.map((p) => ({
                              label: p.name,
                              value: p.name,
                              disabled: p.name === branchParameter,
                            })),
                          ]}
                          className="text-xs h-8"
                        />
                      </Field>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}

            {jobFullName && !parametersLoading && !parameters.length && !error && (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                此 Job 无需 Jenkins 参数，将按 Job 默认配置直接触发构建。
              </p>
            )}

            {parametersLoading && (
              <div className="flex flex-col gap-3 py-1" aria-hidden>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-16 rounded" />
                    <Skeleton className="h-8 w-full rounded-md" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-16 rounded" />
                    <Skeleton className="h-8 w-full rounded-md" />
                  </div>
                </div>
              </div>
            )}

            {error && <p className="rounded-md bg-destructive/5 p-2 text-xs text-destructive">{error}</p>}

            <Label className="font-normal text-xs flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={remember}
                onCheckedChange={(checked) => setRemember(checked === true)}
              />
              <span>记住本次选择与参数配置（保存到此仓库的本机 CI 关联）</span>
            </Label>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>取消</Button>
          {/* UX A5：向导内两段式确认，不再弹窗套弹窗 */}
          <WriteOpButton
            label={triggering ? '构建中…' : '开始构建'}
            title={jobFullName ? `触发 Jenkins Job ${jobFullName}` : '触发 Jenkins 构建'}
            confirm="inline"
            confirmLabel="确认构建"
            disabled={Boolean(buildDisabledReason) || !connections.length || triggering}
            disabledReason={buildDisabledReason}
            onAction={trigger}
          />
        </DialogFooter>
        </ErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}
