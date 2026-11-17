import { useState, useEffect, useMemo } from 'react';
import {
  SparklesIcon,
  GitBranchIcon,
  CheckIcon,
  Loader2Icon,
  InfoIcon,
} from 'lucide-react';
import type { RepoSummary, RepoCiBinding } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import type { AiRepoRecommendation } from '@/types/ai';
import { useApp } from '@/store/app';
import { useShallow } from 'zustand/react/shallow';
import { matchPipelineForRepo } from '@/lib/pipeline-match';
import { RepoCiBindingFields } from './repo-ci-binding-fields';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { WriteOpButton } from '@/components/WriteOpButton';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ComboBox } from '@/components/ui/combo-box';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListBox } from '@/components/ui/list-box';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { SectionHeader } from '@/components/section-header';
import { TrackTopologyDiagram } from '@/components/branch-rules/track-topology-diagram';

/** 下拉候选渲染上限：几百个仓库时避免一次性挂载全部 option（有输入后由 ComboBox 过滤全量） */
export const REPO_OPTION_LIMIT = 100;

/** 仓库的展示 / 取值键：优先 codeup 全路径，回退仓库名 */
function repoPathOf(repo: RepoSummary): string {
  return repo.pathWithNamespace || repo.name;
}

/**
 * 计算仓库下拉实际渲染的候选项。
 *
 * - 有输入：交回全量集合，由 ComboBox 的 `contains` 过滤后只渲染命中项（通常个位数）；
 * - 无输入：只取前 `limit` 条，避免几百个 option 一次性挂载造成展开掉帧；
 * - 已选仓库若不在前 `limit` 条内，补进列表，保证选中态文案能正常回显。
 *
 * @returns `items` 为本次渲染的候选项，`hiddenCount` 为未渲染的条数（用于"还有 N 个"提示）
 */
export function selectVisibleRepos(
  repos: RepoSummary[],
  query: string,
  selectedPath: string,
  limit: number = REPO_OPTION_LIMIT,
): { items: RepoSummary[]; hiddenCount: number } {
  if (query.trim().length > 0) return { items: repos, hiddenCount: 0 };
  const items = repos.slice(0, limit);
  if (selectedPath && !items.some((repo) => repoPathOf(repo) === selectedPath)) {
    const selected = repos.find((repo) => repoPathOf(repo) === selectedPath);
    if (selected) items.push(selected);
  }
  return { items, hiddenCount: Math.max(0, repos.length - items.length) };
}

export interface LinkRepoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositories: RepoSummary[];
  effectiveRepoIds: number[];
  fusedTemplates: ScopedBranchRuleTemplate[];
  iterationId?: string;
  /** 是否展示「应用分支模板」选择：需求与无父需求的独立工作项都需要 */
  templatePickerEnabled?: boolean;
  savingRepos: boolean;
  recommendingRepos: boolean;
  recommendedRepos: AiRepoRecommendation[];
  onRecommendRepos: () => Promise<void>;
  onClearRecommendations: () => void;
  onQuickLinkRepo: (repoId: number) => Promise<void>;
  onLinkRepo: (
    repoPath: string,
    templateId?: string,
    ciBinding?: RepoCiBinding | null,
  ) => Promise<boolean>;
}

/**
 * 分支链路预览上下文（纯函数，便于单测）：
 * - identifier 取当前选中工作项（列表行 workitemId / identifier 双键匹配 → 子项 → 详情字段），无则示例 REQ-101；
 * - 迭代名按弹窗 iterationId 匹配迭代列表，无则示例 Sprint-1。
 */
export function resolveTopologyPreviewContext(args: {
  items: Array<{ workitemId: string; identifier: string }>;
  children: Array<{ workitemId: string; identifier: string }>;
  detail: Record<string, unknown> | null;
  selectedId: string | null;
  iterations: Array<{ id: string; name: string }>;
  iterationId?: string;
}): { identifier: string; iterationName: string } {
  const selected = args.items.find((item) => item.workitemId === args.selectedId)
    ?? args.items.find((item) => item.identifier === args.selectedId);
  const child = args.children.find((item) => item.workitemId === args.selectedId);
  const fromDetail = typeof args.detail?.identifier === 'string' ? args.detail.identifier : '';
  return {
    identifier: selected?.identifier || child?.identifier || fromDetail || 'REQ-101',
    iterationName: args.iterations.find((iteration) => iteration.id === args.iterationId)?.name || 'Sprint-1',
  };
}

export function LinkRepoModal({
  open,
  onOpenChange,
  repositories,
  effectiveRepoIds,
  fusedTemplates,
  iterationId,
  templatePickerEnabled,
  savingRepos,
  recommendingRepos,
  recommendedRepos,
  onRecommendRepos,
  onClearRecommendations,
  onQuickLinkRepo,
  onLinkRepo,
}: LinkRepoModalProps) {
  const {
    settings, pipelines, loadingPipelines, loadPipelines,
    items, children, detail, selectedId, iterations,
  } = useApp(
    useShallow((s) => ({
      settings: s.settings,
      pipelines: s.pipelines,
      loadingPipelines: s.loadingPipelines,
      loadPipelines: s.loadPipelines,
      items: s.items,
      children: s.children,
      detail: s.detail,
      selectedId: s.selectedId,
      iterations: s.iterations,
    })),
  );
  const [selectedRepoPath, setSelectedRepoPath] = useState('');
  const [repoQuery, setRepoQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedCiBinding, setSelectedCiBinding] = useState<RepoCiBinding | null>(null);

  const selectedRepo = useMemo(
    () => repositories.find((r) => repoPathOf(r) === selectedRepoPath),
    [repositories, selectedRepoPath],
  );

  const matchResult = useMemo(
    () => (selectedRepo ? matchPipelineForRepo(selectedRepo.name, pipelines) : { bestMatch: null, score: 0 }),
    [selectedRepo, pipelines],
  );

  useEffect(() => {
    if (!open) {
      setSelectedRepoPath('');
      setRepoQuery('');
      setSelectedTemplateId('');
      setSelectedCiBinding(null);
    }
  }, [open]);

  // 当选中的仓库切换时，初始化/预选 CI 绑定
  useEffect(() => {
    if (!selectedRepo) {
      setSelectedCiBinding(null);
      return;
    }
    const existing = settings?.repoCiBindings?.[String(selectedRepo.id)];
    if (existing) {
      setSelectedCiBinding(existing);
    } else if (matchResult.bestMatch) {
      setSelectedCiBinding({
        provider: 'flow',
        pipelineId: matchResult.bestMatch.pipelineId,
        pipelineName: matchResult.bestMatch.pipelineName,
      });
    } else {
      setSelectedCiBinding(null);
    }
  }, [selectedRepo?.id, settings?.repoCiBindings]);

  const availableRepos = useMemo(
    () => repositories.filter((repo) => !effectiveRepoIds.includes(repo.id)),
    [repositories, effectiveRepoIds],
  );

  // 候选渲染窗口：无输入时只铺前 N 条，输入后由 ComboBox 过滤全量（见 selectVisibleRepos）
  const visibleRepos = useMemo(
    () => selectVisibleRepos(availableRepos, repoQuery, selectedRepoPath),
    [availableRepos, repoQuery, selectedRepoPath],
  );

  // 分支链路预览上下文：identifier 取当前选中工作项（弹窗上下文），无则示例 REQ-101
  const previewContext = useMemo(
    () => resolveTopologyPreviewContext({ items, children, detail, selectedId, iterations, iterationId }),
    [items, children, detail, selectedId, iterations, iterationId],
  );
  const previewTemplate = useMemo(
    () => fusedTemplates.find((template) => template.id === selectedTemplateId),
    [fusedTemplates, selectedTemplateId],
  );

  const handleManualLink = async () => {
    if (!selectedRepoPath || savingRepos) return;
    const ok = await onLinkRepo(
      selectedRepoPath,
      selectedTemplateId && selectedTemplateId !== '__none' ? selectedTemplateId : undefined,
      selectedCiBinding,
    );
    if (ok) {
      onOpenChange(false);
    }
  };

  const handleQuickLink = async (repoId: number) => {
    await onQuickLinkRepo(repoId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl gap-5">
        <DialogHeader className="shrink-0 text-left">
          <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <GitBranchIcon className="size-4.5 text-primary" />
            <span>关联云效代码仓库</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-1 flex flex-col gap-6">
          {/* AI 智能推荐区域 */}
          <section className="flex flex-col gap-3 rounded-lg bg-primary/5 p-4">
            <SectionHeader
              level="h3"
              title={(
                <span className="inline-flex items-center gap-1.5">
                  <SparklesIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>AI 智能匹配推荐</span>
                </span>
              )}
              hint="基于需求标题、描述及代码信号分析"
              action={(
                <>
                  {recommendedRepos.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onPress={onClearRecommendations}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      清空推荐
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={recommendingRepos}
                    onPress={() => void onRecommendRepos()}
                    className="gap-1.5 cursor-pointer"
                  >
                    {recommendingRepos ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <SparklesIcon className="size-3.5" />
                    )}
                    <span>{recommendingRepos ? 'AI 分析推荐中…' : '智能分析相关仓库'}</span>
                  </Button>
                </>
              )}
            />

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

                  return (
                    <Card
                      key={rec.repoId}
                      className={cn(
                        'justify-between p-3 transition-colors',
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
                            <Chip size="sm" variant="soft" color="success" className="font-medium shrink-0">
                              高置信
                            </Chip>
                          )}
                        </div>

                        {repoPath && repoPath !== repoName && (
                          <OverflowTooltip
                            text={repoPath}
                            className="mt-0.5 max-w-full font-mono text-[10px] text-muted-foreground"
                          />
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
                          <WriteOpButton
                            label="关联此仓库"
                            title={`关联仓库 ${repoPath}`}
                            variant="default"
                            confirm="inline"
                            confirmLabel="再次点击确认关联"
                            disabled={savingRepos}
                            disabledReason={savingRepos ? '正在关联仓库，请稍候' : undefined}
                            onAction={() => handleQuickLink(rec.repoId)}
                          />
                        )}
                      </div>
                    </Card>
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
          </section>

          {/* 手动检索与选择关联区域 */}
          <div className="flex flex-col gap-4">
            <SectionHeader
              level="h3"
              title="手动添加代码仓库"
              count={availableRepos.length}
              hint="可选仓库"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ComboBox
                fullWidth
                selectedKey={selectedRepoPath || null}
                onValueChange={(v) => setSelectedRepoPath(v ?? '')}
                inputValue={repoQuery}
                onInputChange={setRepoQuery}
                isDisabled={savingRepos}
              >
                <Label>云效代码仓库 *</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="搜索并选择云效代码仓库" />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox
                    aria-label="云效代码仓库"
                    className="max-h-64 overflow-y-auto"
                    items={visibleRepos.items}
                    renderEmptyState={() => (
                      <p className="px-2 py-3 text-xs text-muted-foreground">没有匹配的代码仓库</p>
                    )}
                  >
                    {(repo: RepoSummary) => {
                      const repoPath = repoPathOf(repo);
                      return (
                        <ListBox.Item key={repoPath} id={repoPath} textValue={repoPath}>
                          {repoPath}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      );
                    }}
                  </ListBox>
                  {visibleRepos.hiddenCount > 0 && (
                    <p className="px-2.5 pb-2 pt-1 text-[11px] leading-snug text-muted-foreground">
                      还有 {visibleRepos.hiddenCount} 个仓库未显示，输入关键词继续筛选
                    </p>
                  )}
                </ComboBox.Popover>
              </ComboBox>

              {templatePickerEnabled && iterationId ? (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <ComboBox
                    fullWidth
                    selectedKey={selectedTemplateId || '__none'}
                    onValueChange={(val) => setSelectedTemplateId(val && val !== '__none' ? val : '')}
                    isDisabled={savingRepos}
                  >
                    <Label>应用分支模板 (可选)</Label>
                    <ComboBox.InputGroup>
                      <Input placeholder="选择分支模板" />
                      <ComboBox.Trigger />
                    </ComboBox.InputGroup>
                    <ComboBox.Popover>
                      <ListBox
                        aria-label="应用分支模板"
                        className="max-h-64 overflow-y-auto"
                        renderEmptyState={() => (
                          <p className="px-2 py-3 text-xs text-muted-foreground">没有匹配的分支模板</p>
                        )}
                      >
                        <ListBox.Item id="__none" textValue="不应用分支模板">
                          不应用分支模板
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {fusedTemplates.map((template) => {
                          const scopeTag = template.scope === 'iteration' ? ' (迭代专属)' : ' (全局)';
                          const label = `${template.name}${scopeTag}`;
                          return (
                            <ListBox.Item key={template.id} id={template.id} textValue={label}>
                              {label}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          );
                        })}
                      </ListBox>
                    </ComboBox.Popover>
                  </ComboBox>
                  {!fusedTemplates.length && (
                    <p className="text-[11px] text-muted-foreground">
                      暂无可用分支模板，可在全局设置或迭代工作台创建。
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            {/* 选中模板后的分支链路预览（同一拓扑原语，纯预览无状态光晕） */}
            {previewTemplate && (
              <TrackTopologyDiagram
                sourceBranch={previewTemplate.sourceBranch}
                baselinePattern={previewTemplate.baselineBranchPattern}
                workitemPattern={previewTemplate.workitemBranchPattern}
                variables={{
                  iteration: previewContext.iterationName,
                  track: previewTemplate.name,
                  identifier: previewContext.identifier,
                }}
                templateName={previewTemplate.name}
              />
            )}

            {/* CI 流水线关联配置 */}
            {selectedRepo && (
              <RepoCiBindingFields
                repoName={selectedRepo.name}
                binding={selectedCiBinding}
                onChange={setSelectedCiBinding}
                pipelines={pipelines}
                jenkinsConnections={settings?.jenkinsConnections ?? []}
                loadingPipelines={loadingPipelines}
                onRefreshPipelines={loadPipelines}
                recommendedPipeline={matchResult.bestMatch}
                recommendReason={matchResult.reason}
                disabled={savingRepos}
              />
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 flex items-center justify-end gap-2 pt-3 border-t border-border/70">
          <Button
            type="button"
            variant="secondary"
            onPress={() => onOpenChange(false)}
            disabled={savingRepos}
          >
            取消
          </Button>
          <WriteOpButton
            label="确认关联"
            title="确认关联代码仓库"
            variant="default"
            confirm="inline"
            confirmLabel="再次点击确认关联"
            disabled={!selectedRepoPath || savingRepos}
            disabledReason={
              !selectedRepoPath
                ? '请先选择云效代码仓库'
                : savingRepos
                  ? '正在关联仓库，请稍候'
                  : undefined
            }
            onAction={handleManualLink}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
