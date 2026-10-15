import { useEffect, useRef } from 'react';
import { CopyIcon, TerminalIcon, XIcon } from 'lucide-react';
import { useApp } from '../store/app';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { humanizeError } from '@/lib/error-format';

/**
 * CI / Jenkins 构建日志查看器（对齐 Linear 抽屉交互）：
 * 采用右侧全高大抽屉，随日志生成实时自动向下滚动，不遮挡背景中的仓库配置与构建触发器。
 */
export function LogViewer() {
  const { logView, closeLogs, refreshRepoCiLogs, setToast } = useApp();
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

  const copyAll = () => {
    if (!logView?.text) return;
    void navigator.clipboard.writeText(logView.text);
    setToast({ text: '已复制全部日志到剪贴板', kind: 'ok' });
  };

  return (
    <Drawer open={!!logView} onOpenChange={(open) => { if (!open) closeLogs(); }} swipeDirection="right">
      <DrawerContent className="w-[100vw] sm:w-[min(54rem,92vw)] data-[swipe-axis=x]:sm:[--drawer-content-width:min(54rem,92vw)] p-0">
        <DrawerHeader className="border-b border-border/70 px-5 py-3">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <TerminalIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <DrawerTitle className="text-left text-sm font-semibold text-foreground truncate">
                  {logView?.title ?? '日志'}
                </DrawerTitle>
                <DrawerDescription className="text-xs text-muted-foreground font-mono mt-0.5 text-left">
                  {logView?.repoId ? `仓库 #${logView.repoId} · 构建运行实时日志` : '流水线运行日志'}
                </DrawerDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={copyAll}
                title="复制全部日志"
              >
                <CopyIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={closeLogs}
                title="关闭抽屉 (Esc)"
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        </DrawerHeader>

        <ScrollArea className="min-h-0 flex-1 bg-muted/10">
          {logView?.loading && (!logView.text || logView.text === '加载中…') ? (
            <div className="flex flex-col gap-2.5 p-5" aria-hidden>
              <Skeleton className="h-3.5 w-3/4 rounded bg-muted/40" />
              <Skeleton className="h-3.5 w-1/2 rounded bg-muted/40" />
              <Skeleton className="h-3.5 w-5/6 rounded bg-muted/40" />
              <Skeleton className="h-3.5 w-2/3 rounded bg-muted/40" />
              <Skeleton className="h-3.5 w-4/5 rounded bg-muted/40" />
              <Skeleton className="h-3.5 w-1/3 rounded bg-muted/40" />
            </div>
          ) : (
            <div
              ref={bodyRef}
              className="p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground/90 selection:bg-primary/20"
            >
              {logView?.text || '（暂无日志内容）'}
            </div>
          )}
        </ScrollArea>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-popover px-5 py-3">
          <span className="min-w-0 text-xs text-muted-foreground">
            {logView?.error
              ? `日志读取失败，将自动重试：${humanizeError(logView.error, '日志暂时不可读')}`
              : logView?.repoId && logView.hasMore
                ? '正在自动跟随 Jenkins 实时日志…'
                : logView?.repoId
                  ? '构建已结束，日志已更新至最新'
                  : ''}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {logView?.repoId && (
              <Button
                variant="outline"
                size="xs"
                disabled={logView.loading}
                onClick={() => void refreshRepoCiLogs()}
              >
                {logView.loading ? '刷新中…' : '刷新日志'}
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
