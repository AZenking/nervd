import {
  GitFork,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { CopyButton } from '@/components/ui/copy-button';
import {
  TrackTopologyDiagram,
  isDirectConnectBranches,
  TRACK_TOPOLOGY_LABELS,
  type TrackTopologyVariables,
  type TrackTopologyStates,
} from './track-topology-diagram';
import { expandBranchPattern } from '@/components/iteration/requirement/types';

export interface TrackTopologyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceBranch: string;
  baselinePattern: string;
  workitemPattern: string;
  variables: TrackTopologyVariables;
  states?: TrackTopologyStates;
  templateName?: string;
}

/**
 * 交付轨道拓扑全屏/模态弹窗检视组件：
 * - 解决在抽屉/窄容器内多节点挤压、分支长名被截断的问题。
 * - 宽阔视口展示 ReactFlow 拓扑图（无文字截断、清晰 1:1 比例）。
 * - 详细罗列源主干、迭代基准、需求分支的命名规则与展开全名，支持一键复制。
 * - 完整说明分支生命周期流转机制（派生基准 → 切出开发 → MR 合入 → 发布 MR）。
 */
export function TrackTopologyModal({
  open,
  onOpenChange,
  sourceBranch,
  baselinePattern,
  workitemPattern,
  variables,
  states,
  templateName,
}: TrackTopologyModalProps) {
  const track = variables.track ?? '';
  const expandValues = {
    iteration: variables.iteration,
    track,
    template: track,
    identifier: variables.identifier,
  };
  const sourceName = sourceBranch.trim();
  const baselineName = expandBranchPattern(baselinePattern, expandValues);
  const developmentName = expandBranchPattern(workitemPattern, expandValues);
  const direct = isDirectConnectBranches(sourceName, baselineName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="sm:max-w-4xl w-[94vw] max-h-[90vh] flex flex-col p-6 gap-5 overflow-hidden"
      >
        <DialogHeader className="pb-3 border-b border-border/50 text-left">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <GitFork className="size-4" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base font-semibold text-foreground">
                交付轨道分支拓扑
              </DialogTitle>
              {templateName && (
                <span className="rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {templateName}
                </span>
              )}
              {direct && (
                <Chip size="sm" variant="soft" color="accent" className="h-5 px-1.5 text-[10px] font-medium">
                  <Chip.Label>{TRACK_TOPOLOGY_LABELS.directBadge}</Chip.Label>
                </Chip>
              )}
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1.5">
            {direct
              ? '直连主干模式（Trunk-based）：迭代基准与源主干合一，需求分支直接从源主干派生并合入，无需维护单独的迭代基准分支。'
              : '标准交付轨道（Track）：由源主干派生迭代专属基准分支，需求分支基于基准进行开发，完成验收后通过 MR 汇入基准，上线发布时合回源主干。'}
          </DialogDescription>
        </DialogHeader>

        {/* 宽阔拓扑图展示区 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Layers className="size-3.5 text-primary" />
              <span>拓扑流转示意图</span>
            </span>
            <span className="text-[11px] text-muted-foreground/80">
              节点间距自适应，长分支名无截断完整显示
            </span>
          </div>
          <div className="rounded-lg border border-border/80 bg-surface-secondary/20 p-2 shadow-xs">
            <TrackTopologyDiagram
              sourceBranch={sourceBranch}
              baselinePattern={baselinePattern}
              workitemPattern={workitemPattern}
              variables={variables}
              states={states}
              isModalView={true}
              allowModal={false}
              variant="expanded"
              className="border-0 bg-transparent p-1 shadow-none"
            />
          </div>
        </div>

        {/* 分支规则与真实命名解析详情卡片 */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            分支规则与完整名称解析
          </span>
          <div className={`grid grid-cols-1 ${direct ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-3`}>
            {/* 源主干 */}
            <div className="flex flex-col justify-between gap-2 rounded-lg border border-border/70 bg-surface/50 p-3 shadow-xs">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                    <span className="size-1.5 rounded-full bg-primary" />
                    {TRACK_TOPOLOGY_LABELS.kindSource}
                  </span>
                  <CopyButton text={sourceName} label="复制源主干分支名" />
                </div>
                <div
                  className="font-mono text-xs font-semibold text-foreground select-all break-all"
                  title={sourceName}
                >
                  {sourceName || '—'}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground/80 leading-normal border-t border-border/40 pt-1.5">
                生产发布的主线分支，为迭代基准的派生源与最终上线合并归宿。
              </div>
            </div>

            {/* 迭代基准分支 */}
            {!direct && (
              <div className="flex flex-col justify-between gap-2 rounded-lg border border-border/70 bg-surface/50 p-3 shadow-xs">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning">
                      <span className="size-1.5 rounded-full bg-warning" />
                      {TRACK_TOPOLOGY_LABELS.kindBaseline}
                    </span>
                    <CopyButton text={baselineName} label="复制迭代基准分支名" />
                  </div>
                  <div
                    className="font-mono text-xs font-semibold text-foreground select-all break-all"
                    title={baselineName}
                  >
                    {baselineName || '—'}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground/70">
                    模板：{baselinePattern || '—'}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground/80 leading-normal border-t border-border/40 pt-1.5">
                  当前迭代专属集成分支，汇聚该交付轨道内所有需求开发成果。
                </div>
              </div>
            )}

            {/* 需求开发分支 */}
            <div className="flex flex-col justify-between gap-2 rounded-lg border border-border/70 bg-surface/50 p-3 shadow-xs">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-foreground">
                    <span className="size-1.5 rounded-full bg-accent" />
                    {TRACK_TOPOLOGY_LABELS.kindDevelopment}
                  </span>
                  <CopyButton text={developmentName} label="复制需求开发分支名" />
                </div>
                <div
                  className="font-mono text-xs font-semibold text-primary select-all break-all"
                  title={developmentName}
                >
                  {developmentName || '—'}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground/70">
                  模板：{workitemPattern || '—'}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground/80 leading-normal border-t border-border/40 pt-1.5">
                日常特性开发与缺陷修复分支，自基准切出，验收完成后提 MR 合入。
              </div>
            </div>
          </div>
        </div>

        {/* 交付流转生命周期图例说明 */}
        <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/15 p-3">
          <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Sparkles className="size-3 text-primary" />
            <span>生命周期流转说明</span>
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
            {!direct ? (
              <>
                <div className="flex items-start gap-1.5">
                  <span className="font-medium text-foreground">1. 派生基准：</span>
                  <span>迭代启动时从源主干派生出基准分支</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-medium text-foreground">2. 切出开发：</span>
                  <span>从基准分支切出各需求专用的开发分支</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-medium text-foreground">3. MR 合入：</span>
                  <span>需求测试完成后提 MR 合并回基准分支</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-medium text-warning">4. 发布 MR：</span>
                  <span>迭代上线后提 PR/MR 合入源主干</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-1.5">
                  <span className="font-medium text-foreground">1. 直接切出：</span>
                  <span>需求直接从源主干切出特性开发分支</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-medium text-foreground">2. MR 合入：</span>
                  <span>开发测试完成后直接通过 MR 合并回源主干</span>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-border/50">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onPress={() => onOpenChange(false)}
          >
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
