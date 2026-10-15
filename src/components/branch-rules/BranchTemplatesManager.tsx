import { useMemo, useState } from 'react';
import { GitBranchIcon, PlusIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import { errorLog, humanizeError } from '@/lib/error-format';
import type { BranchRuleTemplate } from '@/types';
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
import { Input } from '@/components/ui/input';
import { ConfirmButton } from '@/components/ConfirmButton';
import { EmptyHint } from '@/components/empty-hint';
import { SettingsGroup, SettingsRow } from '@/components/settings/settings-group';
import { expandBranchPattern } from '@/components/iteration/requirement/types';

const EMPTY_DRAFT: BranchRuleTemplate = {
  id: '',
  name: '',
  sourceBranch: 'master',
  baselineBranchPattern: 'iteration/{iteration}/{template}',
  workitemBranchPattern: 'feature/{identifier}',
};

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
    ? '为当前迭代配置专属的分支生成规则，优先级高于全局模板，需求详情按需选用。'
    : '为代码仓库预设全局分支生成规则，供需求详情按仓库选用。',
  inSettingsCard = false,
  iterationName = '',
}: BranchTemplatesManagerProps) {
  const { settings, setToast } = useApp();
  const [draft, setDraft] = useState<BranchRuleTemplate>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const closeDialog = () => {
    setDialogOpen(false);
    reset();
  };

  const startEdit = (template: BranchRuleTemplate) => {
    setDraft({ ...template });
    setEditingId(template.id);
    setDialogOpen(true);
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
      closeDialog();
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

  // 弹窗内的实时分支规则预览
  const previewBaseline = draft.baselineBranchPattern
    ? expandBranchPattern(draft.baselineBranchPattern, {
        iteration: iterationName || 'Sprint-2026',
        template: draft.name || '默认',
        identifier: 'REQ-101',
      })
    : '';
  const previewWorkitem = draft.workitemBranchPattern
    ? expandBranchPattern(draft.workitemBranchPattern, {
        iteration: iterationName || 'Sprint-2026',
        template: draft.name || '默认',
        identifier: 'REQ-101',
      })
    : '';

  const addButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        reset();
        setDialogOpen(true);
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
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">{template.name}</span>
                  <span
                    className={
                      scope === 'iteration'
                        ? 'rounded bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 font-mono text-[10px]'
                        : 'rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground'
                    }
                  >
                    {scope === 'iteration' ? '迭代专属' : '全局通用'}
                  </span>
                  {usageCount(template.id) > 0 && (
                    <span className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {usageCount(template.id)} 个需求仓库使用
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-foreground/80">
                    {template.sourceBranch}
                  </span>
                  <span className="text-muted-foreground/50">→</span>
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-foreground/80">
                    {template.baselineBranchPattern}
                  </span>
                  <span className="text-muted-foreground/50">→</span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                    {template.workitemBranchPattern}
                  </span>
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
            <div className="flex items-center justify-between border-t border-border/40 bg-muted/10 px-4 py-2 text-xs text-muted-foreground">
              <span className="text-[11px] text-muted-foreground">
                共 {templates.length} 个模板（第 {(currentPage - 1) * TEMPLATE_PAGE_SIZE + 1} -{' '}
                {Math.min(currentPage * TEMPLATE_PAGE_SIZE, templates.length)}）
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  下一页
                </Button>
              </div>
            </div>
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
    <div className="flex flex-wrap gap-1 font-mono text-xs text-muted-foreground">
      <span className="rounded bg-muted/70 px-1.5 py-0.5">{'{iteration}'}</span>
      <span className="rounded bg-muted/70 px-1.5 py-0.5">{'{template}'}</span>
      <span className="rounded bg-muted/70 px-1.5 py-0.5">{'{identifier}'}</span>
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
            description="基准模板支持 {iteration}（当前迭代标识）、{template}（模板名称），需求分支支持 {identifier}（需求编号，如 REQ-101）。"
            control={variableHelpControl}
          />
        </SettingsGroup>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="text-sm font-medium text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            {addButton}
          </div>

          <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
            {listContent}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/20 px-3.5 py-2 text-xs text-muted-foreground">
            <span>
              基准模板支持 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{'{iteration}'}</code>、<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{'{template}'}</code>，需求分支支持 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{'{identifier}'}</code>
            </span>
            {variableHelpControl}
          </div>
        </div>
      )}

      {/* 新增/编辑分支模板弹窗 */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? `编辑${scope === 'iteration' ? '迭代专属' : '全局'}分支模板`
                : `新增${scope === 'iteration' ? '迭代专属' : '全局'}分支模板`}
            </DialogTitle>
            <DialogDescription>
              {scope === 'iteration'
                ? '仅在当前迭代生效。支持使用 {iteration}、{template} 与 {identifier} 动态变量。'
                : '保存在本机作为全局预设模板，所有迭代与需求均可选用。支持动态通配变量。'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Field>
              <FieldLabel>模板名称</FieldLabel>
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="A 局点 / B 局点 / Hotfix"
              />
            </Field>
            <Field>
              <FieldLabel>迭代基准的源分支</FieldLabel>
              <Input
                className="font-mono"
                value={draft.sourceBranch}
                onChange={(event) => setDraft({ ...draft, sourceBranch: event.target.value })}
                placeholder="master 或 test"
              />
            </Field>
            <Field>
              <FieldLabel>迭代基准分支命名模板</FieldLabel>
              <Input
                className="font-mono"
                value={draft.baselineBranchPattern}
                onChange={(event) =>
                  setDraft({ ...draft, baselineBranchPattern: event.target.value })
                }
                placeholder="iteration/{iteration}/{template}"
              />
            </Field>
            <Field>
              <FieldLabel>需求开发分支命名模板</FieldLabel>
              <Input
                className="font-mono"
                value={draft.workitemBranchPattern}
                onChange={(event) =>
                  setDraft({ ...draft, workitemBranchPattern: event.target.value })
                }
                placeholder="feature/{identifier}"
              />
            </Field>

            {/* 实时分支生成预览 */}
            {(previewBaseline || previewWorkitem) && (
              <div className="rounded-md border border-border/50 bg-muted/30 p-2.5 text-xs">
                <span className="font-medium text-foreground">命名预览：</span>
                <div className="mt-1.5 flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
                  <div>
                    基准分支：<span className="text-foreground/90">{previewBaseline}</span>
                  </div>
                  <div>
                    需求分支：<span className="text-primary">{previewWorkitem}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={closeDialog}>
              取消
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? '保存中…' : editingId ? '保存修改' : '添加模板'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
