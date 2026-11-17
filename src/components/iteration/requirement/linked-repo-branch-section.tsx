import { useState } from 'react';
import { ArrowRightIcon, ChevronRightIcon } from 'lucide-react';
import type { BranchRuleTemplate } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CopyButton } from '@/components/ui/copy-button';
import { ComboBox } from '@/components/ui/combo-box';
import { Input } from '@/components/ui/input';
import { ListBox } from '@/components/ui/list-box';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { SectionHeader } from '@/components/section-header';
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
    return <Skeleton className="h-4 w-28 rounded-sm" />;
  }
  if (developerBranchState === 'missing') {
    return <span className="text-[13px] text-muted-foreground">未创建需求分支</span>;
  }
  if (developerBranchState === 'error') {
    return <span className="text-[13px] text-danger">分支查询失败</span>;
  }
  if (divergence.check.status === 'ready') {
    const devOnly = divergence.check.developmentOnly ?? 0;
    const baseOnly = divergence.check.baselineOnly ?? 0;
    if (devOnly === 0 && baseOnly === 0) {
      return <span className="text-[13px] font-medium text-success">与基准已对齐</span>;
    }
    return (
      <span className="text-[13px] font-medium text-foreground">
        开发独有 <span className="font-mono tabular-nums">{devOnly}</span>
        {' · '}
        迭代独有 <span className="font-mono tabular-nums">{baseOnly}</span>
      </span>
    );
  }
  return <span className="text-[13px] text-muted-foreground">分支已就绪</span>;
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
  onTemplateChange: (templateId: string | null) => void;
  templateSourceBranch: string;
  templateSelectId: string;
  extraMatchedBranches: string[];
  /** 解析后规则命中的交付轨道名（含方案 A 自动继承），用于轨道来源信息 chip。 */
  trackTemplateName?: string;
  /** 继承来源：workitem = 需求级显式覆盖；iteration/global = 方案 A 自动继承的模板作用域。 */
  trackOrigin?: 'workitem' | 'iteration' | 'global';
  /** 直连主干模式（Trunk-Based）：迭代基准即模板源分支，不派生迭代基准。 */
  directConnect?: boolean;
  /** 写操作（创建迭代基准 / 需求分支）：作为「分支关系」标题行右端的动作呈现。 */
  deliveryAction?: React.ReactNode;
}

/**
 * 交付详情 · 分支关系区块（2026-11-17 布局评审）：
 * 标题行 = 「分支关系」+ 分支规则选择器（+ 写操作）；
 * 正文 = 需求分支 → 目标基准 两栏拓扑面板（顶部标签、分支 chip + 复制 + 存在态），
 * 面板底行 = 模板源 / 规则来源；
 * 面板下方 = 两条带边框的落差行（开发分支 ↔ 迭代分支、源分支 → 迭代分支）+ 其他匹配分支。
 */
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
  onTemplateChange,
  templateSourceBranch,
  templateSelectId,
  extraMatchedBranches,
  trackTemplateName,
  trackOrigin,
  directConnect,
  deliveryAction,
}: LinkedRepoBranchSectionProps) {
  // 轨道来源（方案 A）：优先按解析结果的 origin 判定；origin 缺失时回退以显式 templateId 判定
  const hasTrackOverride = trackOrigin ? trackOrigin === 'workitem' : Boolean(templateId);
  const ruleSourceLabel = hasTrackOverride ? '需求覆盖' : trackOrigin === 'iteration' ? '迭代专属' : '全局默认';
  const showRuleSelect = Boolean(iterationId) || templateEnabled;
  const [extraOpen, setExtraOpen] = useState(true);

  return (
    <Surface variant="secondary" className="flex flex-col gap-3 rounded-lg p-4">
      <SectionHeader
        level="h2"
        title="分支关系"
        titleAdornment={showRuleSelect ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">分支规则</span>
            <div className="w-44">
              <ComboBox
                id={templateSelectId}
                aria-label={'为 ' + repoName + ' 选择交付轨道模板'}
                selectedKey={templateId || '__none'}
                onValueChange={(value) => onTemplateChange(value && value !== '__none' ? value : null)}
                className="w-full"
              >
                <ComboBox.InputGroup>
                  <Input placeholder="选择交付轨道" aria-label="交付轨道模板" />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox aria-label="交付轨道模板" className="max-h-64 overflow-y-auto">
                    {/* '__none' = 清除需求级覆盖，回到方案 A 自动继承（迭代专属优先 → 全局默认） */}
                    <ListBox.Item id="__none" textValue="继承默认轨道">
                      继承默认轨道
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    {templates.map((template) => {
                      const scopeTag =
                        'scope' in template && template.scope === 'iteration'
                          ? ' (迭代专属)'
                          : 'scope' in template && template.scope === 'global'
                            ? ' (全局)'
                            : '';
                      const label = template.name + scopeTag;
                      return (
                        <ListBox.Item key={template.id} id={template.id} textValue={label}>
                          {label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      );
                    })}
                    {templateId && !templates.some((template) => template.id === templateId) && (
                      <ListBox.Item id={templateId} textValue="模板不可用" isDisabled>
                        模板不可用
                      </ListBox.Item>
                    )}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            </div>
          </div>
        ) : undefined}
        action={deliveryAction}
      />

      {/* 需求分支 → 目标基准 拓扑（Surface 内部直接排版，不再套第二层容器） */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">需求分支</span>
          {developerBranch ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Chip
                size="sm"
                variant="secondary"
                className="max-w-56 gap-1 font-mono text-xs font-semibold"
              >
                <OverflowTooltip text={developerBranch} className="max-w-48 truncate" />
              </Chip>
              <CopyButton text={developerBranch} label="复制需求分支名" />
              {developerBranchState === 'exists' && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
                  <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                  已存在
                </span>
              )}
              {developerBranchState === 'loading' && <Skeleton className="h-4 w-10 rounded-sm" />}
              {developerBranchState === 'error' && (
                <Chip size="sm" variant="soft" color="danger">
                  查询失败
                </Chip>
              )}
            </div>
          ) : (
            <Chip
              size="sm"
              variant="tertiary"
              className="font-mono text-xs text-muted-foreground"
            >
              未配置
            </Chip>
          )}
        </div>

        <ArrowRightIcon
          className="hidden size-4 shrink-0 self-center text-muted-foreground/60 md:block"
          aria-hidden="true"
        />

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">目标基准</span>
          {operationBaseBranch ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Chip
                      size="sm"
                      variant="secondary"
                      className="max-w-56 cursor-help gap-1 font-mono text-xs font-semibold"
                    >
                      <span className="max-w-48 truncate">{operationBaseBranch}</span>
                    </Chip>
                  }
                />
                {/* 分支名不折断：保持单行标识符可读（长名由 Tooltip 自身宽度承载） */}
                <TooltipContent className="whitespace-nowrap font-mono text-xs">
                  {operationBaseBranch}
                </TooltipContent>
              </Tooltip>
              <CopyButton text={operationBaseBranch} label="复制目标基准分支名" />
              {iterationId && baselineState === 'missing' && (
                <Chip size="sm" variant="soft" color="warning">
                  {/* 直连主干无"创建迭代基准"动作：缺失即模板源分支本身不可用 */}
                  {directConnect ? '源分支缺失' : '未创建'}
                </Chip>
              )}
              {iterationId && baselineState === 'error' && (
                <Button type="button" variant="ghost" size="2xs" className="text-destructive" onPress={onRetryBaseline}>
                  重试
                </Button>
              )}
            </div>
          ) : (
            <Chip size="sm" variant="tertiary" className="font-mono text-xs text-muted-foreground">
              未配置
            </Chip>
          )}
        </div>
      </div>

      {/* 辅助行：模板源 · 规则来源 · 命中轨道（全局配置 / 需求覆盖的真实语义） */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {templateSourceBranch && (
          <span className="flex min-w-0 items-center gap-1">
            模板源
            <OverflowTooltip text={templateSourceBranch} className="max-w-32 truncate font-mono text-foreground/80" />
          </span>
        )}
        <span className="text-border" aria-hidden="true">·</span>
        <span className="shrink-0">
          规则来源：<span className="text-foreground/80">{ruleSourceLabel}</span>
        </span>
        {trackTemplateName && (
          <>
            <span className="text-border" aria-hidden="true">·</span>
            <span className="flex min-w-0 items-center gap-1">
              轨道
              <OverflowTooltip text={trackTemplateName} className="max-w-32 truncate font-mono text-foreground/80" />
            </span>
          </>
        )}
      </div>

      {/* 紧凑落差行：迭代主线同步 / 开发分支落差 */}
      <div className="flex flex-col divide-y divide-border/50 border-t border-border/40 pt-1">
        {iterationId && templateSourceBranch && !directConnect && baselineState === 'exists' && (
          <IterationDevDivergence
            repoId={repoId}
            baselineBranch={baselineBranch ?? configuredBaselineBranch}
            sourceBranch={templateSourceBranch}
            baselineState={baselineState}
          />
        )}
        <section className="min-w-0" aria-label="分支差异">
          <BranchDivergenceCheck
            repoId={repoId}
            developmentBranch={developerBranch}
            developerBranchState={developerBranchState}
            baselineBranch={operationBaseBranch}
            baselineState={iterationId ? baselineState : defaultBaseState}
            onRetryBaseline={onRetryBaseline}
          />
        </section>
      </div>

      {/* 其他匹配分支：Surface 内的可折叠子区，不另套容器 */}
      {extraMatchedBranches.length > 0 && (
        <Collapsible open={extraOpen} onOpenChange={setExtraOpen} className="min-w-0">
          <section className="flex min-w-0 flex-col gap-2" aria-label="其他关联分支">
            <CollapsibleTrigger
              render={(
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer"
                />
              )}
            >
              <ChevronRightIcon
                className={cn('size-3.5 transition-transform', extraOpen && 'rotate-90')}
                aria-hidden="true"
              />
              <span>其他匹配分支</span>
              <span className="font-mono text-[11px] text-muted-foreground">{extraMatchedBranches.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex flex-wrap gap-2">
                {extraMatchedBranches.map((branch) => (
                  <div key={branch} className="flex items-center gap-1">
                    <Chip size="sm" variant="secondary" className="max-w-64 gap-1 font-mono text-xs font-normal">
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
            </CollapsibleContent>
          </section>
        </Collapsible>
      )}
    </Surface>
  );
}
