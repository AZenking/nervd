import { AlertCircleIcon, CheckIcon, RefreshCwIcon } from 'lucide-react';
import { useSettingsDraft } from '@/store/settings-draft';

/** Linear 风格的设置自动保存状态指示器 */
export function SettingsAutoSaveStatus() {
  const autoSaveStatus = useSettingsDraft((s) => s.autoSaveStatus);
  const saving = useSettingsDraft((s) => s.saving);

  if (saving || autoSaveStatus === 'saving') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCwIcon className="size-3 animate-spin text-muted-foreground" />
        <span>保存中…</span>
      </div>
    );
  }
  if (autoSaveStatus === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertCircleIcon className="size-3" />
        <span>存在未填项或保存失败</span>
      </div>
    );
  }
  if (autoSaveStatus === 'unsaved') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-amber-500" />
        <span>未保存</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CheckIcon className="size-3 text-emerald-500" />
      <span>已自动保存</span>
    </div>
  );
}
