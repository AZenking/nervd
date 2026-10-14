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
import { humanizeError } from '@/lib/error-format';

export function LogViewer() {
  const { logView, closeLogs, refreshRepoCiLogs } = useApp();
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

  useEffect(() => {
    if (!logView?.repoId || !logView.runId || !logView.hasMore || logView.loading) return;
    const timer = window.setTimeout(
      () => void refreshRepoCiLogs(),
      logView.error ? 3000 : 1000,
    );
    return () => window.clearTimeout(timer);
  }, [logView?.repoId, logView?.runId, logView?.nextOffset, logView?.hasMore, logView?.loading, logView?.error, refreshRepoCiLogs]);

  return (
    <Dialog open={!!logView} onOpenChange={(open) => { if (!open) closeLogs(); }}>
          <DialogContent showCloseButton className="flex h-[min(600px,80vh)] w-[min(880px,90vw)] max-w-none flex-col gap-0 rounded-xl border border-border bg-popover p-0 shadow-level-2">
        <DialogHeader className="px-5 py-4 pr-12">
          <DialogTitle className="text-left text-sm font-medium text-foreground">
            {logView?.title ?? '日志'}
          </DialogTitle>
          <DialogDescription className="sr-only">流水线运行日志</DialogDescription>
        </DialogHeader>
        <Separator />
        <ScrollArea className="min-h-0 flex-1">
          <div
            ref={bodyRef}
            className="bg-muted/20 px-5 py-4 font-log text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground"
          >
            {logView?.text}
          </div>
        </ScrollArea>
        <Separator />
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <span className="min-w-0 text-xs text-muted-foreground">
            {logView?.error
              ? `日志读取失败，将自动重试：${humanizeError(logView.error, '日志暂时不可读')}`
              : logView?.repoId && logView.hasMore
                ? '正在自动跟随 Jenkins 实时日志'
                : logView?.repoId
                  ? '构建已结束，日志已更新至最新'
                  : ''}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {logView?.repoId && (
              <Button
                variant="outline"
                size="sm"
                disabled={logView.loading}
                onClick={() => void refreshRepoCiLogs()}
              >
                {logView.loading ? '刷新中…' : '刷新日志'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
