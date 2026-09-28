import { useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// 写操作按钮：allowWriteOps 门控 + Tooltip 提示 + AlertDialog 二次确认
export function WriteOpButton({
  label,
  onAction,
  title,
}: {
  label: string;
  onAction: () => Promise<void>;
  title?: string;
}) {
  const allow = useApp((s) => s.settings?.allowWriteOps ?? false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const tip = !allow ? '需在设置中开启写操作（写权限令牌）' : (title ?? label);

  const run = async () => {
    setBusy(true);
    try {
      await onAction();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <AlertDialogTrigger
              render={<Button size="sm" disabled={!allow || busy} />}
            />
          }
        >
          {busy ? '···' : label}
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
            {busy ? '执行中…' : '确认执行'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
