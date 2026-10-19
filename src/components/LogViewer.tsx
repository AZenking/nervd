import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  CheckCircle2Icon,
  CopyIcon,
  GitCommitIcon,
  Loader2Icon,
  MinusCircleIcon,
  PauseCircleIcon,
  TerminalIcon,
  WrapTextIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';
import {
  formatStageDuration,
  processLogLines,
  type ProcessedLogLine,
} from '@/lib/log-highlighter';
import type { CiStageItem } from '@/lib/api';

type FilterMode = 'all' | 'error' | 'warning' | 'stage';

function StageStatusIcon({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === 'SUCCESS') {
    return <CheckCircle2Icon className="size-3.5 text-emerald-500 shrink-0" />;
  }
  if (s === 'IN_PROGRESS' || s === 'RUNNING') {
    return <Loader2Icon className="size-3.5 text-amber-500 animate-spin shrink-0" />;
  }
  if (s === 'FAILED' || s === 'FAILURE' || s === 'FAIL') {
    return <XCircleIcon className="size-3.5 text-red-500 shrink-0" />;
  }
  if (s === 'ABORTED' || s === 'CANCELED') {
    return <MinusCircleIcon className="size-3.5 text-zinc-400 shrink-0" />;
  }
  if (s.includes('PAUSE')) {
    return <PauseCircleIcon className="size-3.5 text-purple-400 shrink-0" />;
  }
  return <div className="size-2 rounded-full bg-zinc-400 shrink-0" />;
}

function stageStatusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === 'SUCCESS') {
    return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20';
  }
  if (s === 'IN_PROGRESS' || s === 'RUNNING') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20';
  }
  if (s === 'FAILED' || s === 'FAILURE' || s === 'FAIL') {
    return 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20';
  }
  return 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60';
}

/**
 * CI / Jenkins 构建日志查看器（对齐 Linear 抽屉交互）：
 * - 支持 Jenkins Pipeline 主体步骤（Stage Stepper）与点击直达定位
 * - ANSI 终端色彩还原与构建状态语义高亮（Error/Warning/Command/Stage）
 * - 支持行号指示、首个报错一键跳转、日志级别筛选与自动折行切换
 */
export function LogViewer() {
  const { logView, closeLogs, refreshRepoCiLogs, setToast } = useApp();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [wrapLines, setWrapLines] = useState<boolean>(true);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // 解析日志行与 ANSI 样式
  const { lines, stats, fallbackStages } = useMemo(() => {
    return processLogLines(logView?.text || '');
  }, [logView?.text]);

  // 融合 Jenkins wfapi 步骤或控制台解析步骤
  const effectiveStages: CiStageItem[] = useMemo(() => {
    if (logView?.stages && logView.stages.length > 0) {
      return logView.stages;
    }
    return fallbackStages;
  }, [logView?.stages, fallbackStages]);

  // 根据当前过滤器筛选可见行
  const visibleLines = useMemo(() => {
    if (filterMode === 'all') return lines;
    if (filterMode === 'error') return lines.filter((l) => l.severity === 'error');
    if (filterMode === 'warning') return lines.filter((l) => l.severity === 'warning');
    if (filterMode === 'stage') return lines.filter((l) => l.severity === 'stage' || l.severity === 'command');
    return lines;
  }, [lines, filterMode]);

  // 自动滚动到底部（仅在全量展示且处于实时追加模式时）
  useEffect(() => {
    if (logView && filterMode === 'all' && logView.hasMore) {
      requestAnimationFrame(() => {
        const vp = bodyRef.current?.closest('[data-slot="scroll-area-viewport"]');
        vp?.scrollTo({ top: vp.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [lines.length, logView?.hasMore, filterMode, logView]);

  // 定时刷新增量日志
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

  /** 平滑滚动至首个报错行 */
  const scrollToFirstError = () => {
    if (!stats.firstErrorLine) return;
    // 如果处于筛选模式且隐藏了该行，自动切回全量
    if (filterMode !== 'all' && filterMode !== 'error') {
      setFilterMode('all');
    }
    setTimeout(() => {
      const el = lineRefs.current.get(stats.firstErrorLine!);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  /** 点击主体步骤胶囊直达日志位置 */
  const scrollToStage = (stageName: string) => {
    // 优先切回全量模式以免行被过滤
    if (filterMode !== 'all' && filterMode !== 'stage') {
      setFilterMode('all');
    }
    setTimeout(() => {
      // 匹配包含该 stageName 的 stage 标记行
      const target = lines.find(
        (l) => l.severity === 'stage' && (l.stageName === stageName || l.cleanText.toLowerCase().includes(stageName.toLowerCase())),
      );
      if (target) {
        const el = lineRefs.current.get(target.lineNumber);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
      setToast({ text: `已定位步骤：${stageName}`, kind: 'info' });
    }, 50);
  };

  return (
    <Drawer open={!!logView} onOpenChange={(open) => { if (!open) closeLogs(); }} swipeDirection="right">
      <DrawerContent className="w-[100vw] sm:w-[min(58rem,94vw)] data-[swipe-axis=x]:sm:[--drawer-content-width:min(58rem,94vw)] p-0 flex flex-col h-[100dvh]">
        {/* 页头区 */}
        <DrawerHeader className="border-b border-border/70 px-5 py-3 shrink-0">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <TerminalIcon className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <DrawerTitle className="text-left text-sm font-semibold text-foreground truncate">
                  {logView?.title ?? '构建日志'}
                </DrawerTitle>
                <DrawerDescription className="text-xs text-muted-foreground font-mono mt-0.5 text-left flex items-center gap-2">
                  <span>{logView?.repoId ? `仓库 #${logView.repoId} · 构建运行实时日志` : '流水线运行日志'}</span>
                  {stats.totalLines > 0 && (
                    <span className="text-[11px] text-muted-foreground/80">
                      (共 {stats.totalLines} 行{stats.errorCount > 0 ? ` · ${stats.errorCount} 处报错` : ''})
                    </span>
                  )}
                </DrawerDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant={wrapLines ? 'secondary' : 'ghost'}
                size="icon-xs"
                onClick={() => setWrapLines((v) => !v)}
                title={wrapLines ? '关闭自动换行 (单行横向滚动)' : '开启自动换行'}
              >
                <WrapTextIcon className="size-3.5" />
              </Button>
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

        {/* Jenkins 构建主体步骤（Stage Stepper） */}
        {effectiveStages.length > 0 && (
          <div className="shrink-0 border-b border-border/70 bg-muted/20 px-5 py-2.5">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <div className="flex shrink-0 items-center gap-1.5 pr-1.5 text-xs font-semibold text-foreground">
                <GitCommitIcon className="size-3.5 text-primary" />
                <span>主体步骤</span>
                <span className="font-mono text-[11px] text-muted-foreground">({effectiveStages.length})</span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                {effectiveStages.map((stage, idx) => (
                  <button
                    key={stage.id || `${stage.name}-${idx}`}
                    type="button"
                    onClick={() => scrollToStage(stage.name)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors cursor-pointer select-none',
                      stageStatusBadgeClass(stage.status),
                    )}
                    title={`点击定位步骤: ${stage.name}${stage.status ? ` (${stage.status})` : ''}`}
                  >
                    <StageStatusIcon status={stage.status} />
                    <span className="font-medium max-w-[150px] truncate">{stage.name}</span>
                    {stage.durationMillis != null && stage.durationMillis > 0 && (
                      <span className="font-mono text-[10px] opacity-75">
                        {formatStageDuration(stage.durationMillis)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 过滤工具栏与快速跳转 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-muted/10 px-5 py-2 text-xs">
          <div className="flex items-center gap-1">
            <Button
              variant={filterMode === 'all' ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setFilterMode('all')}
              className="h-6.5 text-[11px] px-2"
            >
              全部 ({stats.totalLines})
            </Button>
            <Button
              variant={filterMode === 'error' ? 'destructive' : 'ghost'}
              size="xs"
              onClick={() => setFilterMode('error')}
              className={cn(
                'h-6.5 text-[11px] px-2',
                stats.errorCount > 0 && filterMode !== 'error' && 'text-red-500 hover:bg-red-500/10',
              )}
            >
              错误 ({stats.errorCount})
            </Button>
            <Button
              variant={filterMode === 'warning' ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setFilterMode('warning')}
              className={cn(
                'h-6.5 text-[11px] px-2',
                stats.warningCount > 0 && filterMode !== 'warning' && 'text-amber-500 hover:bg-amber-500/10',
              )}
            >
              警告 ({stats.warningCount})
            </Button>
            <Button
              variant={filterMode === 'stage' ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setFilterMode('stage')}
              className="h-6.5 text-[11px] px-2"
            >
              步骤与命令
            </Button>
          </div>

          {stats.firstErrorLine && (
            <Button
              variant="outline"
              size="xs"
              onClick={scrollToFirstError}
              className="h-6.5 gap-1 border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] hover:bg-red-500/20 cursor-pointer"
              title={`直接滚动至第 ${stats.firstErrorLine} 行报错`}
            >
              <AlertTriangleIcon className="size-3" />
              <span>直达首个报错 (第 {stats.firstErrorLine} 行)</span>
              <ArrowDownIcon className="size-3 ml-0.5" />
            </Button>
          )}
        </div>

        {/* 控制台正文展示 */}
        <ScrollArea className="min-h-0 flex-1 bg-muted/5">
          {logView?.loading && (!logView.text || logView.text === '加载中…') ? (
            <div className="flex flex-col gap-2.5 p-5" aria-hidden>
              <Skeleton className="h-3.5 w-3/4 rounded bg-muted/40" />
              <Skeleton className="h-3.5 w-1/2 rounded bg-muted/40" />
              <Skeleton className="h-3.5 w-5/6 rounded bg-muted/40" />
              <Skeleton className="h-3.5 w-2/3 rounded bg-muted/40" />
              <Skeleton className="h-3.5 w-4/5 rounded bg-muted/40" />
              <Skeleton className="h-3.5 w-1/3 rounded bg-muted/40" />
            </div>
          ) : visibleLines.length === 0 ? (
            <div className="p-10 text-center font-mono text-xs text-muted-foreground">
              {filterMode === 'all'
                ? '（暂无日志内容）'
                : `（当前筛选模式【${filterMode === 'error' ? '仅看错误' : filterMode === 'warning' ? '仅看警告' : '步骤与命令'}】下无匹配日志）`}
            </div>
          ) : (
            <div
              ref={bodyRef}
              className={cn(
                'py-3 font-mono text-[12px] leading-snug select-text',
                wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto',
              )}
            >
              {visibleLines.map((line: ProcessedLogLine) => {
                const isError = line.severity === 'error';
                const isWarning = line.severity === 'warning';
                const isStage = line.severity === 'stage';
                const isCommand = line.severity === 'command';

                return (
                  <div
                    key={line.lineNumber}
                    ref={(el) => {
                      if (el) lineRefs.current.set(line.lineNumber, el);
                      else lineRefs.current.delete(line.lineNumber);
                    }}
                    className={cn(
                      'flex items-start px-3 py-0.5 transition-colors hover:bg-muted/40',
                      isError && 'bg-red-500/10 text-red-600 dark:text-red-300 border-l-2 border-red-500 pl-2.5 font-medium',
                      isWarning && 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-l-2 border-amber-500 pl-2.5',
                      isStage && 'bg-sky-500/10 text-sky-600 dark:text-sky-300 border-l-2 border-sky-500 pl-2.5 font-medium',
                      isCommand && 'text-purple-600 dark:text-purple-300 font-medium',
                    )}
                  >
                    {/* 行号列 */}
                    <span className="w-12 shrink-0 pr-3 text-right select-none font-mono text-[11px] text-muted-foreground/40 tabular-nums">
                      {line.lineNumber}
                    </span>

                    {/* 日志内容（ANSI 彩色 Span） */}
                    <span className="flex-1 min-w-0">
                      {line.spans.map((span, sIdx) => (
                        <span
                          key={sIdx}
                          className={span.className}
                          style={span.style}
                        >
                          {span.text}
                        </span>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* 底部状态条 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-popover px-5 py-2.5">
          <span className="min-w-0 text-xs text-muted-foreground truncate">
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
