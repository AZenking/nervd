import { useState } from 'react';
import { GitBranchIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import type { BranchRuleTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

function BranchTemplateManager() {
  const { settings, saveBranchRuleTemplates, setToast } = useApp();
  const templates = settings?.branchRuleTemplates ?? [];
  const [draft, setDraft] = useState<BranchRuleTemplate>({
    id: '',
    name: '',
    sourceBranch: 'master',
    baselineBranchPattern: 'iteration/{iteration}/{template}',
    workitemBranchPattern: 'feature/{identifier}',
  });
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = (template: BranchRuleTemplate) => {
    setDraft({ ...template });
    setEditingId(template.id);
  };

  const reset = () => {
    setDraft({
      id: '', name: '', sourceBranch: 'master',
      baselineBranchPattern: 'iteration/{iteration}/{template}',
      workitemBranchPattern: 'feature/{identifier}',
    });
    setEditingId('');
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
      reset();
    } catch (error) {
      setToast({ text: `保存分支模板失败：${String(error)}`, kind: 'fail' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (template: BranchRuleTemplate) => {
    const usedCount = Object.values(settings?.workitemRepoBranchTemplates ?? {})
      .reduce((count, selections) => count + Object.values(selections).filter((id) => id === template.id).length, 0);
    const suffix = usedCount ? `会清除 ${usedCount} 个需求仓库的模板选择。` : '';
    if (!window.confirm(`删除模板「${template.name}」？${suffix}`)) return;
    try {
      await saveBranchRuleTemplates(templates.filter((item) => item.id !== template.id));
      if (editingId === template.id) reset();
      setToast({ text: '分支模板已删除', kind: 'ok' });
    } catch (error) {
      setToast({ text: `删除分支模板失败：${String(error)}`, kind: 'fail' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><GitBranchIcon className="size-4" />分支规则模板</CardTitle>
        <CardDescription>
          模板保存在本机，可在需求的每个仓库关联项上单独选择。基准模板支持 {'{iteration}'}、{'{template}'}，需求分支模板支持 {'{identifier}'}。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2">
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
        <div className="flex flex-wrap gap-2">
          <Button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : editingId ? '保存修改' : '添加模板'}</Button>
          {editingId && <Button variant="outline" disabled={saving} onClick={reset}>取消编辑</Button>}
        </div>
        {templates.length > 0 && (
          <div className="divide-y rounded-lg border">
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
                  <Button variant="ghost" size="sm" onClick={() => void remove(template)}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!templates.length && <p className="text-xs text-muted-foreground">还没有模板。可先创建 A 局点（master）、B 局点（test）或 Hotfix（master）模板。</p>}
      </CardContent>
    </Card>
  );
}

export function IterationBranches() {
  return <BranchTemplateManager />;
}
