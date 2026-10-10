import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import type { BranchRuleTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ConfirmButton } from '../ConfirmButton';

const EMPTY_DRAFT: BranchRuleTemplate = {
  id: '',
  name: '',
  sourceBranch: 'master',
  baselineBranchPattern: 'iteration/{iteration}/{template}',
  workitemBranchPattern: 'feature/{identifier}',
};

/**
 * 分支规则模板管理（新增/编辑走 Dialog，列表留在卡片内，无卡片壳）。
 * 卡片壳与折叠交互由 IterationView 的低频配置区承载（高频工作项列表前置）。
 */
export function IterationBranches() {
  const { settings, saveBranchRuleTemplates, setToast } = useApp();
  const templates = settings?.branchRuleTemplates ?? [];
  const [draft, setDraft] = useState<BranchRuleTemplate>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const reset = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId('');
  };

  /** 关闭即丢弃草稿（与「取消」一致）；保存成功后同样走 reset + close */
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
    const normalized = {
      ...draft,
      id: editingId || crypto.randomUUID(),
      name: draft.name.trim(),
      sourceBranch: draft.sourceBranch.trim(),
      baselineBranchPattern: draft.baselineBranchPattern.trim(),
      workitemBranchPattern: draft.workitemBranchPattern.trim(),
    };
    if (!normalized.name || !normalized.sourceBranch || !normalized.baselineBranchPattern || !normalized.workitemBranchPattern) {
      setToast({ text: '模板名称、源分支和两条分支命名规则都必须填写', kind: 'fail' });
      return;
    }
    if (templates.some((item) => item.id !== normalized.id && item.name.toLowerCase() === normalized.name.toLowerCase())) {
      setToast({ text: '模板名称不能重复', kind: 'fail' });
      return;
    }
    setSaving(true);
    try {
      const next = editingId
        ? templates.map((item) => item.id === editingId ? normalized : item)
        : [...templates, normalized];
      await saveBranchRuleTemplates(next);
      setToast({ text: editingId ? '分支模板已更新' : '分支模板已保存到本机', kind: 'ok' });
      closeDialog();
    } catch (error) {
      setToast({ text: `保存分支模板失败：${String(error)}`, kind: 'fail' });
    } finally {
      setSaving(false);
    }
  };

  // UX A4：确认统一走 AlertDialog（ConfirmButton），不再使用原生 window.confirm
  const remove = async (template: BranchRuleTemplate) => {
    try {
      await saveBranchRuleTemplates(templates.filter((item) => item.id !== template.id));
      setToast({ text: '分支模板已删除', kind: 'ok' });
    } catch (error) {
      setToast({ text: `删除分支模板失败：${String(error)}`, kind: 'fail' });
    }
  };

  const usageCount = (templateId: string) =>
    Object.values(settings?.workitemRepoBranchTemplates ?? {})
      .reduce((count, selections) => count + Object.values(selections).filter((id) => id === templateId).length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => { reset(); setDialogOpen(true); }}
        >
          <PlusIcon data-icon="inline-start" />
          新增模板
        </Button>
      </div>
      {templates.length > 0 && (
        <div className="divide-y rounded-lg border border-border bg-muted/20">
          {templates.map((template) => (
            <div key={template.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{template.name}</p>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {template.sourceBranch} → {template.baselineBranchPattern} → {template.workitemBranchPattern}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => startEdit(template)}>编辑</Button>
                <ConfirmButton
                  label="删除"
                  title={`删除模板「${template.name}」？`}
                  description={usageCount(template.id)
                    ? `该模板正被 ${usageCount(template.id)} 个需求仓库使用，删除后会一并清除这些模板选择。`
                    : '删除后不可恢复，已创建的远端分支不受影响。'}
                  confirmLabel="删除模板"
                  onConfirm={() => remove(template)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {!templates.length && <p className="empty-state px-3 py-4 text-xs text-muted-foreground">还没有模板。可先创建 A 局点（master）、B 局点（test）或 Hotfix（master）模板。</p>}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑分支模板' : '新增分支模板'}</DialogTitle>
            <DialogDescription>
              模板保存在本机，供需求仓库单独选用。基准模板支持 {'{iteration}'}、{'{template}'}，需求分支支持 {'{identifier}'}。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field>
              <FieldLabel>模板名称</FieldLabel>
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="A 局点 / B 局点 / Hotfix" />
            </Field>
            <Field>
              <FieldLabel>迭代基准的源分支</FieldLabel>
              <Input className="font-mono" value={draft.sourceBranch} onChange={(event) => setDraft({ ...draft, sourceBranch: event.target.value })} placeholder="master 或 test" />
            </Field>
            <Field>
              <FieldLabel>迭代基准分支命名模板</FieldLabel>
              <Input className="font-mono" value={draft.baselineBranchPattern} onChange={(event) => setDraft({ ...draft, baselineBranchPattern: event.target.value })} placeholder="iteration/{iteration}/{template}" />
            </Field>
            <Field>
              <FieldLabel>需求开发分支命名模板</FieldLabel>
              <Input className="font-mono" value={draft.workitemBranchPattern} onChange={(event) => setDraft({ ...draft, workitemBranchPattern: event.target.value })} placeholder="feature/{identifier}" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={closeDialog}>取消</Button>
            <Button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : editingId ? '保存修改' : '添加模板'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
