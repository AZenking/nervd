import { useState } from 'react';
import { SparklesIcon, RefreshCwIcon, ServerIcon, WorkflowIcon } from 'lucide-react';
import type { JenkinsConnectionView, PipelineSummary, RepoCiBinding } from '@/types';
import { cn } from '@/lib/utils';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select';

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

export function RepoCiBindingFields({
  repoName: _repoName,
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
  const currentProvider = binding?.provider ?? 'none';

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
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <WorkflowIcon className="size-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground">关联 CI 流水线 (可选)</span>
        </div>
        {isMatchedRecommendation && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-sm">
            <SparklesIcon className="size-3" />
            <span>智能匹配</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field className="min-w-0">
          <FieldLabel>CI 提供方</FieldLabel>
          <SearchableSelect
            className="text-xs"
            ariaLabel="CI 提供方"
            disabled={disabled}
            value={currentProvider}
            onValueChange={handleProviderChange}
            items={[
              { label: '不关联 CI', value: 'none' },
              { label: '云效 Flow 流水线', value: 'flow' },
              { label: 'Jenkins 任务', value: 'jenkins' },
            ]}
          />
        </Field>

        {currentProvider === 'flow' && (
          <Field className="min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <FieldLabel className="mb-0">云效流水线</FieldLabel>
              {onRefreshPipelines && (
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing || loadingPipelines || disabled}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-50"
                  title="刷新云效流水线列表"
                >
                  <RefreshCwIcon className={cn('size-3', (refreshing || loadingPipelines) && 'animate-spin')} />
                  <span>刷新</span>
                </button>
              )}
            </div>
            <SearchableSelect
              className="text-xs"
              ariaLabel="选择云效流水线"
              disabled={disabled}
              value={
                binding?.provider === 'flow' && binding.pipelineId
                  ? String(binding.pipelineId)
                  : '__unset'
              }
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
                ...pipelines.map((p): SearchableSelectOption<string> => {
                  const isRec = recommendedPipeline?.pipelineId === p.pipelineId;
                  return {
                    label: isRec ? `★ ${p.pipelineName} (推荐)` : p.pipelineName,
                    value: String(p.pipelineId),
                  };
                }),
              ]}
              placeholder="搜索或选择流水线"
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
            <p className="text-amber-600 dark:text-amber-400">
              当前未获取到云效流水线，可点击右上角「刷新」重试，或在设置中确认访问令牌已具备 Flow 权限。
            </p>
          )}
        </div>
      )}

      {currentProvider === 'jenkins' && (
        <div className="flex flex-col gap-2.5 pt-1 border-t border-border/40">
          {jenkinsConnections.length === 0 ? (
            <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
              <ServerIcon className="size-4 shrink-0" />
              <span>尚未配置 Jenkins 实例。请先在「系统设置 → CI 集成」添加并验证 Jenkins 连接凭据。</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field className="min-w-0">
                <FieldLabel>Jenkins 实例</FieldLabel>
                <SearchableSelect
                  className="text-xs"
                  ariaLabel="Jenkins 实例"
                  disabled={disabled}
                  value={
                    binding?.provider === 'jenkins' && binding.connectionId
                      ? binding.connectionId
                      : '__unset'
                  }
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

              <Field className="min-w-0">
                <FieldLabel>Job 全路径</FieldLabel>
                <Input
                  className="h-8 text-xs font-mono"
                  disabled={disabled}
                  aria-label="Jenkins Job 全路径"
                  value={binding?.provider === 'jenkins' ? binding.jobFullName : ''}
                  placeholder="如：folder/job-name"
                  onChange={(e) => {
                    if (binding?.provider === 'jenkins') {
                      onChange({
                        ...binding,
                        jobFullName: e.target.value,
                      });
                    }
                  }}
                />
              </Field>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
