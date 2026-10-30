import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDownIcon,
  ClockIcon,
  GitBranchIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
  WorkflowIcon,
  ZapIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import {
  extractConfiguredBuildTargets,
  useQuickBuild,
} from '@/store/quick-build';
import { getCachedJenkinsJobParameters } from '@/lib/jenkins-cache';
import { isBranchParameterName, isEnvironmentParameterName } from '@/lib/ci';
import type { JenkinsJobParameter } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/searchable-select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function QuickBuildConsole() {
  const settings = useApp((s) => s.settings);
  const repositories = useApp((s) => s.repositories);
  const history = useQuickBuild((s) => s.history);
  const triggeringId = useQuickBuild((s) => s.triggeringId);
  const triggerQuickBuild = useQuickBuild((s) => s.triggerQuickBuild);

  // 1. 获取所有配置好的构建目标
  const configuredTargets = useMemo(
    () => extractConfiguredBuildTargets(settings, repositories),
    [settings, repositories],
  );

  // 2. 当前选中的构建目标（优先取最近构建第 1 条，否则取已配置的目标第 1 条）
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');

  const currentTarget = useMemo(() => {
    if (selectedTargetId) {
      const foundInHistory = history.find((h) => h.id === selectedTargetId);
      if (foundInHistory) return foundInHistory;
      const foundInConfig = configuredTargets.find((c) => c.id === selectedTargetId);
      if (foundInConfig) return foundInConfig;
    }
    return history[0] || configuredTargets[0] || null;
  }, [selectedTargetId, history, configuredTargets]);

  // 当外部数据载入时，默认对齐有效目标
  useEffect(() => {
    if (!selectedTargetId && currentTarget) {
      setSelectedTargetId(currentTarget.id);
    }
  }, [currentTarget, selectedTargetId]);

  // 3. 当前目标的自定义参数状态
  const [params, setParams] = useState<Record<string, string>>({});

  // 切换目标时同步参数
  useEffect(() => {
    if (currentTarget) {
      setParams(currentTarget.parameters || {});
    }
  }, [currentTarget?.id]);

  // 4. 若为 Jenkins，异步拉取该 Job 的参数元数据
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
            // 用默认参数补齐尚未填写的字段
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

  // 5. 异步拉取当前仓库的远端分支列表（供分支输入框下拉辅助选择）
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

  // 6. 识别出主分支字段与主环境字段
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

  // 其他普通参数
  const otherParams = useMemo(() => {
    return jobParams.filter((p) => p.name !== branchParamName && p.name !== envParam?.name);
  }, [jobParams, branchParamName, envParam]);

  // 7. 发起构建动作
  const handleTriggerCurrent = async () => {
    if (!currentTarget) return;
    await triggerQuickBuild(currentTarget, params);
  };

  const isTriggering = triggeringId === currentTarget?.id;

  // 如果没有任何配置的流水线，也不展示空壳
  if (!currentTarget && configuredTargets.length === 0 && history.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="quick-build-console"
      className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface/40 p-4 shadow-xs backdrop-blur-xs transition-colors"
    >
      {/* 头部：标题 + 目标选择 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
            <ZapIcon className="size-3.5 fill-current" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-2">
              <span>快捷构建控制台</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                直接就地自定义参数并触发
              </span>
            </h3>
          </div>
        </div>

        {/* 目标流水线切换器 */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground shrink-0">当前目标:</span>
          {loadingParams && <Loader2Icon className="size-3 animate-spin text-muted-foreground shrink-0" />}
          <SearchableSelect
            className="w-56 text-xs h-7"
            ariaLabel="选择构建目标仓库与流水线"
            value={currentTarget?.id || ''}
            onValueChange={(val) => {
              if (val) setSelectedTargetId(val);
            }}
            items={configuredTargets.map((t) => ({
              label: `${t.repoName} (${t.type === 'flow' ? 'Flow' : 'Jenkins'})`,
              value: t.id,
            }))}
          />
        </div>
      </div>

      {/* 1. 最近构建标签快速选卡 */}
      {history.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 pr-1">
            <ClockIcon className="size-3" />
            <span>最近执行:</span>
          </div>
          {history.slice(0, 4).map((record) => {
            const isSelected = record.id === currentTarget?.id;
            const branchText =
              record.parameters?.branch ||
              record.parameters?.BRANCH ||
              record.parameters?.ref ||
              '';

            return (
              <div
                key={record.id}
                onClick={() => setSelectedTargetId(record.id)}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-xs transition-all select-none',
                  isSelected
                    ? 'border-primary/50 bg-primary/10 text-foreground font-medium shadow-xs'
                    : 'border-hairline bg-surface/60 text-muted-foreground hover:border-border hover:bg-surface hover:text-foreground',
                )}
              >
                {record.type === 'flow' ? (
                  <WorkflowIcon className="size-3 text-primary shrink-0" />
                ) : (
                  <TerminalIcon className="size-3 text-amber-500 shrink-0" />
                )}
                <span className="truncate max-w-[110px]">{record.repoName}</span>
                {branchText && (
                  <span className="text-[10px] font-mono opacity-70 truncate max-w-[90px]">
                    {branchText}
                  </span>
                )}
                <Tooltip>
                  <TooltipTrigger
                    disabled={triggeringId === record.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void triggerQuickBuild(record);
                    }}
                    className={cn(
                      'flex items-center justify-center size-4 rounded hover:bg-emerald-500/20 text-emerald-500 transition-colors',
                      triggeringId === record.id && 'animate-spin',
                    )}
                    aria-label={`重跑 ${record.repoName} 构建`}
                  >
                    <PlayIcon className="size-2 fill-current" />
                  </TooltipTrigger>
                  <TooltipContent side="top">按上次参数立即重跑</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. 就地自定义参数配置行 */}
      {currentTarget && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-muted/20 border border-hairline/40 rounded-lg p-3">
          {/* 构建分支参数 */}
          <div className="flex flex-col gap-1 sm:col-span-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <GitBranchIcon className="size-3 text-primary" />
                <span>构建分支 ({branchParamName || 'branch'})</span>
              </span>
              <span className="text-[10px] text-muted-foreground/70">支持手动输入或下拉选择</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={params[branchParamName || 'branch'] ?? params['BRANCH'] ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setParams((prev) => ({
                    ...prev,
                    [branchParamName || 'branch']: val,
                    ...(prev['BRANCH'] !== undefined ? { BRANCH: val } : {}),
                  }));
                }}
                placeholder="填写构建分支（如 master、feature/xxx）"
                className="font-mono text-xs h-7 flex-1"
              />
              {loadingBranches ? (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground px-2 h-7 border border-hairline/60 rounded-md bg-muted/30 shrink-0">
                  <Loader2Icon className="size-3 animate-spin" />
                  <span>分支…</span>
                </div>
              ) : branchOptions.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 gap-1 px-2 text-xs"
                      />
                    }
                  >
                    <span>远端分支</span>
                    <ChevronDownIcon className="size-3 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 max-h-60 overflow-y-auto z-50">
                    {branchOptions.map((b) => (
                      <DropdownMenuItem
                        key={b}
                        onClick={() => {
                          setParams((prev) => ({
                            ...prev,
                            [branchParamName || 'branch']: b,
                            ...(prev['BRANCH'] !== undefined ? { BRANCH: b } : {}),
                          }));
                        }}
                        className="font-mono text-xs"
                      >
                        {b}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          {/* 部署环境参数（若有） */}
          {envParam && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                部署环境 ({envParam.name})
              </label>
              <SearchableSelect
                className="text-xs h-7"
                ariaLabel="选择部署环境"
                value={params[envParam.name] || envParam.defaultValue || ''}
                onValueChange={(val) => {
                  setParams((prev) => ({ ...prev, [envParam.name]: val ?? '' }));
                }}
                items={envParam.choices.map((c) => ({
                  label: c,
                  value: c,
                }))}
              />
            </div>
          )}

          {/* 触发操作按钮 */}
          <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-1 ml-auto w-full sm:w-auto">
            <Button
              type="button"
              size="sm"
              disabled={isTriggering}
              onClick={() => void handleTriggerCurrent()}
              className="h-7 w-full sm:w-auto px-4 gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-transform active:scale-95"
            >
              {isTriggering ? (
                <>
                  <RefreshCwIcon className="size-3.5 animate-spin" />
                  <span>正在触发…</span>
                </>
              ) : (
                <>
                  <PlayIcon className="size-3 fill-current" />
                  <span>立即发起构建</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* 3. 其它参数微调折叠项（针对复杂的 Jenkins 任务） */}
      {otherParams.length > 0 && (
        <details className="text-xs text-muted-foreground group">
          <summary className="cursor-pointer select-none py-1 hover:text-foreground flex items-center gap-1.5 font-medium text-[11px]">
            <SlidersHorizontalIcon className="size-3" />
            <span>更多参数配置 ({otherParams.length} 个参数)</span>
          </summary>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2.5 rounded-lg border border-hairline/60 bg-muted/10">
            {otherParams.map((p) => (
              <div key={p.name} className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-muted-foreground truncate">
                  {p.name}
                </span>
                {p.choices && p.choices.length > 0 ? (
                  <SearchableSelect
                    className="text-xs h-6.5"
                    ariaLabel={p.name}
                    value={params[p.name] ?? p.defaultValue ?? ''}
                    onValueChange={(val) => setParams((prev) => ({ ...prev, [p.name]: val ?? '' }))}
                    items={p.choices.map((c) => ({ label: c, value: c }))}
                  />
                ) : (
                  <Input
                    value={params[p.name] ?? p.defaultValue ?? ''}
                    onChange={(e) => setParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                    className="text-xs font-mono h-6.5"
                  />
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
