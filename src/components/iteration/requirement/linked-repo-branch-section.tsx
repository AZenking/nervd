import { CheckIcon, GitForkIcon, Loader2Icon } from 'lucide-react';
import type { BranchRuleTemplate } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CopyButton } from '@/components/ui/copy-button';
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { BranchDivergenceCheck, useBranchDivergence } from '../BranchDivergenceCheck';
import { IterationDevDivergence } from './iteration-dev-divergence';
import type { IterationBaselineCheck } from './types';
import type { RepoTraceState } from './linked-repo-delivery';

export interface LinkedRepoBranchStatusProps {
  developerBranchState: IterationBaselineCheck['state'];
  traceState: RepoTraceState;
  divergence: ReturnType<typeof useBranchDivergence>;
}

export function LinkedRepoBranchStatus({
  developerBranchState,
  traceState,
  divergence,
}: LinkedRepoBranchStatusProps) {
  if (developerBranchState === 'loading' || traceState === 'loading') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin shrink-0 text-primary" />
        <span className="truncate">查询分支…</span>
      </div>
    );
  }
  if (developerBranchState === 'missing') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-muted-foreground/60 shrink-0" />
        <span className="truncate">未创建需求分支</span>
      </div>
    );
  }
  if (developerBranchState === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive">
        <span className="size-2 rounded-full bg-destructive shrink-0" />
        <span className="truncate">分支查询失败</span>
      </div>
    );
  }
  if (divergence.check.status === 'ready') {
    const devOnly = divergence.check.developmentOnly ?? 0;
    const baseOnly = divergence.check.baselineOnly ?? 0;
    if (devOnly > 0) {
      return (
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="size-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
          <span className="truncate">超前 {devOnly} 提交</span>
          {baseOnly > 0 && (
            <span
              className="text-[11px] text-amber-600 dark:text-amber-400 font-normal truncate"
              title={`落后基准 ${baseOnly} 提交`}
            >
              / 需合入 {baseOnly}
            </span>
          )}
        </div>
      );
    }
    if (baseOnly > 0) {
      return (
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <span className="size-2 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0" />
          <span className="truncate">落后基准 {baseOnly} 提交</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <span className="size-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
        <span className="truncate">与基准已对齐</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
      <span className="size-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
      <span className="truncate">需求分支已就绪</span>
    </div>
  );
}

export interface LinkedRepoBranchSectionProps {
  repoId: number;
  repoName: string;
  developerBranch: string;
  developerBranchState: IterationBaselineCheck['state'];
  operationBaseBranch: string;
  iterationId?: string;
  baselineBranch?: string;
  configuredBaselineBranch: string;
  baselineState?: IterationBaselineCheck['state'];
  defaultBaseState: IterationBaselineCheck['state'];
  onRetryBaseline: () => void;
  templateId?: string;
  templates: (BranchRuleTemplate | ScopedBranchRuleTemplate)[];
  templateEnabled: boolean;
  hasValidRule: boolean;
  onTemplateChange: (templateId: string | null) => void;
  templateSourceBranch: string;
  templateSelectId: string;
  extraMatchedBranches: string[];
}

export function LinkedRepoBranchSection({
  repoId,
  repoName,
  developerBranch,
  developerBranchState,
  operationBaseBranch,
  iterationId,
  baselineBranch,
  configuredBaselineBranch,
  baselineState,
  defaultBaseState,
  onRetryBaseline,
  templateId,
  templates,
  templateEnabled,
  hasValidRule,
  onTemplateChange,
  templateSourceBranch,
  templateSelectId,
  extraMatchedBranches,
}: LinkedRepoBranchSectionProps) {
  return (
    <>
      {/* 分支元数据与规则网格 (2x2 Grid) */}
      <section className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 text-xs" aria-label="分支与交付信息">
        {/* 需求分支 */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">需求分支</span>
          {developerBranch ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <Chip
                size="sm"
                variant="soft"
                className="h-5 max-w-36 gap-1 px-1.5 font-mono text-xs font-semibold sm:max-w-48"
              >
                <OverflowTooltip text={developerBranch} className="max-w-32 truncate sm:max-w-44" />
              </Chip>
              <CopyButton text={developerBranch} label="复制需求分支名" />
              {developerBranchState === 'exists' && (
                <Chip size="sm" variant="soft" color="success" className="h-5 gap-1 px-1.5 text-[11px]">
                  <CheckIcon className="size-3" aria-hidden="true" />
                  已存在
                </Chip>
              )}
              {developerBranchState === 'loading' && <Skeleton className="h-4 w-10 rounded-sm" />}
              {developerBranchState === 'error' && (
                <Chip size="sm" variant="soft" color="danger" className="h-5 px-1.5 text-[11px]">
                  查询失败
                </Chip>
              )}
            </div>
          ) : (
            <Chip
              size="sm"
              variant="tertiary"
              className="h-5 px-1.5 font-mono text-xs text-muted-foreground"
            >
              未配置
            </Chip>
          )}
        </div>

        {/* 目标基准 */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">目标基准</span>
          {operationBaseBranch ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Chip
                      size="sm"
                      variant="soft"
                      color="accent"
                      className="h-5 max-w-36 cursor-help gap-1 px-1.5 font-mono text-xs sm:max-w-48"
                    >
                      <span className="max-w-32 truncate sm:max-w-44">{operationBaseBranch}</span>
                    </Chip>
                  }
                />
                <TooltipContent className="max-w-96 break-all font-mono text-xs">
                  {operationBaseBranch}
                </TooltipContent>
              </Tooltip>
              <CopyButton text={operationBaseBranch} label="复制目标基准分支名" />
              {iterationId && baselineState === 'missing' && (
                <Chip size="sm" variant="soft" color="warning" className="h-5 px-1.5 text-[11px]">
                  未创建
                </Chip>
              )}
              {iterationId && baselineState === 'error' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-5 px-1 text-[10px] text-destructive"
                  onClick={onRetryBaseline}
                >
                  重试
                </Button>
              )}
            </div>
          ) : (
            <Chip
              size="sm"
              variant="tertiary"
              className="h-5 px-1.5 font-mono text-xs text-muted-foreground"
            >
              未配置
            </Chip>
          )}
        </div>

        {/* 分支规则 */}
        {iterationId || templateEnabled ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-muted-foreground">分支规则</span>
            <div className="min-w-0 flex-1 max-w-56">
              <SearchableSelect
                id={templateSelectId}
                ariaLabel={'为 ' + repoName + ' 选择分支模板'}
                className="h-7 w-full text-xs py-0.5"
                value={templateId || '__none'}
                onValueChange={(value) => onTemplateChange(value && value !== '__none' ? value : null)}
                items={[
                  { label: '未选择模板', value: '__none' },
                  ...templates.map((template): SearchableSelectOption<string> => {
                    const scopeTag =
                      'scope' in template && template.scope === 'iteration'
                        ? ' (迭代专属)'
                        : 'scope' in template && template.scope === 'global'
                          ? ' (全局)'
                          : '';
                    return { label: template.name + scopeTag, value: template.id };
                  }),
                  ...(templateId && !templates.some((template) => template.id === templateId)
                    ? [{ label: '模板不可用', value: templateId, disabled: true }]
                    : []),
                ]}
              />
            </div>
            {!hasValidRule && (
              <Chip
                size="sm"
                variant="soft"
                color="warning"
                className="h-5 shrink-0 px-1.5 text-[11px]"
                title="需要选择有效模板"
              >
                需选模板
              </Chip>
            )}
          </div>
        ) : (
          <div />
        )}

        {/* 主干同步 / 模板源分支 */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          {templateSourceBranch && (
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-muted-foreground">模板源</span>
              <Chip
                size="sm"
                variant="secondary"
                className="h-5 max-w-32 gap-1 px-1.5 font-mono text-xs font-normal"
              >
                <OverflowTooltip text={templateSourceBranch} className="max-w-28 truncate" />
              </Chip>
            </div>
          )}
          {iterationId && templateSourceBranch && baselineState === 'exists' && (
            <div className="min-w-0 flex-1">
              <IterationDevDivergence
                repoId={repoId}
                baselineBranch={baselineBranch ?? configuredBaselineBranch}
                sourceBranch={templateSourceBranch}
                baselineState={baselineState}
              />
            </div>
          )}
        </div>
      </section>

      {/* 分支同步差异 */}
      <Separator className="bg-border/40" />
      <section className="min-w-0" aria-label="分支差异">
        <BranchDivergenceCheck
          repoId={repoId}
          developmentBranch={developerBranch}
          baselineBranch={operationBaseBranch}
          baselineState={iterationId ? baselineState : defaultBaseState}
          onRetryBaseline={onRetryBaseline}
        />
      </section>

      {/* 其他匹配分支 */}
      {extraMatchedBranches.length > 0 && (
        <>
          <Separator className="bg-border/40" />
          <section className="flex min-w-0 flex-col gap-2" aria-label="其他关联分支">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <GitForkIcon className="size-3.5" aria-hidden="true" />
              <span>其他匹配分支</span>
              <span className="font-mono text-[11px] text-muted-foreground">({extraMatchedBranches.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {extraMatchedBranches.map((branch) => (
                <div key={branch} className="flex items-center gap-1">
                  <Chip
                    size="sm"
                    variant="secondary"
                    className="h-5 max-w-64 gap-1 px-1.5 font-mono text-xs font-normal"
                  >
                    <OverflowTooltip text={branch} className="max-w-56 truncate" />
                  </Chip>
                  <CopyButton text={branch} label="复制分支名" />
                  {templateEnabled && operationBaseBranch && (
                    <BranchDivergenceCheck
                      repoId={repoId}
                      developmentBranch={branch}
                      baselineBranch={operationBaseBranch}
                      baselineState={baselineState}
                      onRetryBaseline={onRetryBaseline}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
