import { useEffect, useMemo, useState } from 'react';
import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListBox } from '@/components/ui/list-box';
import { Select } from '@/components/ui/select';
import {
  ClockIcon,
  GitBranchIcon,
  Loader2Icon,
  SlidersHorizontalIcon,
  TerminalIcon,
  WorkflowIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useQuickBuild, type QuickBuildTarget } from '@/store/quick-build';
import {
  getCachedJenkinsJobParameters,
  getCachedJenkinsJobs,
  hasCachedJobs,
} from '@/lib/jenkins-cache';
import { isBranchParameterName, isEnvironmentParameterName } from '@/lib/ci';
import type { JenkinsJobParameter, JenkinsJobSummary } from '@/types';
import { fetchJobEstimate } from '@/lib/build-estimate';
import { WriteOpButton } from '@/components/WriteOpButton';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { RefreshButton } from './refresh-button';

export interface QuickBuildTriggerFormProps {
  configuredTargets: QuickBuildTarget[];
  initialTargetKey?: string;
  onSuccess?: () => void;
}

export function QuickBuildTriggerForm({
  configuredTargets,
  initialTargetKey,
  onSuccess,
}: QuickBuildTriggerFormProps) {
  const pipelines = useApp((s) => s.pipelines);
  const history = useQuickBuild((s) => s.history);
  const isTriggering = useQuickBuild((s) => s.isTriggering);
  const triggerQuickBuild = useQuickBuild((s) => s.triggerQuickBuild);

  const [selectedTargetId, setSelectedTargetId] = useState<string>(initialTargetKey || '');

  // 基础目标解析
  const baseTarget = useMemo(() => {
    if (selectedTargetId) {
      const foundInHistory = history.find((h) => (h.targetKey || h.id) === selectedTargetId);
      if (foundInHistory) return foundInHistory;
      const foundInConfig = configuredTargets.find((c) => (c.targetKey || c.id) === selectedTargetId);
      if (foundInConfig) return foundInConfig;
    }
    return (
      (initialTargetKey && configuredTargets.find((c) => (c.targetKey || c.id) === initialTargetKey)) ||
      history[0] ||
      configuredTargets[0] ||
      null
    );
  }, [selectedTargetId, history, configuredTargets, initialTargetKey]);

  useEffect(() => {
    if (!selectedTargetId && baseTarget) {
      setSelectedTargetId(baseTarget.targetKey || baseTarget.id);
    }
  }, [baseTarget, selectedTargetId]);

  // Job 列表状态与自由切换
  const [selectedJobFullName, setSelectedJobFullName] = useState<string>('');
  const [availableJobs, setAvailableJobs] = useState<JenkinsJobSummary[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsRefreshCount, setJobsRefreshCount] = useState(0);

  // 当基础目标发生变化时，默认采用其自带的 Job
  useEffect(() => {
    if (baseTarget?.jobFullName) {
      setSelectedJobFullName(baseTarget.jobFullName);
    } else {
      setSelectedJobFullName('');
    }
  }, [baseTarget?.id]);

  // 异步获取当前 Jenkins 实例下的全量 Job 列表供自由选择
  useEffect(() => {
    if (baseTarget?.type === 'jenkins' && baseTarget.connectionId) {
      let active = true;
      const isManual = jobsRefreshCount > 0;
      if (!hasCachedJobs(baseTarget.connectionId) || isManual) {
        setLoadingJobs(true);
      }
      void getCachedJenkinsJobs(baseTarget.connectionId, {
        force: isManual,
        onStaleUpdate: (freshJobs) => {
          if (active) setAvailableJobs(freshJobs);
        },
      })
        .then(({ jobs: fetched }) => {
          if (active) setAvailableJobs(fetched);
        })
        .catch(() => {
          if (active) setAvailableJobs([]);
        })
        .finally(() => {
          if (active) setLoadingJobs(false);
        });
      return () => {
        active = false;
      };
    } else {
      setAvailableJobs([]);
    }
  }, [baseTarget?.connectionId, jobsRefreshCount]);

  // 合成当前的生效目标（若用户切换了 Job，动态覆盖）
  const currentTarget = useMemo<QuickBuildTarget | null>(() => {
    if (!baseTarget) return null;
    if (baseTarget.type === 'jenkins' && selectedJobFullName && selectedJobFullName !== baseTarget.jobFullName) {
      return {
        ...baseTarget,
        id: `jenkins:${baseTarget.repoId}:${baseTarget.connectionId}:${selectedJobFullName}`,
        jobFullName: selectedJobFullName,
        pipelineName: selectedJobFullName,
      };
    }
    return baseTarget;
  }, [baseTarget, selectedJobFullName]);

  // 自定义参数配置与动态表单
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (currentTarget) {
      setParams(currentTarget.parameters || {});
      // 后台静默预查历史成功构建耗时，触发构建时即可 0ms 呈现真实预估进度
      void fetchJobEstimate(currentTarget);
    }
  }, [currentTarget?.id]);

  const [jobParams, setJobParams] = useState<JenkinsJobParameter[]>([]);
  const [loadingParams, setLoadingParams] = useState(false);

  useEffect(() => {
    if (currentTarget?.type === 'jenkins' && currentTarget.connectionId && currentTarget.jobFullName) {
      let canceled = false;
      setLoadingParams(true);
      void getCachedJenkinsJobParameters(currentTarget.connectionId, currentTarget.jobFullName)
        .then((fetched) => {
          if (!canceled) {
            setJobParams(fetched);
            setParams((prev) => {
              const next = { ...prev };
              for (const p of fetched) {
                if (next[p.name] === undefined && p.defaultValue !== undefined) {
                  next[p.name] = p.defaultValue;
                }
              }
              return next;
            });
          }
        })
        .catch(() => {
          if (!canceled) setJobParams([]);
        })
        .finally(() => {
          if (!canceled) setLoadingParams(false);
        });
      return () => {
        canceled = true;
      };
    } else {
      setJobParams([]);
    }
  }, [currentTarget?.id, currentTarget?.connectionId, currentTarget?.jobFullName]);

  // 仓库远端分支选项
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    if (currentTarget?.repoId) {
      let canceled = false;
      setLoadingBranches(true);
      void api
        .listBranches(currentTarget.repoId)
        .then((res) => {
          if (!canceled) {
            const list = Array.isArray(res) ? res : (res as any)?.branches || [];
            setBranchOptions(list.map((b: any) => (typeof b === 'string' ? b : b?.name)).filter(Boolean));
          }
        })
        .catch(() => {
          if (!canceled) setBranchOptions([]);
        })
        .finally(() => {
          if (!canceled) setLoadingBranches(false);
        });
      return () => {
        canceled = true;
      };
    } else {
      setBranchOptions([]);
    }
  }, [currentTarget?.repoId]);

  const branchParamName = useMemo(() => {
    if (!currentTarget) return null;
    if (currentTarget.branchParameter) return currentTarget.branchParameter;
    const found = jobParams.find((p) => isBranchParameterName(p.name));
    return found ? found.name : 'branch';
  }, [currentTarget, jobParams]);

  const envParam = useMemo(() => {
    if (!currentTarget) return null;
    if (currentTarget.environmentParameter) {
      return jobParams.find((p) => p.name === currentTarget.environmentParameter) || null;
    }
    return jobParams.find((p) => isEnvironmentParameterName(p.name)) || null;
  }, [currentTarget, jobParams]);

  const otherParams = useMemo(() => {
    return jobParams.filter((p) => p.name !== branchParamName && p.name !== envParam?.name);
  }, [jobParams, branchParamName, envParam]);

  const currentKey = currentTarget ? (currentTarget.targetKey || currentTarget.id) : '';
  const isCurrentTriggering = currentKey ? isTriggering(currentKey) : false;

  // 两段式确认（4s 复位）统一由 WriteOpButton confirm="inline" 承担，
  // 本组件不再维护 confirmArmed / rerunArmedKey 两套计时器。
  const handleTrigger = async () => {
    if (!currentTarget) return;
    const res = await triggerQuickBuild(currentTarget, params);
    if (res) {
      onSuccess?.();
    }
  };

  return (
    <Card.Content id="quick-build-form" className="flex flex-col gap-3.5 border-t border-border/60 px-4 py-3.5">
      {/* 目标项目与自由选择 Job 入口 */}
      <div className="grid gap-3 rounded-lg border border-border/60 bg-surface-secondary/50 p-3 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">构建目标</Label>
          <Select
            aria-label="选择构建目标代码仓库"
            selectedKey={baseTarget?.id || null}
            onSelectionChange={(key) => {
              if (key) setSelectedTargetId(String(key));
            }}
            className="w-full"
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover className="z-50 max-h-60">
              <ListBox aria-label="目标代码仓库列表">
                {configuredTargets.map((t) => (
                  <ListBox.Item key={t.id} id={t.id} textValue={t.repoName}>
                    <OverflowTooltip text={t.repoName} className="block" />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        {baseTarget?.type === 'jenkins' && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              任务（Job）
              {loadingParams && <Loader2Icon className="size-3 animate-spin" />}
            </Label>
            <div className="flex min-w-0 items-center gap-1.5">
              <Select
                aria-label="选择具体 Job 任务"
                selectedKey={selectedJobFullName || baseTarget.jobFullName || null}
                onSelectionChange={(key) => {
                  if (key) setSelectedJobFullName(String(key));
                }}
                className="min-w-0 flex-1"
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover className="z-50 max-h-60">
                  <ListBox aria-label="任务（Job）列表">
                    {(availableJobs.length > 0
                      ? availableJobs
                      : [{ fullName: baseTarget.jobFullName || '默认 Job' }]
                    ).map((j) => {
                      const val = j.fullName || ('name' in j ? (j as JenkinsJobSummary).name : '');
                      return (
                        <ListBox.Item key={val} id={val} textValue={val}>
                          <OverflowTooltip text={val} className="block" />
                        </ListBox.Item>
                      );
                    })}
                  </ListBox>
                </Select.Popover>
              </Select>
              <RefreshButton
                iconOnly
                label="刷新"
                ariaLabel="刷新 Jenkins Job 列表"
                loading={loadingJobs}
                onPress={() => setJobsRefreshCount((c) => c + 1)}
                className="shrink-0"
              />
            </div>
          </div>
        )}

        {baseTarget?.type === 'flow' && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">组织级 Flow 流水线</Label>
            <Select
              aria-label="选择云效 Flow 流水线"
              selectedKey={baseTarget.pipelineName || null}
              onSelectionChange={(key) => {
                const found = pipelines.find((p) => p.pipelineName === key);
                if (found) setSelectedTargetId(`flow:${found.pipelineId}`);
              }}
              className="w-full"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover className="z-50 max-h-60">
                <ListBox aria-label="云效 Flow 流水线列表">
                  {pipelines.map((p) => (
                    <ListBox.Item key={p.pipelineName} id={p.pipelineName} textValue={p.pipelineName}>
                      <OverflowTooltip text={p.pipelineName} className="block" />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        )}
      </div>

      {/* 最近执行标签快速选卡 */}
      {history.length > 0 && (
        <section className="flex flex-col gap-1.5" aria-labelledby="recent-builds-title">
          <div id="recent-builds-title" className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <ClockIcon className="size-3" />
            <span>最近执行</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {history.slice(0, 4).map((record) => {
              const isSelected = record.id === currentTarget?.id;
              const branchText =
                record.parameters?.branch ||
                record.parameters?.BRANCH ||
                record.parameters?.ref ||
                '';

              return (
                <div key={record.id} className="flex min-w-0 items-center gap-1 rounded-lg border border-border/60 bg-card/70 p-0.5">
                  <Button
                    type="button"
                    variant={isSelected ? 'secondary' : 'ghost'}
                    size="sm"
                    onPress={() => {
                      setSelectedTargetId(record.id);
                      if (record.jobFullName) setSelectedJobFullName(record.jobFullName);
                    }}
                    className={cn('min-w-0 justify-start gap-1.5', isSelected && 'text-foreground')}
                  >
                    {record.type === 'flow' ? (
                      <WorkflowIcon className="size-3 shrink-0 text-primary" />
                    ) : (
                      <TerminalIcon className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    <OverflowTooltip text={record.repoName} className="max-w-[110px]" />
                    {record.jobFullName && (
                      <OverflowTooltip
                        text={record.jobFullName}
                        className="max-w-[90px] text-[10px] text-muted-foreground"
                      />
                    )}
                    {branchText && (
                      <OverflowTooltip
                        text={branchText}
                        className="max-w-[80px] font-mono text-[10px] text-muted-foreground"
                      />
                    )}
                  </Button>
                  {/* 重跑：只读门控 + 两段式确认（4s 复位）由 WriteOpButton 统一承担 */}
                  <WriteOpButton
                    label="重跑"
                    title={`重跑 ${record.repoName} 构建`}
                    confirmLabel="确认重跑"
                    confirm="inline"
                    variant="ghost"
                    disabled={isTriggering(record.targetKey || record.id)}
                    disabledReason="构建触发中，请稍候"
                    onAction={async () => {
                      await triggerQuickBuild(record, record.parameters);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 就地自定义参数配置行 */}
      {currentTarget && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 bg-surface-secondary/50 p-3 sm:grid-cols-2">
          {/* 构建分支参数 */}
          <div className={cn("flex flex-col gap-1", !envParam && "sm:col-span-2")}>
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <GitBranchIcon className="size-3 text-primary" />
                <span>构建分支 ({branchParamName || 'branch'})</span>
              </Label>
              <span className="text-[10px] text-muted-foreground">支持输入或选择分支</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                aria-label="构建分支"
                value={params[branchParamName || 'branch'] ?? params['BRANCH'] ?? ''}
                onChange={(event) => {
                  const val = event.target.value;
                  setParams((prev) => ({
                    ...prev,
                    [branchParamName || 'branch']: val,
                    ...(prev['BRANCH'] !== undefined ? { BRANCH: val } : {}),
                  }));
                }}
                onKeyDown={(e) => {
                  // 阻止空格/回车等事件冒泡到外层，防止干扰外层弹窗或切换选项
                  e.stopPropagation();
                  if (e.nativeEvent.isComposing) return;
                }}
                placeholder="填写构建分支（如 master、feature/xxx）"
                className="min-w-0 flex-1 font-mono"
              />
              {loadingBranches ? (
                <Chip size="sm" variant="soft" color="default" className="h-8 shrink-0 gap-1 text-[11px]">
                  <Loader2Icon className="size-3 animate-spin" />
                  <span>分支…</span>
                </Chip>
              ) : branchOptions.length > 0 ? (
                <Select
                  aria-label="选择远端分支"
                  placeholder="远端分支"
                  onSelectionChange={(key) => {
                    if (key) {
                      const val = String(key);
                      setParams((prev) => ({
                        ...prev,
                        [branchParamName || 'branch']: val,
                        ...(prev['BRANCH'] !== undefined ? { BRANCH: val } : {}),
                      }));
                    }
                  }}
                  className="w-28 shrink-0"
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover className="z-50 max-h-60 w-56">
                    <ListBox aria-label="远端分支选项">
                      {branchOptions.map((b) => (
                        <ListBox.Item key={b} id={b} textValue={b} className="font-mono text-xs">
                          <OverflowTooltip text={b} className="block" />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              ) : null}
            </div>
          </div>

          {/* 部署环境参数（若有） */}
          {envParam && (
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] font-medium text-muted-foreground">
                部署环境 ({envParam.name})
              </Label>
              <Select
                aria-label="选择部署环境"
                selectedKey={params[envParam.name] || envParam.defaultValue || null}
                onSelectionChange={(key) => {
                  setParams((prev) => ({ ...prev, [envParam.name]: key ? String(key) : '' }));
                }}
                className="w-full"
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover className="z-50 max-h-60">
                  <ListBox aria-label="部署环境选项">
                    {envParam.choices.map((c) => (
                      <ListBox.Item key={c} id={c} textValue={c}>
                        <OverflowTooltip text={c} className="block" />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* 更多参数微调折叠项 (HeroUI Accordion) */}
      {otherParams.length > 0 && (
        <Accordion className="w-full px-0">
          <Accordion.Item id="more-build-params" className="border-none">
            <Accordion.Heading>
              <Accordion.Trigger className="group flex w-fit cursor-pointer items-center gap-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                <SlidersHorizontalIcon className="size-3" />
                <span>更多参数配置 (<span className="font-mono tabular-nums">{otherParams.length}</span> 个参数)</span>
                <Accordion.Indicator className="size-3" />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body className="p-0 pt-2">
                <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-border/60 bg-surface-secondary/50 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {otherParams.map((p) => (
                    <div key={p.name} className="flex flex-col gap-1">
                      <Label className="min-w-0 font-mono text-[10px] text-muted-foreground">
                        <OverflowTooltip text={p.name} className="min-w-0" />
                      </Label>
                      {p.choices && p.choices.length > 0 ? (
                        <Select
                          aria-label={p.name}
                          selectedKey={params[p.name] ?? p.defaultValue ?? null}
                          onSelectionChange={(val) => setParams((prev) => ({ ...prev, [p.name]: val ? String(val) : '' }))}
                          className="w-full"
                        >
                          <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                          </Select.Trigger>
                          <Select.Popover className="z-50 max-h-60">
                            <ListBox aria-label={p.name}>
                              {p.choices.map((c) => (
                                <ListBox.Item key={c} id={c} textValue={c}>
                                  <OverflowTooltip text={c} className="block" />
                                </ListBox.Item>
                              ))}
                            </ListBox>
                          </Select.Popover>
                        </Select>
                      ) : (
                        <Input
                          aria-label={p.name}
                          value={params[p.name] ?? p.defaultValue ?? ''}
                          onChange={(event) => setParams((prev) => ({ ...prev, [p.name]: event.target.value }))}
                          onKeyDown={(e) => {
                            // 阻止空格/回车等事件冒泡到外层，防止打断输入或误关外层
                            e.stopPropagation();
                            if (e.nativeEvent.isComposing) return;
                          }}
                          className="font-mono"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      {/* 构建摘要与触发栏（独立全宽底栏） */}
      {currentTarget && (
        <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-foreground">即将触发：</span>
            <OverflowTooltip
              text={currentTarget.repoName}
              className="max-w-[160px] font-medium text-foreground"
            />
            <span className="text-muted-foreground">·</span>
            <OverflowTooltip
              text={currentTarget.pipelineName}
              className="max-w-[160px] font-mono text-muted-foreground"
            />
            {branchParamName && (
              <>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1 font-mono text-muted-foreground">
                  <GitBranchIcon className="size-3 text-primary" />
                  {params[branchParamName] || '默认分支'}
                </span>
              </>
            )}
            {envParam && (
              <>
                <span className="text-border">|</span>
                <span className="font-mono font-semibold text-foreground">
                  环境: {params[envParam.name] || envParam.defaultValue || '-'}
                </span>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end">
            {/* 只读门控 + 两段式确认（4s 复位）统一由 WriteOpButton 承担，不再在调用点重画确认态 */}
            <WriteOpButton
              label="立即触发构建"
              title="触发当前流水线构建"
              confirmLabel="确认触发构建 (4s)"
              confirm="inline"
              variant="primary"
              disabled={isCurrentTriggering}
              disabledReason="正在触发…"
              onAction={handleTrigger}
            />
          </div>
        </div>
      )}
    </Card.Content>
  );
}
