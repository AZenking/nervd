import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
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
import { SettingsGroup, SettingsRow } from '../settings-group';

const EMPTY_DRAFT: BranchRuleTemplate = {
  id: '',
  name: '',
  sourceBranch: 'master',
  baselineBranchPattern: 'iteration/{iteration}/{template}',
  workitemBranchPattern: 'feature/{identifier}',
};

export function BranchRulesSection() {
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
      await saveBranchRuleTemplates(next);
      setToast({ text: editingId ? '分支模板已更新' : '分支模板已保存到本机', kind: 'ok' });
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
      await saveBranchRuleTemplates(templates.filter((item) => item.id !== template.id));
      setToast({ text: '分支模板已删除', kind: 'ok' });
    } catch (error) {
      errorLog('branch-template-delete', error);
      setToast({ text: `删除分支模板失败：${humanizeError(error)}`, kind: 'fail' });
    }
  };

  const usageCount = (templateId: string) =>
    Object.values(settings?.workitemRepoBranchTemplates ?? {}).reduce(
      (count, selections) => count + Object.values(selections).filter((id) => id === templateId).length,
      0,
    );

  return (
    <>
      <SettingsGroup
        title="分支规则模板"
        description="为代码仓库预设分支生成规则，供需求详情按仓库选用。"
        action={(
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
        )}
      >
        {templates.map((template) => (
          <div
            key={template.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3.5 last:border-b-0 hover:bg-muted/30 transition-colors"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-foreground">{template.name}</span>
                {usageCount(template.id) > 0 && (
                  <span className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {usageCount(template.id)} 个需求仓库使用
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <span className="rounded bg-muted/60 px-1.5 py-0.5 text-foreground/80">{template.sourceBranch}</span>
                <span className="text-muted-foreground/50">→</span>
                <span className="rounded bg-muted/60 px-1.5 py-0.5 text-foreground/80">{template.baselineBranchPattern}</span>
                <span className="text-muted-foreground/50">→</span>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{template.workitemBranchPattern}</span>
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

        {!templates.length && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            暂无分支规则模板。点击右上角「新增模板」为项目配置基准与需求分支命名规则。
          </div>
        )}

        <SettingsRow
          orientation="horizontal"
          label="变量通配说明"
          description="基准模板支持 {iteration}（当前迭代标识）、{template}（模板名称），需求分支支持 {identifier}（需求编号，如 REQ-101）。"
          control={(
            <div className="flex flex-wrap gap-1 font-mono text-xs text-muted-foreground">
              <span className="rounded bg-muted/70 px-1.5 py-0.5">{'{iteration}'}</span>
              <span className="rounded bg-muted/70 px-1.5 py-0.5">{'{template}'}</span>
              <span className="rounded bg-muted/70 px-1.5 py-0.5">{'{identifier}'}</span>
            </div>
          )}
        />
      </SettingsGroup>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
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
                onChange={(event) => setDraft({ ...draft, baselineBranchPattern: event.target.value })}
                placeholder="iteration/{iteration}/{template}"
              />
            </Field>
            <Field>
              <FieldLabel>需求开发分支命名模板</FieldLabel>
              <Input
                className="font-mono"
                value={draft.workitemBranchPattern}
                onChange={(event) => setDraft({ ...draft, workitemBranchPattern: event.target.value })}
                placeholder="feature/{identifier}"
              />
            </Field>
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
