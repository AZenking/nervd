import { useMemo, useState } from 'react';
import { GitBranchIcon, PlusIcon, XIcon } from 'lucide-react';
import { Alert, Button as HeroButton, Description, Input, Label, Pagination, TextField } from '@heroui/react';
import { useApp } from '@/store/app';
import { errorLog, humanizeError } from '@/lib/error-format';
import type { BranchRuleTemplate } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { SettingsGroup, SettingsRow } from '@/components/settings/settings-group';
import { expandBranchPattern } from '@/components/iteration/requirement/types';
import { TrackTopologyDiagram } from './track-topology-diagram';

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
}: BranchTemplatesManagerProps) {
  const { settings, setToast } = useApp();
  const [draft, setDraft] = useState<BranchRuleTemplate>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 模板列表分页（超出 5 条时分页展示，避免长列表滚动）
  const TEMPLATE_PAGE_SIZE = 5;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(templates.length / TEMPLATE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedTemplates = useMemo(() => {
    const start = (currentPage - 1) * TEMPLATE_PAGE_SIZE;
    return templates.slice(start, start + TEMPLATE_PAGE_SIZE);
  }, [templates, currentPage]);

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
        <div className="flex flex-col divide-y divide-border/50">
          {paginatedTemplates.map((template) => (
            <div
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">{template.name}</span>
                  <Badge
                    variant={scope === 'iteration' ? 'soft' : 'outline'}
                    color={scope === 'iteration' ? 'accent' : 'default'}
                    className="font-mono"
                  >
                    {scope === 'iteration' ? '迭代专属' : '全局通用'}
                  </Badge>
                  {usageCount(template.id) > 0 && (
                    <Badge variant="secondary" className="font-mono">
                      {usageCount(template.id)} 个需求仓库使用
                    </Badge>
                  )}
                </div>
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
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
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
            </div>
          ))}

          {totalPages > 1 && (
            <Pagination
              size="sm"
              className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-muted/10 px-4 py-2 text-xs text-muted-foreground"
            >
              <Pagination.Summary className="text-[11px] text-muted-foreground">
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
        </div>
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
        {'{template}'}
      </Badge>
      <Badge variant="outline" className="font-mono">
        {'{identifier}'}
      </Badge>
    </div>
  );

  return (
    <>
      {inSettingsCard ? (
        <SettingsGroup title={title} description={description} action={addButton}>
          {listContent}
          <SettingsRow
            orientation="horizontal"
            label="变量通配说明"
            description="基准模板支持 {iteration}（当前迭代标识）、{track}（交付轨道 Track/局点名，等价于 {template} 模板名称，推荐新配置使用 {track}），需求分支支持 {identifier}（需求编号，如 REQ-101）。"
            control={variableHelpControl}
          />
        </SettingsGroup>
      ) : (
        <div className="flex flex-col gap-3">
          {/* 标题、说明与变量通配说明合并为 Alert，置于模板列表上方 */}
          <Alert status="default">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{title}</Alert.Title>
              <Alert.Description className="flex flex-col gap-1.5">
                <span>{description}</span>
                <span className="flex flex-wrap items-center gap-x-1 text-muted-foreground">
                  基准模板支持
                  <Badge variant="outline" className="font-mono">{'{iteration}'}</Badge>、
                  <Badge variant="outline" className="font-mono">{'{track}'}</Badge>
                  （交付轨道 Track/局点名，等价
                  <Badge variant="outline" className="font-mono">{'{template}'}</Badge>
                  ，推荐新配置使用），需求分支支持
                  <Badge variant="outline" className="font-mono">{'{identifier}'}</Badge>
                  。
                </span>
              </Alert.Description>
            </Alert.Content>
          </Alert>

          <div className="flex justify-end">{addButton}</div>

          <Card className="p-0 overflow-hidden">
            {listContent}
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
        <DrawerContent className="w-full sm:w-[min(32rem,92vw)] sm:max-w-none">
          <DrawerHeader className="shrink-0 border-b border-border/70 px-5 py-3">
            <div className="flex items-center justify-between gap-4">
              <DrawerTitle className="min-w-0 truncate text-sm font-semibold">
                {editingId
                  ? `编辑${scope === 'iteration' ? '迭代专属' : '全局'}分支模板`
                  : `新增${scope === 'iteration' ? '迭代专属' : '全局'}分支模板`}
              </DrawerTitle>
              <HeroButton
                type="button"
                variant="ghost"
                isIconOnly
                size="sm"
                aria-label="关闭"
                isDisabled={saving}
                onPress={closeDrawer}
              >
                <XIcon className="size-4" />
              </HeroButton>
            </div>
          </DrawerHeader>

          <DrawerBody className="flex min-h-0 flex-1 flex-col px-5 py-4">
            {/* 滚动与边缘渐隐由 ScrollArea 承担，DrawerBody 只做弹性布局壳 */}
            <ScrollArea className="flex min-h-0 flex-1 flex-col gap-3">
            {/* 作用域与变量说明（HeroUI Alert） */}
            <Alert status="default">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  {scope === 'iteration'
                    ? '仅在当前迭代生效，构成该迭代的专属交付轨道（Track/局点）。支持 {iteration}、{track}（等价 {template}）与 {identifier} 动态变量。'
                    : '保存在本机作为全局预设模板，每条模板即一条交付轨道（Track/局点），所有迭代与需求均可选用。支持 {iteration}、{track}（等价 {template}）与 {identifier} 动态变量。'}
                </Alert.Description>
              </Alert.Content>
            </Alert>

            {/* 一键预设：仅填充草稿字段（含建议名称，可改），不自动保存 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">一键预设：</span>
              {BRANCH_TEMPLATE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="xs"
                  className="h-6 rounded-md font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => setDraft((prev) => ({ ...prev, ...preset.draft }))}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <TextField
              isRequired
              value={draft.name}
              onChange={(value) => setDraft({ ...draft, name: value })}
            >
              <Label>模板名称</Label>
              <Input placeholder="A 局点 / B 局点 / Hotfix" />
              <Description>即交付轨道（Track/局点）名称，用于 {'{track}'} / {'{template}'} 占位符展开。</Description>
            </TextField>
            <TextField
              isRequired
              value={draft.sourceBranch}
              onChange={(value) => setDraft({ ...draft, sourceBranch: value })}
            >
              <Label>迭代基准的源分支</Label>
              <Input className="font-mono" placeholder="master 或 test" />
              <Description>迭代基准分支的切出基点；与基准分支同名时即为单主干直连（Trunk-Based），无需创建迭代基准。</Description>
            </TextField>
            <TextField
              isRequired
              value={draft.baselineBranchPattern}
              onChange={(value) => setDraft({ ...draft, baselineBranchPattern: value })}
            >
              <Label>迭代基准分支命名模板</Label>
              <Input className="font-mono" placeholder="iteration/{iteration}/{track}" />
              <Description>
                支持 <span className="font-mono">{'{iteration}'}</span> 与{' '}
                <span className="font-mono">{'{track}'}</span>（等价{' '}
                <span className="font-mono">{'{template}'}</span>，推荐使用{' '}
                <span className="font-mono">{'{track}'}</span>）。
              </Description>
            </TextField>
            <TextField
              isRequired
              value={draft.workitemBranchPattern}
              onChange={(value) => setDraft({ ...draft, workitemBranchPattern: value })}
            >
              <Label>需求开发分支命名模板</Label>
              <Input className="font-mono" placeholder="feature/{identifier}" />
              <Description>
                支持 <span className="font-mono">{'{identifier}'}</span>（需求编号，如 <span className="font-mono">REQ-101</span>）。
              </Description>
            </TextField>

            {/* 实时分支生成预览（HeroUI Alert） */}
            {(previewBaseline || previewWorkitem) && (
              <Alert status="accent">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>命名预览</Alert.Title>
                  <Alert.Description className="flex flex-col gap-1 font-mono text-[11px]">
                    <span>
                      基准分支：<span className="text-foreground/90">{previewBaseline}</span>
                    </span>
                    <span>
                      需求分支：<span className="text-primary">{previewWorkitem}</span>
                    </span>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
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
                }}
              />
            )}
            </ScrollArea>
          </DrawerBody>

          <DrawerFooter className="shrink-0 justify-end gap-2 border-t border-border/70 px-5 py-3">
            <HeroButton type="button" variant="secondary" isDisabled={saving} onPress={closeDrawer}>
              取消
            </HeroButton>
            <HeroButton type="button" isDisabled={saving} onPress={() => void save()}>
              {saving ? '保存中…' : editingId ? '保存修改' : '添加模板'}
            </HeroButton>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
