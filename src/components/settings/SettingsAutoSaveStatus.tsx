import { AlertCircleIcon, CheckIcon, RefreshCwIcon, RotateCcwIcon } from 'lucide-react';
import { useSettingsDraft } from '@/store/settings-draft';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function formatSavedTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** Linear 风格的设置自动保存状态指示器（支持错误定位 Tooltip、重试操作与保存时间反馈） */
export function SettingsAutoSaveStatus() {
  const autoSaveStatus = useSettingsDraft((s) => s.autoSaveStatus);
  const saving = useSettingsDraft((s) => s.saving);
  const fieldErrors = useSettingsDraft((s) => s.fieldErrors);
  const lastSavedAt = useSettingsDraft((s) => s.lastSavedAt);
  const retrySave = useSettingsDraft((s) => s.retrySave);
  const flushAutoSave = useSettingsDraft((s) => s.flushAutoSave);

  if (saving || autoSaveStatus === 'saving') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
        <RefreshCwIcon className="size-3 animate-spin text-muted-foreground" />
        <span>保存中…</span>
      </div>
    );
  }

  if (autoSaveStatus === 'error') {
    const errorCount = Object.keys(fieldErrors).length;
    const errorMessages = Object.entries(fieldErrors).map(([key, msg]) => {
      let label = '配置项';
      if (key === 'space') label = '默认项目空间';
      else if (key.startsWith('jenkins-')) label = 'Jenkins 实例';
      else if (key.startsWith('repo-')) label = '仓库 CI 绑定';
      return `${label}: ${msg}`;
    });

    return (
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="flex cursor-help items-center gap-1.5 text-xs text-destructive select-none">
                  <AlertCircleIcon className="size-3" />
                  <span>{errorCount > 0 ? `存在 ${errorCount} 处待修正` : '保存失败'}</span>
                </div>
              }
            />
            <TooltipContent side="bottom" align="end" className="max-w-xs flex flex-col gap-1 text-[11px]">
              <span className="font-semibold text-destructive-foreground">保存未完成：</span>
              {errorMessages.length > 0 ? (
                <ul className="list-disc pl-3 text-muted-foreground/90 space-y-0.5">
                  {errorMessages.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              ) : (
                <span>网络连接或权限异常，请点击重试。</span>
              )}
            </TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={() => void retrySave()}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
            title="重新尝试保存"
          >
            <RotateCcwIcon className="size-2.5" />
            <span>重试</span>
          </button>
        </div>
      </TooltipProvider>
    );
  }

  if (autoSaveStatus === 'unsaved') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => void flushAutoSave()}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors select-none"
                title="点击立即保存"
              >
                <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>未保存</span>
              </button>
            }
          />
          <TooltipContent side="bottom" align="end" className="text-[11px]">
            检测到本地草稿改动，停止输入后将自动保存（或点击立即保存）
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground select-none cursor-default">
              <CheckIcon className="size-3 text-emerald-500" />
              <span>已自动保存</span>
            </div>
          }
        />
        <TooltipContent side="bottom" align="end" className="text-[11px]">
          所有配置均已持久化至本地
          {lastSavedAt ? ` · 最近于 ${formatSavedTime(lastSavedAt)}` : ''}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

