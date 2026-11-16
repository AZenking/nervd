import { useEffect, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Surface } from '@heroui/react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { StatusIcon } from '@/components/status-icon';
import { READONLY_BTN_CLASS } from '../WriteOpButton';
import { WORKITEM_STATUS_OPTIONS } from './workitem-status-dropdown';

/** 两段式确认倒计时：4 秒无操作自动复位（与 WriteOpButton inline 一致） */
const INLINE_CONFIRM_TIMEOUT_MS = 4000;

export interface FloatingBatchBarProps {
  /** 选中的工作项 ID 集合 */
  selectedIds: Set<string>;
  /** 清空多选回调 */
  onClear: () => void;
  /** 自定义批量流转状态回调 */
  onBatchStatusChange?: (statusName: string, selectedIds: string[]) => void;
}

/**
 * 底部浮动批量操作条（Linear 式 Floating Batch Bar）：
 * - 选中项 > 0 时从底部平滑滑出
 * - 一键批量流转状态：只读态入口 aria-disabled + Toast 引导；可写态先进入两段式确认（N 项批量写），
 *   二次点击才真正提交（AGENTS §5.2：浮条内不做独立弹窗，避免弹窗套弹窗）
 * - 显示当前已选项计数与 Esc 清空提示
 */
export function FloatingBatchBar({
  selectedIds,
  onClear,
  onBatchStatusChange,
}: FloatingBatchBarProps) {
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const allowWrite = useApp((s) => s.settings?.allowWriteOps ?? false);
  const openSettings = useUi((s) => s.openSettings);

  // 两段式确认：4 秒无操作自动复位，避免残留的待确认批量写
  useEffect(() => {
    if (!pendingStatus) return;
    const timer = window.setTimeout(() => setPendingStatus(null), INLINE_CONFIRM_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pendingStatus]);

  // 选中项被清空（Esc / 行点击）时同步复位待确认态，避免下次选中的旧意图残留
  useEffect(() => {
    if (selectedIds.size === 0) setPendingStatus(null);
  }, [selectedIds.size]);

  if (selectedIds.size === 0) return null;

  const notifyReadonly = () => {
    toast.add({
      title: '当前处于只读模式',
      description: '批量流转状态是写操作。可在「设置 → 安全」中开启写权限后执行。',
      type: 'warning',
      actionProps: {
        children: '前往设置',
        onClick: () => openSettings('security'),
      },
    });
  };

  /** 二次确认后真正提交批量写（只读兜底：DOM 被篡改也不会发请求） */
  const applyBatchStatus = (statusName: string) => {
    if (!allowWrite) {
      notifyReadonly();
      return;
    }
    const ids = Array.from(selectedIds);
    if (onBatchStatusChange) {
      onBatchStatusChange(statusName, ids);
    } else {
      const updateWorkitemStatusOptimistic = useApp.getState().updateWorkitemStatusOptimistic;
      void Promise.all(
        ids.map((id) => updateWorkitemStatusOptimistic(id, statusName)),
      );
    }
    setPendingStatus(null);
    onClear();
  };

  const pendingLabel = pendingStatus
    ? WORKITEM_STATUS_OPTIONS.find((option) => option.name === pendingStatus)?.label ?? pendingStatus
    : '';

  return (
    <Surface
      variant="default"
      data-testid="floating-batch-bar"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 backdrop-blur-md border border-border shadow-level-2 rounded-lg px-3.5 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <Chip
        data-testid="batch-bar-count"
        size="sm"
        color="accent"
        variant="soft"
        className="font-mono text-xs font-semibold tabular-nums"
      >
        已选 {selectedIds.size} 项
      </Chip>
      <Separator orientation="vertical" className="h-4" />
      {!allowWrite ? (
        // 只读门控：不使用原生 disabled（会吞 hover/focus），aria-disabled + 灰阶 + Tooltip + Toast
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="xs"
                variant="outline"
                aria-disabled="true"
                data-testid="batch-status-trigger"
                className={`gap-1.5 text-xs h-7 ${READONLY_BTN_CLASS}`}
                onPress={notifyReadonly}
              >
                <span>变更状态</span>
                <ChevronRightIcon className="size-3 rotate-90 text-muted-foreground" />
              </Button>
            }
          />
          <TooltipContent>写操作已关闭：需在「设置 → 安全」中开启（需写权限令牌）</TooltipContent>
        </Tooltip>
      ) : pendingStatus ? (
        // 两段式确认：第一次选择状态只进入待确认态，第二次点击才提交 N 项批量写
        <div
          role="status"
          aria-live="polite"
          data-testid="batch-status-confirm"
          className="flex items-center gap-2"
        >
          <span className="text-xs text-foreground">
            将 <span className="font-mono font-semibold tabular-nums">{selectedIds.size}</span> 项流转为「{pendingLabel}」？
          </span>
          <Button
            size="xs"
            variant="destructive"
            className="h-7 text-xs"
            onPress={() => applyBatchStatus(pendingStatus)}
          >
            确认流转
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onPress={() => setPendingStatus(null)}
          >
            取消
          </Button>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="xs"
                variant="outline"
                data-testid="batch-status-trigger"
                className="gap-1.5 text-xs h-7"
              >
                <span>变更状态</span>
                <ChevronRightIcon className="size-3 rotate-90 text-muted-foreground" />
              </Button>
            }
          />
          <DropdownMenuContent
            align="center"
            className="w-36 p-1 z-50"
            header={
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider">
                批量流转为
              </div>
            }
          >
            {WORKITEM_STATUS_OPTIONS.map((st) => (
              <DropdownMenuItem
                key={st.name}
                onClick={() => setPendingStatus(st.name)}
                className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm cursor-pointer"
              >
                <StatusIcon status={st.name} className="size-3.5" />
                <span>{st.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Button
        size="xs"
        variant="ghost"
        onClick={onClear}
        className="text-xs text-muted-foreground hover:text-foreground h-7"
      >
        取消 (Esc)
      </Button>
    </Surface>
  );
}