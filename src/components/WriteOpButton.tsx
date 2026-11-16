// 写操作按钮：allowWriteOps 门控 + Tooltip 提示 + 确认。
// confirm="dialog"（默认）：AlertDialog 二次确认，用于工具栏等上下文充足的入口。
// confirm="inline"（UX 评审 A5）：两段式确认——第一次点击进入待确认态（4s 超时回退），
// 第二次点击执行；用于已经打开的 Dialog/向导内部，避免"弹窗套弹窗"。
// 只读门控（设计审计 A4）：不再用 HTML disabled（会吞掉 hover/focus，Tooltip 永不出现），
// 改为 aria-disabled + 灰阶样式，点击打开说明弹窗并引导前往设置。
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useApp } from '../store/app';
import { useUi } from '../store/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const INLINE_CONFIRM_TIMEOUT_MS = 4000;

/** 只读门控态的灰阶样式（与 ui/button.tsx 禁用态视觉一致，但保留 hover/focus）。
 *  hover 一并压成灰阶，避免 variant=default 的 hover:bg-primary/90 让只读按钮悬停闪回品牌蓝。 */
const READONLY_BTN_CLASS =
  // HeroUI 对 aria-disabled 按钮默认设了 pointer-events:none（会吞掉点击与 hover，
  // 导致"只读点击提示前往设置"这条路径失效）；这里用 !important 强制恢复指针事件。
  'pointer-events-auto! bg-default text-muted-foreground border-border/60 shadow-none hover:bg-default hover:text-muted-foreground cursor-not-allowed opacity-80';

export { READONLY_BTN_CLASS };

/** 只读门控触发器：供自带确认流程的写操作入口复用（如 JenkinsBuildDialog 的向导入口）。
 *  allowWriteOps=false 时渲染灰阶 aria-disabled 按钮，点击通过 Toast 引导前往设置开启写权限；
 *  允许写操作时返回 null，由调用方渲染真实入口。 */
export function WriteOpGatedTrigger({
  label,
  icon,
  variant = 'outline',
}: {
  label: string;
  icon?: ReactNode;
  variant?: ComponentProps<typeof Button>['variant'];
}) {
  const allow = useApp((s) => s.settings?.allowWriteOps ?? false);
  const openSettings = useUi((s) => s.openSettings);
  if (allow) return null;

  const handleClick = () => {
    toast.add({
      title: '当前处于只读模式',
      description: `「${label}」是写操作。可在「设置 → 安全」中开启写权限后执行。`,
      type: 'warning',
      actionProps: {
        children: '前往设置',
        onClick: () => openSettings('security'),
      },
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="sm"
            variant={variant}
            aria-disabled="true"
            data-testid="write-op-gated"
            className={READONLY_BTN_CLASS}
            onPress={handleClick}
          >
            {icon}
            <span>{label}</span>
          </Button>
        }
      />
      <TooltipContent>写操作已关闭：需在「设置 → 安全」中开启（需写权限令牌）</TooltipContent>
    </Tooltip>
  );
}

export function WriteOpButton({
  label,
  onAction,
  title,
  disabled = false,
  disabledReason,
  variant = 'default',
  confirm = 'dialog',
  confirmLabel = '确认执行',
}: {
  label: string;
  onAction: () => Promise<void>;
  title?: string;
  disabled?: boolean;
  disabledReason?: string;
  variant?: ComponentProps<typeof Button>['variant'];
  /** 确认形态：dialog = AlertDialog 二次确认；inline = 两段式按钮 */
  confirm?: 'dialog' | 'inline';
  confirmLabel?: string;
}) {
  const allow = useApp((s) => s.settings?.allowWriteOps ?? false);
  const openSettings = useUi((s) => s.openSettings);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<number | null>(null);

  const blocked = !allow;

  useEffect(() => () => {
    if (armTimer.current != null) window.clearTimeout(armTimer.current);
  }, []);

  const tip = blocked
    ? '写操作已关闭：需在「设置 → 安全」中开启（需写权限令牌）'
    : disabled
      ? disabledReason ?? title ?? label
      : title ?? label;

  const notifyReadonly = () => {
    toast.add({
      title: '当前处于只读模式',
      description: `「${label}」是写操作。可在「设置 → 安全」中开启写权限后执行。`,
      type: 'warning',
      actionProps: {
        children: '前往设置',
        onClick: () => openSettings('security'),
      },
    });
  };

  const run = async () => {
    setBusy(true);
    try {
      await onAction();
    } finally {
      setBusy(false);
      setOpen(false);
      disarm();
    }
  };

  const disarm = () => {
    setArmed(false);
    if (armTimer.current != null) {
      window.clearTimeout(armTimer.current);
      armTimer.current = null;
    }
  };

  const handleInlineClick = () => {
    if (!armed) {
      setArmed(true);
      armTimer.current = window.setTimeout(disarm, INLINE_CONFIRM_TIMEOUT_MS);
      return;
    }
    void run();
  };

  // ---- 只读门控触发器：aria-disabled + 灰阶，保留 Tooltip 与点击反馈 ----
  const readonlyTrigger = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="sm"
            variant={variant}
            aria-disabled="true"
            data-testid="write-op-button"
            className={READONLY_BTN_CLASS}
            onPress={notifyReadonly}
          >
            {label}
          </Button>
        }
      />
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );

  // ---- 内联两段式（向导内使用） ----
  if (confirm === 'inline') {
    if (blocked) {
      return readonlyTrigger;
    }
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant={armed ? 'destructive' : variant}
              // 设计审计 A4：禁止用原生 disabled（RAC 会输出 disabled 属性并置 tabIndex=-1，
              // 导致 hover/focus 与 disabledReason Tooltip 全部失效）。改为 aria-disabled + 灰阶 +
              // onPress 内 early-return，保留可聚焦与悬停解释。
              aria-disabled={busy || disabled || undefined}
              className={cn((busy || disabled) && READONLY_BTN_CLASS)}
              onPress={() => {
                if (busy || disabled) return;
                handleInlineClick();
              }}
            >
              {busy ? (<><Spinner data-icon="inline-start" />{label}…</>) : armed ? confirmLabel : label}
            </Button>
          }
        />
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    );
  }

  // ---- AlertDialog 二次确认（默认；受控弹窗，按钮/菜单两种触发形态共用） ----
  const confirmDialog = (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) disarm(); setOpen(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认{title ?? label}</AlertDialogTitle>
          <AlertDialogDescription>
            「{label}」为写操作，将在远端实际生效。确定继续吗？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onPress={() => void run()}>
            {busy ? (<><Spinner data-icon="inline-start" />执行中</>) : '确认执行'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (blocked) {
    return readonlyTrigger;
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant={variant}
              // R1：禁止原生 disabled（RAC 会输出 disabled 并置 tabIndex=-1，disabledReason Tooltip 永不出现）
              aria-disabled={busy || disabled || undefined}
              className={cn((busy || disabled) && READONLY_BTN_CLASS)}
              onPress={() => {
                if (busy || disabled) return;
                setOpen(true);
              }}
            >
              {busy ? (<Spinner data-icon="inline-start" />) : label}
            </Button>
          }
        />
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
      {confirmDialog}
    </>
  );
}
