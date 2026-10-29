import { useState, useEffect } from 'react';
import {
  SparklesIcon,
  GitBranchIcon,
  CheckIcon,
  Loader2Icon,
  PlusIcon,
  InfoIcon,
} from 'lucide-react';
import type { RepoSummary } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import type { AiRepoRecommendation } from '@/types/ai';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface LinkRepoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositories: RepoSummary[];
  effectiveRepoIds: number[];
  fusedTemplates: ScopedBranchRuleTemplate[];
  iterationId?: string;
  isRequirement?: boolean;
  savingRepos: boolean;
  recommendingRepos: boolean;
  recommendedRepos: AiRepoRecommendation[];
  onRecommendRepos: () => Promise<void>;
  onClearRecommendations: () => void;
  onQuickLinkRepo: (repoId: number) => Promise<void>;
  onLinkRepo: (repoPath: string, templateId?: string) => Promise<boolean>;
}

export function LinkRepoModal({
  open,
  onOpenChange,
  repositories,
  effectiveRepoIds,
  fusedTemplates,
  iterationId,
  isRequirement,
  savingRepos,
  recommendingRepos,
  recommendedRepos,
  onRecommendRepos,
  onClearRecommendations,
  onQuickLinkRepo,
  onLinkRepo,
}: LinkRepoModalProps) {
  const [selectedRepoPath, setSelectedRepoPath] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [linkingRepoId, setLinkingRepoId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedRepoPath('');
      setSelectedTemplateId('');
      setLinkingRepoId(null);
    }
  }, [open]);

  const availableRepos = repositories.filter((r) => !effectiveRepoIds.includes(r.id));

  const handleManualLink = async () => {
    if (!selectedRepoPath || savingRepos) return;
    const ok = await onLinkRepo(
      selectedRepoPath,
      selectedTemplateId && selectedTemplateId !== '__none' ? selectedTemplateId : undefined,
    );
    if (ok) {
      onOpenChange(false);
    }
  };

  const handleQuickLink = async (repoId: number) => {
    setLinkingRepoId(repoId);
    try {
      await onQuickLinkRepo(repoId);
    } finally {
      setLinkingRepoId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-6 gap-5">
        <DialogHeader className="shrink-0 text-left">
          <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <GitBranchIcon className="size-4.5 text-primary" />
            <span>关联云效代码仓库</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            为当前需求绑定代码仓库，支持自动化推导需求分支、查看 MR 状态以及触发流水线构建。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-6">
          {/* AI 智能推荐区域 */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <SparklesIcon className="size-4 text-primary shrink-0" />
                <span className="font-semibold text-xs text-foreground">AI 智能匹配推荐</span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  (基于需求标题、描述及代码信号分析)
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {recommendedRepos.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearRecommendations}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    清空推荐
                  </button>
                )}
                <Button
                  variant="outline"
                  size="xs"
                  disabled={recommendingRepos}
                  onClick={() => void onRecommendRepos()}
                  className="h-7 text-xs border-primary/30 bg-background hover:bg-primary/10 text-primary gap-1.5 cursor-pointer shadow-2xs"
                >
                  {recommendingRepos ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-3.5" />
                  )}
                  <span>{recommendingRepos ? 'AI 分析推荐中…' : '智能分析相关仓库'}</span>
                </Button>
              </div>
            </div>

            {/* 推荐卡片列表 */}
            {recommendedRepos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {recommendedRepos.map((rec) => {
                  const targetRepo = repositories.find((r) => r.id === rec.repoId);
                  const isAlreadyLinked = effectiveRepoIds.includes(rec.repoId);
                  const repoName = targetRepo?.name
                    || (rec.repoName.includes('/') ? rec.repoName.split('/').pop() : rec.repoName)
                    || '未知仓库';
                  const repoPath = targetRepo?.pathWithNamespace || rec.repoName;
                  const isCurrentLinking = linkingRepoId === rec.repoId;

                  return (
                    <div
                      key={rec.repoId}
                      className={cn(
                        'flex flex-col justify-between gap-2.5 rounded-lg border p-3 transition-colors shadow-2xs bg-card',
                        isAlreadyLinked
                          ? 'border-sig-ok/30 bg-sig-ok/5'
                          : 'border-primary/25 hover:border-primary/50',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <GitBranchIcon className="size-3.5 shrink-0 text-primary" />
                            <OverflowTooltip
                              text={repoName}
                              className="min-w-0 truncate font-semibold text-xs text-foreground"
                            />
                          </div>
                          {rec.confidence === 'high' && (
                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-sig-ok/10 text-sig-ok border border-sig-ok/20">
                              高置信
                            </span>
                          )}
                        </div>

                        {repoPath && repoPath !== repoName && (
                          <Tooltip>
                            <TooltipTrigger
                              render={(
                                <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground cursor-help" />
                              )}
                            >
                              {repoPath}
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md break-all font-mono text-[11px]">
                              {repoPath}
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {rec.reason && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            {rec.reason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-end pt-1 border-t border-border/40">
                        {isAlreadyLinked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sig-ok">
                            <CheckIcon className="size-3" />
                            已关联
                          </span>
                        ) : (
                          <Button
                            size="xs"
                            disabled={savingRepos || isCurrentLinking}
                            onClick={() => void handleQuickLink(rec.repoId)}
                            className="h-6.5 px-3 text-xs gap-1"
                          >
                            {isCurrentLinking ? (
                              <Loader2Icon className="size-3 animate-spin" />
                            ) : (
                              <PlusIcon className="size-3" />
                            )}
                            <span>关联此仓库</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : recommendingRepos ? (
              <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin text-primary" />
                <span>正在分析需求特征与仓库信号，请稍候…</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-2 px-1 text-xs text-muted-foreground">
                <InfoIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                <span>点击“智能分析相关仓库”，AI 将自动根据需求文本与历史提交，推荐匹配的代码仓库。</span>
              </div>
            )}
          </div>

          {/* 手动检索与选择关联区域 */}
          <div className="flex flex-col gap-4">
            <div className="text-xs font-semibold text-foreground flex items-center gap-2">
              <span>手动添加代码仓库</span>
              <span className="font-mono text-[11px] text-muted-foreground font-normal">
                (可选仓库: {availableRepos.length})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field className="min-w-0">
                <FieldLabel>云效代码仓库 *</FieldLabel>
                <SearchableSelect
                  value={selectedRepoPath || null}
                  onValueChange={(v) => setSelectedRepoPath(v ?? '')}
                  items={availableRepos.map((r): SearchableSelectOption<string> => ({
                    label: r.pathWithNamespace || r.name,
                    value: r.pathWithNamespace || r.name,
                  }))}
                  placeholder="搜索并选择云效代码仓库"
                />
              </Field>

              {isRequirement && iterationId ? (
                <Field className="min-w-0">
                  <FieldLabel>应用分支模板 (可选)</FieldLabel>
                  <SearchableSelect
                    value={selectedTemplateId || '__none'}
                    onValueChange={(val) => setSelectedTemplateId(val && val !== '__none' ? val : '')}
                    items={[
                      { label: '不应用分支模板', value: '__none' },
                      ...fusedTemplates.map((template): SearchableSelectOption<string> => {
                        const scopeTag = template.scope === 'iteration' ? ' (迭代专属)' : ' (全局)';
                        return {
                          label: `${template.name}${scopeTag}`,
                          value: template.id,
                        };
                      }),
                    ]}
                    placeholder="选择分支模板"
                  />
                  {!fusedTemplates.length && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      暂无可用分支模板，可在全局设置或迭代工作台创建。
                    </p>
                  )}
                </Field>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex items-center justify-end gap-2 pt-3 border-t border-border/70">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={savingRepos}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleManualLink}
            disabled={!selectedRepoPath || savingRepos}
            className="gap-1.5"
          >
            {savingRepos ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <PlusIcon className="size-3.5" />
            )}
            <span>确认关联</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
