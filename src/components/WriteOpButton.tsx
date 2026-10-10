// 写操作按钮：allowWriteOps 门控 + Tooltip 提示 + 确认。
// confirm="dialog"（默认）：AlertDialog 二次确认，用于工具栏等上下文充足的入口。
// confirm="inline"（UX 评审 A5）：两段式确认——第一次点击进入待确认态（4s 超时回退），
// 第二次点击执行；用于已经打开的 Dialog/向导内部，避免"弹窗套弹窗"。
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useApp } from '../store/app';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const INLINE_CONFIRM_TIMEOUT_MS = 4000;

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
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (armTimer.current != null) window.clearTimeout(armTimer.current);
  }, []);

  const tip = !allow
    ? '需在「设置 → 安全」中开启写操作（需写权限令牌）'
    : disabled
      ? disabledReason ?? title ?? label
      : title ?? label;

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

  // ---- 内联两段式（向导内使用） ----
  if (confirm === 'inline') {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant={armed ? 'destructive' : variant}
              disabled={!allow || busy || disabled}
              onClick={handleInlineClick}
            />
          }
        >
          {busy ? (<><Spinner data-icon="inline-start" />{label}…</>) : armed ? confirmLabel : label}
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    );
  }

  // ---- AlertDialog 二次确认（默认） ----
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) disarm(); setOpen(next); }}>
      <Tooltip>
        <TooltipTrigger
          render={
            <AlertDialogTrigger
              render={<Button size="sm" variant={variant} disabled={!allow || busy || disabled} />}
            />
          }
        >
          {busy ? (<Spinner data-icon="inline-start" />) : label}
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认{title ?? label}</AlertDialogTitle>
          <AlertDialogDescription>
            「{label}」为写操作，将在远端实际生效。确定继续吗？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void run()}>
            {busy ? (<><Spinner data-icon="inline-start" />执行中</>) : '确认执行'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
