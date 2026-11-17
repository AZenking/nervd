import { useEffect, useMemo, useState } from 'react';
import { Surface } from '@/components/ui/surface';
import { AlertCircleIcon, RefreshCwIcon, ServerIcon, SparklesIcon, WorkflowIcon } from 'lucide-react';
import type { JenkinsConnectionView, JenkinsJobSummary, PipelineSummary, RepoCiBinding } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Field, FieldLabel } from '@/components/ui/field';
import { ComboBox } from '@/components/ui/combo-box';
import { Input } from '@/components/ui/input';
import { ListBox } from '@/components/ui/list-box';
import { SectionHeader } from '@/components/section-header';
import { getCachedJenkinsJobs, hasCachedJobs } from '@/lib/jenkins-cache';
import { humanizeError } from '@/lib/error-format';

export interface RepoCiBindingFieldsProps {
  repoName: string;
  binding: RepoCiBinding | null;
  onChange: (binding: RepoCiBinding | null) => void;
  pipelines: PipelineSummary[];
  jenkinsConnections: JenkinsConnectionView[];
  loadingPipelines?: boolean;
  onRefreshPipelines?: () => Promise<void>;
  recommendedPipeline?: PipelineSummary | null;
  recommendReason?: string;
  disabled?: boolean;
}

export interface CiComboOption {
  label: string;
  value: string;
  disabled?: boolean;
}

/**
 * CI 配置区统一的 HeroUI ComboBox 字段：
 * 提供方 / 流水线 / Jenkins 实例 / Job 全路径 四类控件同一外观（输入即过滤 + 下拉列表），
 * 不再混用自绘 SearchableSelect 与 HeroUI Select —— 后者高度来自内距（36px），
 * 与 ComboBox/Input 的 32px 字段密度并排时会出现「大小不一致」（2026-11-17 设计评审）。
 */
function CiComboBox({
  label,
  value,
  onValueChange,
  items,
  placeholder,
  disabled,
  allowsCustomValue,
}: {
  label: string;
  value: string;
  onValueChange: (value: string | null) => void;
  items: CiComboOption[];
  placeholder: string;
  disabled?: boolean;
  allowsCustomValue?: boolean;
}) {
  return (
    <ComboBox
      className="w-full text-xs"
      aria-label={label}
      isDisabled={disabled}
      selectedKey={value}
      allowsCustomValue={allowsCustomValue}
      onValueChange={onValueChange}
    >
      <ComboBox.InputGroup>
        <Input placeholder={placeholder} aria-label={label} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox aria-label={label} className="max-h-64 overflow-y-auto">
          {items.map((item) => (
            <ListBox.Item
              key={item.value}
              id={item.value}
              textValue={item.label}
              isDisabled={item.disabled}
            >
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}

export function RepoCiBindingFields({
  repoName,
  binding,
  onChange,
  pipelines,
  jenkinsConnections,
  loadingPipelines = false,
  onRefreshPipelines,
  recommendedPipeline,
  recommendReason,
  disabled = false,
}: RepoCiBindingFieldsProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [jenkinsJobs, setJenkinsJobs] = useState<JenkinsJobSummary[]>([]);
  const [loadingJenkinsJobs, setLoadingJenkinsJobs] = useState(false);
  const [jenkinsJobsRefresh, setJenkinsJobsRefresh] = useState(0);
  const [jenkinsJobsError, setJenkinsJobsError] = useState<string | null>(null);

  const currentProvider = binding?.provider ?? 'none';
  const selectedConnectionId = binding?.provider === 'jenkins' ? binding.connectionId : '';

  useEffect(() => {
    if (currentProvider !== 'jenkins' || !selectedConnectionId) {
      setJenkinsJobs([]);
      setLoadingJenkinsJobs(false);
      setJenkinsJobsError(null);
      return;
    }

    let active = true;
    const isManualRefresh = jenkinsJobsRefresh > 0;

    if (!hasCachedJobs(selectedConnectionId) || isManualRefresh) {
      setLoadingJenkinsJobs(true);
    }
    setJenkinsJobsError(null);

    void getCachedJenkinsJobs(selectedConnectionId, {
      force: isManualRefresh,
      onStaleUpdate: (freshJobs) => {
        if (active) setJenkinsJobs(freshJobs);
      },
    })
      .then(({ jobs: items }) => {
        if (active) setJenkinsJobs(items);
      })
      .catch((err: unknown) => {
        if (active) {
          setJenkinsJobsError(humanizeError(err, '未能获取 Job 列表'));
        }
      })
      .finally(() => {
        if (active) setLoadingJenkinsJobs(false);
      });

    return () => {
      active = false;
    };
  }, [currentProvider, selectedConnectionId, jenkinsJobsRefresh]);

  const { jenkinsJobOptions, recommendedJobName } = useMemo(() => {
    if (binding?.provider !== 'jenkins') {
      return { jenkinsJobOptions: [], recommendedJobName: null };
    }

    const currentJob = binding.jobFullName.trim();
    const items = [...jenkinsJobs];

    if (currentJob && !items.some((j) => j.fullName === currentJob)) {
      items.unshift({
        name: currentJob.split('/').pop() || currentJob,
        fullName: currentJob,
      });
    }

    const normalizedRepo = repoName.trim().toLowerCase();
    let bestMatchName: string | null = null;
    if (normalizedRepo) {
      const exact = items.find((j) => j.name.toLowerCase() === normalizedRepo);
      if (exact) {
        bestMatchName = exact.fullName;
      } else {
        const partial = items.find((j) => j.fullName.toLowerCase().includes(normalizedRepo));
        if (partial) {
          bestMatchName = partial.fullName;
        }
      }
    }

    const options: CiComboOption[] = [
      { label: '选择或输入 Job 全路径', value: '__unset' },
    ];

    for (const job of items) {
      const isRec = job.fullName === bestMatchName;
      options.push({
        label: isRec ? `★ ${job.fullName} (推荐)` : job.fullName,
        value: job.fullName,
      });
    }

    return { jenkinsJobOptions: options, recommendedJobName: bestMatchName };
  }, [binding?.provider === 'jenkins' ? binding.jobFullName : '', jenkinsJobs, repoName]);

  const handleProviderChange = (providerVal: string | null) => {
    if (!providerVal || providerVal === 'none') {
      onChange(null);
    } else if (providerVal === 'flow') {
      const defaultPipeline = recommendedPipeline || pipelines[0];
      onChange({
        provider: 'flow',
        pipelineId: defaultPipeline?.pipelineId ?? 0,
        pipelineName: defaultPipeline?.pipelineName ?? '',
      });
    } else if (providerVal === 'jenkins') {
      onChange({
        provider: 'jenkins',
        connectionId: jenkinsConnections[0]?.id ?? '',
        jobFullName: '',
      });
    }
  };

  const handleRefresh = async () => {
    if (!onRefreshPipelines || refreshing || loadingPipelines) return;
    setRefreshing(true);
    try {
      await onRefreshPipelines();
    } finally {
      setRefreshing(false);
    }
  };

  const isMatchedRecommendation =
    binding?.provider === 'flow' &&
    recommendedPipeline &&
    binding.pipelineId === recommendedPipeline.pipelineId;

  return (
    <Surface variant="secondary" className="flex flex-col gap-3 p-3.5">
      <SectionHeader
        level="h3"
        title={(
          <span className="inline-flex items-center gap-1.5">
            <WorkflowIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>关联 CI 流水线 (可选)</span>
          </span>
        )}
        action={isMatchedRecommendation ? (
          <Chip size="sm" color="accent" variant="soft" className="gap-1 font-medium">
            <SparklesIcon className="size-3" />
            <span>智能匹配</span>
          </Chip>
        ) : undefined}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field className="min-w-0">
          <div className="flex items-center h-5 mb-1.5">
            <FieldLabel className="mb-0">CI 提供方</FieldLabel>
          </div>
          <CiComboBox
            label="CI 提供方"
            value={currentProvider}
            onValueChange={handleProviderChange}
            placeholder="选择 CI 提供方"
            disabled={disabled}
            items={[
              { label: '不关联 CI', value: 'none' },
              { label: '云效 Flow 流水线', value: 'flow' },
              { label: 'Jenkins 任务', value: 'jenkins' },
            ]}
          />
        </Field>

        {currentProvider === 'flow' && (
          <Field className="min-w-0">
            <div className="flex items-center justify-between h-5 mb-1.5">
              <FieldLabel className="mb-0">云效流水线</FieldLabel>
              {onRefreshPipelines && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onPress={() => void handleRefresh()}
                        disabled={refreshing || loadingPipelines || disabled}
                        className="gap-1"
                        aria-label="刷新云效流水线列表"
                      >
                        <RefreshCwIcon className={cn('size-3', (refreshing || loadingPipelines) && 'animate-spin')} />
                        <span>刷新</span>
                      </Button>
                    }
                  />
                  <TooltipContent>刷新云效流水线列表</TooltipContent>
                </Tooltip>
              )}
            </div>
            <CiComboBox
              label="云效流水线"
              value={
                binding?.provider === 'flow' && binding.pipelineId
                  ? String(binding.pipelineId)
                  : '__unset'
              }
              disabled={disabled}
              placeholder="搜索或选择流水线"
              onValueChange={(val) => {
                if (!val || val === '__unset') {
                  onChange({ provider: 'flow', pipelineId: 0, pipelineName: '' });
                  return;
                }
                const found = pipelines.find((p) => String(p.pipelineId) === val);
                onChange({
                  provider: 'flow',
                  pipelineId: found?.pipelineId ?? 0,
                  pipelineName: found?.pipelineName ?? '',
                });
              }}
              items={[
                { label: '请选择云效流水线', value: '__unset' },
                ...pipelines.map((p) => {
                  const isRec = recommendedPipeline?.pipelineId === p.pipelineId;
                  return {
                    label: isRec ? `★ ${p.pipelineName} (推荐)` : p.pipelineName,
                    value: String(p.pipelineId),
                  };
                }),
              ]}
            />
          </Field>
        )}

        {currentProvider === 'jenkins' && (
          <Field className="min-w-0">
            <div className="flex items-center h-5 mb-1.5">
              <FieldLabel className="mb-0">Jenkins 实例</FieldLabel>
            </div>
            <CiComboBox
              label="Jenkins 实例"
              value={
                binding?.provider === 'jenkins' && binding.connectionId
                  ? binding.connectionId
                  : '__unset'
              }
              disabled={disabled || jenkinsConnections.length === 0}
              placeholder={jenkinsConnections.length === 0 ? '尚未配置实例' : '选择 Jenkins 实例'}
              onValueChange={(val) => {
                if (binding?.provider === 'jenkins') {
                  onChange({
                    ...binding,
                    connectionId: val && val !== '__unset' ? val : '',
                  });
                }
              }}
              items={[
                { label: '选择 Jenkins 实例', value: '__unset' },
                ...jenkinsConnections.map((c) => ({
                  label: c.name || c.baseUrl || c.id,
                  value: c.id,
                })),
              ]}
            />
          </Field>
        )}
      </div>

      {currentProvider === 'flow' && (
        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {recommendReason && isMatchedRecommendation && (
            <p className="text-primary flex items-center gap-1">
              <SparklesIcon className="size-3 shrink-0" />
              <span>{recommendReason}</span>
            </p>
          )}
          {pipelines.length === 0 && !loadingPipelines && (
            <p className="text-warning">
              当前未获取到云效流水线，可点击右上角「刷新」重试，或在设置中确认访问令牌已具备 Flow 权限。
            </p>
          )}
        </div>
      )}

      {currentProvider === 'jenkins' && (
        jenkinsConnections.length === 0 ? (
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-warning/10 text-warning text-xs">
            <ServerIcon className="size-4 shrink-0" />
            <span>尚未配置 Jenkins 实例。请先在「系统设置 → 构建集成」添加并验证 Jenkins 连接凭据。</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Field className="w-full">
              <div className="flex items-center justify-between h-5 mb-1.5">
                <FieldLabel className="mb-0">Job 全路径</FieldLabel>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onPress={() => setJenkinsJobsRefresh((c) => c + 1)}
                        disabled={loadingJenkinsJobs || disabled || !selectedConnectionId}
                        className="gap-1"
                        aria-label="刷新 Jenkins Job 列表"
                      >
                        <RefreshCwIcon className={cn('size-3', loadingJenkinsJobs && 'animate-spin')} />
                        <span>刷新</span>
                      </Button>
                    }
                  />
                  <TooltipContent>刷新 Jenkins Job 列表</TooltipContent>
                </Tooltip>
              </div>
              <CiComboBox
                label="Jenkins Job 全路径"
                value={
                  binding?.provider === 'jenkins' && binding.jobFullName
                    ? binding.jobFullName
                    : '__unset'
                }
                disabled={disabled || loadingJenkinsJobs}
                allowsCustomValue
                placeholder={
                  loadingJenkinsJobs
                    ? '正在拉取 Jenkins Job…'
                    : !selectedConnectionId
                      ? '请先选择 Jenkins 实例'
                      : '搜索或输入 Job 全路径'
                }
                onValueChange={(val) => {
                  if (binding?.provider === 'jenkins') {
                    onChange({
                      ...binding,
                      jobFullName: val && val !== '__unset' ? val : '',
                    });
                  }
                }}
                items={jenkinsJobOptions}
              />
            </Field>

            {jenkinsJobsError && (
              <div className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircleIcon className="size-3.5 shrink-0" />
                <span>读取 Jenkins Job 列表失败：{jenkinsJobsError}（仍可直接输入全路径）</span>
              </div>
            )}
            {recommendedJobName && (
              <p className="text-[11px] text-primary flex items-center gap-1">
                <SparklesIcon className="size-3 shrink-0" />
                <span>已根据仓库名「{repoName}」智能匹配候选 Job</span>
              </p>
            )}
          </div>
        )
      )}
    </Surface>
  );
}
