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
      <DialogContent showCloseButton={false} className="flex h-[min(600px,80vh)] w-[min(880px,90vw)] max-w-none flex-col gap-0 rounded-none border border-line-strong p-0">
        <DialogHeader className="border-b border-line px-3 py-2">
          <DialogTitle className="text-left font-mono text-xs font-medium text-ink-1">
            {logView?.title ?? '日志'}
          </DialogTitle>
          <DialogDescription className="sr-only">流水线运行日志</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div
            ref={bodyRef}
            className="px-3 py-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-all text-ink-0"
          >
            {logView?.text}
          </div>
        </ScrollArea>
        <div className="flex justify-end border-t border-line px-3 py-2">
          <Button variant="outline" size="sm" onClick={closeLogs}>关闭</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
