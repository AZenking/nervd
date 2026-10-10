import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import type { WorkitemChild } from '@/lib/api';
import type { WorkitemStatusOption } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useApp } from '@/store/app';
import { errorLog, humanizeError } from '@/lib/error-format';
import { SearchableSelect } from '../searchable-select';
import { WriteOpButton } from '@/components/WriteOpButton';

export function SubtaskEditDialog({
  child,
  parentWorkitemId,
  onClose,
}: {
  child: WorkitemChild;
  parentWorkitemId: string;
  onClose: () => void;
}) {
  const { settings, setToast, loadChildren } = useApp();
  const [subject, setSubject] = useState(child.subject);
  const [statusId, setStatusId] = useState(child.statusId ?? '');
  const [statuses, setStatuses] = useState<WorkitemStatusOption[]>([]);
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingStatuses(true);
    setStatusError('');
    void api.getWorkitemWorkflowStatuses(child.workitemId)
      .then((items) => {
        if (!active) return;
        setStatuses(items);
        if (!child.statusId) {
          const current = items.find((item) => item.name === child.status);
          if (current) setStatusId(current.id);
        }
      })
      .catch((cause: unknown) => { if (active) { errorLog('subtask-load', cause); setStatusError(humanizeError(cause, '子任务加载失败')); } })
      .finally(() => { if (active) setLoadingStatuses(false); });
    return () => { active = false; };
  }, [child.workitemId, child.status, child.statusId]);

  const updates: { subject?: string; statusId?: string } = {};
  if (subject.trim() !== child.subject.trim()) updates.subject = subject.trim();
  if (statusId && statusId !== child.statusId) updates.statusId = statusId;
  const disabledReason = !settings?.allowWriteOps
    ? '请先在「设置 → 安全」中开启写操作'
    : !updates.subject && !updates.statusId
      ? '没有需要保存的修改'
      : undefined;

  const save = async () => {
    if (disabledReason || saving) return;
    setSaving(true);
    try {
      await api.updateWorkitem(child.workitemId, updates);
      await loadChildren(parentWorkitemId);
      setToast({ text: `子任务 ${child.identifier} 已更新`, kind: 'ok' });
      onClose();
    } catch (cause) {
      errorLog('subtask-update', cause);
      setToast({ text: `子任务更新失败：${humanizeError(cause)}`, kind: 'fail' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑子任务</DialogTitle>
          <DialogDescription>{child.identifier}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="subtask-subject">名称</FieldLabel>
            <Input id="subtask-subject" value={subject} maxLength={500} onChange={(event) => setSubject(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="subtask-status">状态</FieldLabel>
            <SearchableSelect
              id="subtask-status"
              value={statusId || '__keep'}
              onValueChange={(v) => setStatusId(v && v !== '__keep' ? v : '')}
              disabled={loadingStatuses || Boolean(statusError) || !statuses.length}
              items={[
                { label: loadingStatuses ? '读取状态中…' : '保留当前状态', value: '__keep' },
                ...statuses.map((status) => ({ label: status.name, value: status.id })),
              ]}
            />
            {statusError && <span className="text-xs text-destructive">无法读取状态：{statusError}</span>}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          {/* UX A5：向导内用两段式确认，不再弹窗套弹窗 */}
          <WriteOpButton
            label={saving ? '保存中…' : '保存修改'}
            title={`修改子任务 ${child.identifier}`}
            confirm="inline"
            confirmLabel="确认保存"
            disabled={Boolean(disabledReason) || saving}
            disabledReason={disabledReason}
            onAction={save}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
