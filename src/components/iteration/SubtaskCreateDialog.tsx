import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import type { WorkitemChild, WorkitemTypeOption } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useApp } from '@/store/app';
import { errorLog, humanizeError } from '@/lib/error-format';
import { SearchableSelect } from '../searchable-select';
import { WriteOpButton } from '@/components/WriteOpButton';

/**
 * 新建子任务（挂到当前需求下，写操作）：
 * 类型来自项目 Task 工作项类型（defaultType 预选），创建成功后刷新子项列表。
 * 门控与确认方式对齐 SubtaskEditDialog（WriteOpButton confirm="inline"）。
 */
export function SubtaskCreateDialog({
  parentWorkitemId,
  onClose,
}: {
  parentWorkitemId: string;
  onClose: () => void;
}) {
  const { settings, setToast, loadChildren } = useApp();
  const [subject, setSubject] = useState('');
  const [types, setTypes] = useState<WorkitemTypeOption[]>([]);
  const [typeId, setTypeId] = useState('');
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typeError, setTypeError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingTypes(true);
    setTypeError('');
    void api.listWorkitemTypes('Task')
      .then((items) => {
        if (!active) return;
        setTypes(items);
        setTypeId(items.find((item) => item.defaultType)?.id ?? items[0]?.id ?? '');
      })
      .catch((cause: unknown) => { if (active) { errorLog('subtask-types', cause); setTypeError(humanizeError(cause, '子任务类型加载失败')); } })
      .finally(() => { if (active) setLoadingTypes(false); });
    return () => { active = false; };
  }, []);

  const disabledReason = !settings?.allowWriteOps
    ? '请先在「设置 → 安全」中开启写操作'
    : loadingTypes
      ? '正在读取子任务类型…'
      : typeError || !types.length
        ? `子任务类型不可用：${typeError || '项目内没有 Task 类型'}`
        : !subject.trim()
          ? '请填写子任务名称'
          : !typeId
            ? '请选择子任务类型'
            : undefined;

  const create = async () => {
    if (disabledReason || creating) return;
    setCreating(true);
    try {
      const child: WorkitemChild = await api.createWorkitemChild(parentWorkitemId, {
        subject: subject.trim(),
        workitemTypeId: typeId,
      });
      await loadChildren(parentWorkitemId);
      setToast({ text: `子任务 ${child.identifier || child.subject} 已创建`, kind: 'ok' });
      onClose();
    } catch (cause) {
      errorLog('subtask-create', cause);
      setToast({ text: `子任务创建失败：${humanizeError(cause)}`, kind: 'fail' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建子任务</DialogTitle>
          <DialogDescription>将挂载到当前需求下，迭代与父需求保持一致</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="subtask-create-subject">名称</FieldLabel>
            <Input
              id="subtask-create-subject"
              value={subject}
              maxLength={500}
              autoFocus
              placeholder="例如：完成登录模块自测"
              onChange={(event) => setSubject(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="subtask-create-type">类型</FieldLabel>
            <SearchableSelect
              id="subtask-create-type"
              value={typeId || null}
              onValueChange={(value) => setTypeId(value ?? '')}
              disabled={loadingTypes || Boolean(typeError) || !types.length}
              items={types.map((type) => ({ label: type.name, value: type.id }))}
            />
            {typeError && <span className="text-xs text-destructive">无法读取类型：{typeError}</span>}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          {/* UX A5：向导内用两段式确认，不再弹窗套弹窗 */}
          <WriteOpButton
            label={creating ? '创建中…' : '创建子任务'}
            title="在当前需求下创建子任务"
            confirm="inline"
            confirmLabel="确认创建"
            disabled={Boolean(disabledReason) || creating}
            disabledReason={disabledReason}
            onAction={create}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
