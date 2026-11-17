import { useEffect, useMemo, useState } from 'react';
import { GitBranchIcon, GitFork, PlusIcon, XIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import { getBranchTrackDefault, setBranchTrackDefault } from '@/lib/api';
import { isTauriRuntime } from '@/lib/attribution-api';
import { branchTrackWarnings } from '@/lib/branch-track-warnings';
import { errorLog, humanizeError } from '@/lib/error-format';
import type { BranchRuleTemplate } from '@/types';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Descriptions } from '@/components/ui/descriptions';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Table } from '@/components/ui/table';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmButton } from '@/components/ConfirmButton';
import { EmptyHint } from '@/components/empty-hint';
import { SectionHeader } from '@/components/section-header';
import { WriteOpButton } from '@/components/WriteOpButton';
import { SettingsGroup, SettingsRow } from '@/components/settings/settings-group';
import { expandBranchPattern } from '@/components/iteration/requirement/types';
import { BranchTopologyFields } from './BranchTopologyFields';
import { BranchPatternField, type BranchPatternVariable } from './BranchPatternField';
import { TrackTopologyDiagram } from './track-topology-diagram';
import { TrackTopologyModal } from './track-topology-modal';

const EMPTY_DRAFT: BranchRuleTemplate = {
  id: '',
  name: '',
  sourceBranch: 'master',
  baselineBranchPattern: 'iteration/{iteration}/{track}',
  workitemBranchPattern: 'feature/{identifier}',
};

/**
 * 一键预设草稿（仅填充表单草稿字段，不自动保存）：
 * 覆盖三种典型交付轨道（Track/局点）——单主干直连 / 迭代集成基线 / 现场局点。
 */
const BRANCH_TEMPLATE_PRESETS: Array<{
  label: string;
  draft: Pick<BranchRuleTemplate, 'name' | 'sourceBranch' | 'baselineBranchPattern' | 'workitemBranchPattern'>;
}> = [
  {
    label: '🌱 单主干直连',
    draft: {
      name: '标准主线直连',
      sourceBranch: 'master',
      baselineBranchPattern: 'master',
      workitemBranchPattern: 'feature/{identifier}',
    },
  },
  {
    label: '📦 迭代集成基线',
    draft: {
      name: '标准迭代主线',
      sourceBranch: 'master',
      baselineBranchPattern: 'iteration/{iteration}',
      workitemBranchPattern: 'feature/{identifier}',
    },
  },
  {
    label: '🎯 现场局点',
    draft: {
      name: '局点专版',
      sourceBranch: 'master',
      baselineBranchPattern: 'iteration/{iteration}/{track}',
      workitemBranchPattern: 'feature/{identifier}',
    },
  },
];

export interface BranchTemplatesManagerProps {
  /** 模板数据列表 */
  templates: BranchRuleTemplate[];
  /** 保存模板回调 */
  onSaveTemplates: (templates: BranchRuleTemplate[]) => Promise<void> | void;
  /** 作用域标识：全局通用或特定迭代专属 */
  scope: 'global' | 'iteration';
  /** 自定义卡片标题（可选） */
  title?: string;
  /** 自定义卡片说明（可选） */
  description?: string;
  /** 是否使用 SettingsGroup 容器版式（设置页生效） */
  inSettingsCard?: boolean;
  /** 当前迭代名称（用于实时预览和占位提示） */
  iterationName?: string;
  /** 当前迭代 ID（iteration scope 的默认轨道读写需要）。 */
  iterationId?: string;
  /** 当前迭代结束日（YYYY-MM-DD），用于 {iterationEnd}/{yyyy}/{MM}/{dd} 预览。 */
  iterationEndDate?: string;
  /** 设置默认轨道后刷新模板列表（全局/迭代各自实现）。 */
  onRefreshTemplates?: () => Promise<void> | void;
}

export function BranchTemplatesManager({
  templates,
  onSaveTemplates,
  scope,
  title = scope === 'iteration' ? '迭代专属分支模板' : '全局分支规则模板',
  description = scope === 'iteration'
    ? '为当前迭代配置专属的交付轨道（Track/局点）分支生成规则，优先级高于全局模板，需求详情按需选用。'
    : '为代码仓库预设全局分支生成规则（每条模板即一条交付轨道 Track/局点），供需求详情按仓库选用。',
  inSettingsCard = false,
  iterationName = '',
  iterationId,
  iterationEndDate,
  onRefreshTemplates,
}: BranchTemplatesManagerProps) {
  const { settings, setToast } = useApp();
  const [draft, setDraft] = useState<BranchRuleTemplate>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 独立弹窗快速查看指定模板的拓扑图
  const [topologyModalTemplate, setTopologyModalTemplate] = useState<BranchRuleTemplate | null>(null);
  const [defaultTrackId, setDefaultTrackId] = useState<string | null>(null);

  // 模板列表分页（超出 5 条时分页展示，避免长列表滚动）
  const TEMPLATE_PAGE_SIZE = 5;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(templates.length / TEMPLATE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedTemplates = useMemo(() => {
    const start = (currentPage - 1) * TEMPLATE_PAGE_SIZE;
    return templates.slice(start, start + TEMPLATE_PAGE_SIZE);
  }, [templates, currentPage]);

  const dateSample = iterationEndDate?.trim() || '2026-10-29';
  const compactDate = dateSample.replace(/-/g, '');
  const baselineVariables = useMemo<BranchPatternVariable[]>(
    () => [
      { token: '{iteration}', label: '迭代名', sample: iterationName?.trim() || 'Sprint-1' },
      { token: '{track}', label: '轨道名', sample: draft.name?.trim() || '标准迭代主线' },
      { token: '{iterationEnd}', label: '迭代结束日', sample: compactDate, description: 'YYYYMMDD，稳定，推荐 release 基线' },
      { token: '{yyyy}', label: '年', sample: compactDate.slice(0, 4) },
      { token: '{MM}', label: '月', sample: compactDate.slice(4, 6) },
      { token: '{dd}', label: '日', sample: compactDate.slice(6, 8) },
    ],
    [compactDate, draft.name, iterationName],
  );
  const workitemVariables = useMemo<BranchPatternVariable[]>(
    () => [
      { token: '{identifier}', label: '工作项编号', sample: 'REQ-101' },
      { token: '{iterationEnd}', label: '迭代结束日', sample: compactDate, description: 'YYYYMMDD，适合 release/hotfix 命名' },
      { token: '{yyyy}', label: '年', sample: compactDate.slice(0, 4) },
      { token: '{MM}', label: '月', sample: compactDate.slice(4, 6) },
      { token: '{dd}', label: '日', sample: compactDate.slice(6, 8) },
    ],
    [compactDate],
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    void getBranchTrackDefault(scope, scope === 'iteration' ? iterationId : undefined)
      .then((id) => {
        if (!cancelled) setDefaultTrackId(id);
      })
      .catch((error) => errorLog('branch-track-default-load', error));
    return () => {
      cancelled = true;
    };
  }, [scope, iterationId, templates.length]);

  const handleSetDefault = async (trackId: string) => {
    try {
      await setBranchTrackDefault(trackId);
      setDefaultTrackId(trackId);
      setToast({ text: '默认分支轨道已更新', kind: 'ok' });
      await onRefreshTemplates?.();
    } catch (error) {
      setToast({ text: `设置默认轨道失败：${humanizeError(error)}`, kind: 'fail' });
    }
  };

  const reset = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId('');
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    reset();
  };

  const startEdit = (template: BranchRuleTemplate) => {
    setDraft({ ...template });
    setEditingId(template.id);
    setDrawerOpen(true);
  };

  const save = async () => {
    const normalized: BranchRuleTemplate = {
      ...draft,
      id: editingId || crypto.randomUUID(),
      name: draft.name.trim(),
      sourceBranch: draft.sourceBranch.trim(),
      baselineBranchPattern: draft.baselineBranchPattern.trim(),
      workitemBranchPattern: draft.workitemBranchPattern.trim(),
    };

    if (
      !normalized.name ||
      !normalized.sourceBranch ||
      !normalized.baselineBranchPattern ||
      !normalized.workitemBranchPattern
    ) {
      setToast({ text: '模板名称、源分支和两条分支命名规则都必须填写', kind: 'fail' });
      return;
    }

    if (
      templates.some(
        (item) => item.id !== normalized.id && item.name.toLowerCase() === normalized.name.toLowerCase(),
      )
    ) {
      setToast({ text: '模板名称不能重复', kind: 'fail' });
      return;
    }

    setSaving(true);
    try {
      const next = editingId
        ? templates.map((item) => (item.id === editingId ? normalized : item))
        : [...templates, normalized];
      await onSaveTemplates(next);
      setToast({
        text: editingId
          ? `${scope === 'iteration' ? '迭代' : '全局'}分支模板已更新`
          : `${scope === 'iteration' ? '迭代专属' : '全局'}分支模板已保存`,
        kind: 'ok',
      });
      closeDrawer();
    } catch (error) {
      errorLog('branch-template-save', error);
      setToast({ text: `保存分支模板失败：${humanizeError(error)}`, kind: 'fail' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (template: BranchRuleTemplate) => {
    try {
      await onSaveTemplates(templates.filter((item) => item.id !== template.id));
      setToast({
        text: `${scope === 'iteration' ? '迭代' : '全局'}分支模板已删除`,
        kind: 'ok',
      });
    } catch (error) {
      errorLog('branch-template-delete', error);
      setToast({ text: `删除分支模板失败：${humanizeError(error)}`, kind: 'fail' });
    }
  };

  const usageCount = (templateId: string) =>
    Object.values(settings?.workitemRepoBranchTemplates ?? {}).reduce(
      (count, selections) =>
        count + Object.values(selections).filter((id) => id === templateId).length,
      0,
    );

  // 弹窗内的实时分支规则预览（命名文本与拓扑图共用同一组示例变量，保证口径一致）
  const previewTrack = draft.name || '默认';
  const previewVariables = {
    iteration: iterationName || 'Sprint-1',
    template: previewTrack,
    identifier: 'REQ-101',
    iterationEnd: iterationEndDate,
  };
  const previewBaseline = draft.baselineBranchPattern
    ? expandBranchPattern(draft.baselineBranchPattern, previewVariables)
    : '';
  const previewWorkitem = draft.workitemBranchPattern
    ? expandBranchPattern(draft.workitemBranchPattern, previewVariables)
    : '';

  const addButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        reset();
        setDrawerOpen(true);
      }}
    >
      <PlusIcon data-icon="inline-start" className="size-3.5" />
      新增模板
    </Button>
  );

  const listContent = (
    <>
      {templates.length > 0 ? (
        <>
          <Table variant="secondary" className="w-full">
            <Table.ScrollContainer>
              <Table.Content aria-label="分支模板列表">
                <Table.Header>
                  <Table.Column isRowHeader>模板</Table.Column>
                  <Table.Column>分支链</Table.Column>
                  <Table.Column>使用情况</Table.Column>
                  <Table.Column className="text-end">操作</Table.Column>
                </Table.Header>
                <Table.Body>
                  {paginatedTemplates.map((template) => (
                    <Table.Row key={template.id} id={template.id}>
                      <Table.Cell>
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-medium text-foreground">{template.name}</span>
                            <Badge
                              variant={scope === 'iteration' ? 'soft' : 'outline'}
                              color={scope === 'iteration' ? 'accent' : 'default'}
                              className="font-mono"
                            >
                              {scope === 'iteration' ? '迭代专属' : '全局通用'}
                            </Badge>
                            {defaultTrackId === template.id && (
                              <Badge variant="soft" color="accent" className="font-mono">
                                默认
                              </Badge>
                            )}
                          </div>
                          {branchTrackWarnings(template, scope).map((warning) => (
                            <p
                              key={warning.code}
                              className={warning.severity === 'error' ? 'text-[11px] text-danger' : 'text-[11px] text-warning'}
                            >
                              {warning.message}
                            </p>
                          ))}
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Badge variant="outline" className="font-mono text-foreground/80">
                            {template.sourceBranch}
                          </Badge>
                          <span className="text-muted-foreground/50">→</span>
                          <Badge variant="outline" className="font-mono text-foreground/80">
                            {template.baselineBranchPattern}
                          </Badge>
                          <span className="text-muted-foreground/50">→</span>
                          <Badge variant="soft" color="accent" className="font-mono">
                            {template.workitemBranchPattern}
                          </Badge>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        {usageCount(template.id) > 0 ? (
                          <Badge variant="secondary" className="font-mono">
                            {usageCount(template.id)} 个需求仓库使用
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">未使用</span>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex shrink-0 items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setTopologyModalTemplate(template)}
                            title="查看该交付轨道的完整分支拓扑图"
                            aria-label={`查看 ${template.name} 分支拓扑图`}
                          >
                            <GitFork className="size-3 text-primary" />
                            <span>拓扑图</span>
                          </Button>
                          {defaultTrackId !== template.id && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => void handleSetDefault(template.id)}
                            >
                              设为默认
                            </Button>
                          )}
                          <Button variant="outline" size="xs" onClick={() => startEdit(template)}>
                            编辑
                          </Button>
                          <ConfirmButton
                            label="删除"
                            title={`删除模板「${template.name}」？`}
                            description={
                              usageCount(template.id)
                                ? `该模板正被 ${usageCount(template.id)} 个需求仓库使用，删除后会一并清除这些模板选择。`
                                : '删除后不可恢复，已创建的远端分支不受影响。'
                            }
                            confirmLabel="删除模板"
                            size="xs"
                            onConfirm={() => remove(template)}
                          />
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>

          {totalPages > 1 && (
            <Pagination size="sm" className="w-full border-t border-border/40 px-4 py-2">
              <Pagination.Summary>
                共 {templates.length} 个模板（第 {(currentPage - 1) * TEMPLATE_PAGE_SIZE + 1} -{' '}
                {Math.min(currentPage * TEMPLATE_PAGE_SIZE, templates.length)}）
              </Pagination.Summary>
              <Pagination.Content>
                <Pagination.Item>
                  <Pagination.Previous
                    aria-label="上一页"
                    isDisabled={currentPage <= 1}
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <Pagination.PreviousIcon />
                  </Pagination.Previous>
                </Pagination.Item>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Pagination.Item key={p}>
                    <Pagination.Link isActive={p === currentPage} onPress={() => setPage(p)}>
                      {p}
                    </Pagination.Link>
                  </Pagination.Item>
                ))}
                <Pagination.Item>
                  <Pagination.Next
                    aria-label="下一页"
                    isDisabled={currentPage >= totalPages}
                    onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <Pagination.NextIcon />
                  </Pagination.Next>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination>
          )}
        </>
      ) : (
        <div className="p-6">
          <EmptyHint
            icon={GitBranchIcon}
            title={scope === 'iteration' ? '暂无当前迭代专属分支模板' : '还没有全局分支规则模板'}
            description={
              scope === 'iteration'
                ? '默认沿用设置中的全局分支模板。若此迭代有特殊分支命名需求，可点击右上角「新增模板」进行专属配置。'
                : '点击右上角「新增模板」为项目配置基准与需求分支命名规则，供各迭代与需求选用。'
            }
            className="py-4 border-0 bg-transparent"
          />
        </div>
      )}
    </>
  );

  const variableHelpControl = (
    <div className="flex flex-wrap gap-1">
      <Badge variant="outline" className="font-mono">
        {'{iteration}'}
      </Badge>
      <Badge variant="outline" className="font-mono">
        {'{track}'}
      </Badge>
      <Badge variant="outline" className="font-mono">
        {'{iterationEnd}'}
      </Badge>
      <Badge variant="outline" className="font-mono">
        {'{identifier}'}
      </Badge>
    </div>
  );

  const draftWarnings = branchTrackWarnings(draft, scope);
  const draftHasError = draftWarnings.some((warning) => warning.severity === 'error');

  return (
    <>
      {inSettingsCard ? (
        <SettingsGroup title={title} description={description} action={addButton}>
          {listContent}
          <SettingsRow
            orientation="horizontal"
            label="变量通配说明"
            description="基准模板支持 {iteration}（当前迭代标识）、{track}（交付轨道 Track/局点名）、{iterationEnd}（迭代结束日）与 {yyyy}/{MM}/{dd}；需求分支支持 {identifier}、{iterationEnd}、{yyyy}/{MM}/{dd}。"
            control={variableHelpControl}
          />
        </SettingsGroup>
      ) : (
        <div className="flex flex-col gap-3">
          <SectionHeader title={title} />
          <p className="text-[13px] leading-normal text-muted-foreground">{description}</p>
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            基准模板支持
            <Badge variant="outline" className="font-mono">{'{iteration}'}</Badge>、
            <Badge variant="outline" className="font-mono">{'{track}'}</Badge>
            （交付轨道 Track/局点名，等价
            <Badge variant="outline" className="font-mono">{'{iterationEnd}'}</Badge>
            ，推荐新配置使用），需求分支支持
            <Badge variant="outline" className="font-mono">{'{identifier}'}</Badge>
            。
          </p>

          <div className="flex justify-end">{addButton}</div>

          <Card>
            <Card.Content>{listContent}</Card.Content>
          </Card>
        </div>
      )}

      {/* 新增/编辑分支模板抽屉 */}
      <Drawer
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
      >
        <DrawerContent className="w-full sm:w-[min(36rem,92vw)] sm:max-w-none">
          <DrawerHeader className="shrink-0 border-b border-border/70 px-5 py-3">
            <div className="flex items-center justify-between gap-4">
              <DrawerTitle className="min-w-0 truncate text-sm font-semibold">
                {editingId
                  ? `编辑${scope === 'iteration' ? '迭代专属' : '全局'}分支模板`
                  : `新增${scope === 'iteration' ? '迭代专属' : '全局'}分支模板`}
              </DrawerTitle>
              <Button
                type="button"
                variant="ghost"
                isIconOnly
                size="sm"
                aria-label="关闭"
                aria-disabled={saving || undefined}
                onPress={() => {
                  if (saving) return;
                  closeDrawer();
                }}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </DrawerHeader>

          <DrawerBody className="flex min-h-0 flex-1 flex-col px-5 py-4">
            {/* 滚动与边缘渐隐由 ScrollArea 承担，DrawerBody 只做弹性布局壳 */}
            <ScrollArea className="flex min-h-0 flex-1 flex-col gap-3">
            {/* 作用域与变量说明 */}
            <FieldDescription>
              {scope === 'iteration'
                ? '仅在当前迭代生效，构成该迭代的专属交付轨道（Track/局点）。支持 {iteration}、{track}、{iterationEnd}、{yyyy}/{MM}/{dd} 与 {identifier} 动态变量。'
                : '保存在本机作为全局预设模板，每条模板即一条交付轨道（Track/局点），所有迭代与需求均可选用。支持 {iteration}、{track}、{iterationEnd}、{yyyy}/{MM}/{dd} 与 {identifier} 动态变量。'}
            </FieldDescription>

            {/* 一键预设：仅填充草稿字段（含建议名称，可改），不自动保存 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">一键预设：</span>
              {BRANCH_TEMPLATE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setDraft((prev) => ({ ...prev, ...preset.draft }))}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <Field
              isRequired
              value={draft.name}
              onChange={(value) => setDraft({ ...draft, name: value })}
            >
              <FieldLabel>模板名称</FieldLabel>
              <Input placeholder="A 局点 / B 局点 / Hotfix" />
              <FieldDescription>即交付轨道（Track/局点）名称，用于 {'{track}'} 占位符展开。</FieldDescription>
            </Field>
            <Field
              isRequired
              value={draft.sourceBranch}
              onChange={(value) => setDraft({ ...draft, sourceBranch: value })}
            >
              <FieldLabel>迭代基准的源分支</FieldLabel>
              <Input className="font-mono" placeholder="master 或 test" />
              <FieldDescription>迭代基准分支的切出基点；与基准分支同名时即为单主干直连（Trunk-Based），无需创建迭代基准。</FieldDescription>
            </Field>
            <BranchPatternField
              label="迭代基准分支命名模板"
              value={draft.baselineBranchPattern}
              onChange={(value) => setDraft({ ...draft, baselineBranchPattern: value })}
              variables={baselineVariables}
              placeholder="iteration/{iteration}/{track}"
              required
              description="支持 {iteration}、{track}、{iterationEnd}、{yyyy}/{MM}/{dd}；固定分支请确认是长期线。"
            />
            <BranchPatternField
              label="需求开发分支命名模板"
              value={draft.workitemBranchPattern}
              onChange={(value) => setDraft({ ...draft, workitemBranchPattern: value })}
              variables={workitemVariables}
              placeholder="feature/{identifier}"
              required
              requiredTokens={['{identifier}']}
              description="支持 {identifier}（需求编号，如 REQ-101）。"
            />

            {draftWarnings.length > 0 && (
              <Alert status={draftHasError ? 'danger' : 'warning'}>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>命名规则提示</Alert.Title>
                  <Alert.Description>
                    <span className="flex flex-col gap-1">
                      {draftWarnings.map((warning) => (
                        <span key={warning.code}>{warning.message}</span>
                      ))}
                    </span>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {editingId ? (
              <BranchTopologyFields
                trackId={editingId}
                templateName={draft.name}
                iterationName={iterationName}
                iterationEndDate={iterationEndDate}
                baselinePattern={draft.baselineBranchPattern}
                workitemPattern={draft.workitemBranchPattern}
                readOnly={settings?.allowWriteOps !== true}
              />
            ) : (
              <FieldDescription>
                保存模板后可配置子分支拓扑（legacy / 不建子分支 / 自定义模式、基点与 MR 目标）。
              </FieldDescription>
            )}

            {/* 实时分支生成预览 */}
            {(previewBaseline || previewWorkitem) && (
              <div className="flex flex-col gap-1.5">
                <SectionHeader level="h3" title="命名预览" />
                <Descriptions
                  variant="plain"
                  items={[
                    {
                      key: 'baseline',
                      label: '基准分支',
                      children: (
                        <span className="min-w-0 truncate font-mono text-[11px] text-foreground/90">
                          {previewBaseline || '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'workitem',
                      label: '需求分支',
                      children: (
                        <span className="min-w-0 truncate font-mono text-[11px] text-primary">
                          {previewWorkitem || '—'}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            )}

            {/* 交付轨道拓扑实时预览：输入源分支与两条命名规则时重绘；基准≡源主干时自动切直连两节点 */}
            {(draft.sourceBranch || draft.baselineBranchPattern || draft.workitemBranchPattern) && (
              <TrackTopologyDiagram
                sourceBranch={draft.sourceBranch}
                baselinePattern={draft.baselineBranchPattern}
                workitemPattern={draft.workitemBranchPattern}
                variables={{
                  iteration: previewVariables.iteration,
                  track: previewTrack,
                  identifier: 'REQ-101',
                  iterationEnd: iterationEndDate,
                }}
                templateName={draft.name || (scope === 'iteration' ? '迭代专属分支模板' : '全局分支模板')}
              />
            )}
            </ScrollArea>
          </DrawerBody>

          <DrawerFooter className="shrink-0 justify-end gap-2 border-t border-border/70 px-5 py-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-disabled={saving || undefined}
              onPress={() => {
                if (saving) return;
                closeDrawer();
              }}
            >
              取消
            </Button>
            <WriteOpButton
              label={editingId ? '保存修改' : '添加模板'}
              title={editingId ? '保存分支模板修改' : '添加分支模板'}
              confirm="inline"
              confirmLabel="确认保存"
              disabled={saving}
              disabledReason="正在保存分支模板…"
              onAction={save}
            />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* 列表行直接点击查看的独立拓扑图弹窗 */}
      {topologyModalTemplate && (
        <TrackTopologyModal
          open={Boolean(topologyModalTemplate)}
          onOpenChange={(open) => {
            if (!open) setTopologyModalTemplate(null);
          }}
          sourceBranch={topologyModalTemplate.sourceBranch}
          baselinePattern={topologyModalTemplate.baselineBranchPattern}
          workitemPattern={topologyModalTemplate.workitemBranchPattern}
          variables={{
            iteration: previewVariables.iteration,
            track: topologyModalTemplate.name,
            identifier: 'REQ-101',
          }}
          templateName={topologyModalTemplate.name}
        />
      )}
    </>
  );
}
