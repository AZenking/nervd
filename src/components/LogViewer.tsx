import { useEffect, useRef } from 'react';
import { useApp } from '../store/app';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export function LogViewer() {
  const { logView, closeLogs } = useApp();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logView) {
      // 等待内容渲染后滚到底部（滚动容器为 ScrollArea viewport）
      requestAnimationFrame(() => {
        const vp = bodyRef.current?.closest('[data-slot="scroll-area-viewport"]');
        vp?.scrollTo({ top: vp.scrollHeight });
      });
    }
  }, [logView?.text]);

  return (
    <Dialog open={!!logView} onOpenChange={(open) => { if (!open) closeLogs(); }}>
      <DialogContent showCloseButton={false} className="flex h-[min(600px,80vh)] w-[min(880px,90vw)] max-w-none flex-col gap-0 border border-border bg-popover p-0 shadow-xl">
        <DialogHeader className="px-5 py-4">
          <DialogTitle className="text-left text-sm font-medium text-foreground">
            {logView?.title ?? '日志'}
          </DialogTitle>
          <DialogDescription className="sr-only">流水线运行日志</DialogDescription>
        </DialogHeader>
        <Separator />
        <ScrollArea className="min-h-0 flex-1">
          <div
            ref={bodyRef}
            className="bg-muted/20 px-5 py-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground"
          >
            {logView?.text}
          </div>
        </ScrollArea>
        <Separator />
        <div className="flex justify-end px-5 py-3">
          <Button variant="outline" size="sm" onClick={closeLogs}>关闭</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
