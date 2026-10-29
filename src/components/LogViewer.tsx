import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
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
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';
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
import { buildLogAccordionSections } from '@/lib/log-accordion';
import { updateLogFollowState, type LogScrollMetrics } from '@/lib/log-follow';
import type { CiStageItem } from '@/lib/api';

type FilterMode = 'all' | 'error' | 'warning' | 'stage';

function toTraceStatus(status: string): 'running' | 'error' | 'pending' | 'success' {
  const s = status.toUpperCase();
  if (s === 'SUCCESS') return 'success';
  if (s === 'IN_PROGRESS' || s === 'RUNNING' || s === 'QUEUED') return 'running';
  if (s === 'FAILED' || s === 'FAILURE' || s === 'FAIL') return 'error';
  return 'pending';
}

function StageStatusIcon({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === 'SUCCESS') {
    return <CheckCircle2Icon className="size-3.5 text-sig-ok shrink-0" />;
  }
  if (s === 'IN_PROGRESS' || s === 'RUNNING') {
    return <Loader2Icon className="size-3.5 text-sig-run animate-spin shrink-0" />;
  }
  if (s === 'FAILED' || s === 'FAILURE' || s === 'FAIL') {
    return <XCircleIcon className="size-3.5 text-destructive shrink-0" />;
  }
  if (s === 'ABORTED' || s === 'CANCELED') {
    return <MinusCircleIcon className="size-3.5 text-muted-foreground shrink-0" />;
  }
  if (s.includes('PAUSE')) {
    return <PauseCircleIcon className="size-3.5 text-purple-400 shrink-0" />;
  }
  return <div className="size-2 rounded-full bg-muted-foreground/60 shrink-0" />;
}

function stageStatusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === 'SUCCESS') {
    return 'border-sig-ok/25 bg-sig-ok/10 text-sig-ok hover:bg-sig-ok/20';
  }
  if (s === 'IN_PROGRESS' || s === 'RUNNING') {
    return 'border-sig-run/30 bg-sig-run/10 text-sig-run hover:bg-sig-run/20';
  }
  if (s === 'FAILED' || s === 'FAILURE' || s === 'FAIL') {
    return 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20';
  }
  return 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60';
}

/**
 * CI / Jenkins 构建日志查看器（对齐 Linear 抽屉交互）：
 * - 支持 Jenkins Pipeline 主体步骤（Stage Stepper）与点击直达定位
 * - ANSI 终端色彩还原与构建状态语义高亮（Error/Warning/Command/Stage）
 * - 支持行号指示、首个报错一键跳转、日志级别筛选与自动折行切换
 */
export function LogViewerContent({
  fallbackTitle,
  onBack,
  onClose,
}: {
  fallbackTitle?: string;
  onBack?: () => void;
  onClose?: () => void;
} = {}) {
  const { logView, closeLogs, refreshRepoCiLogs, setToast } = useApp();
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const followTargetKeyRef = useRef<string | null>(null);
  const previousScrollMetricsRef = useRef<LogScrollMetrics | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [wrapLines, setWrapLines] = useState<boolean>(true);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const accordionTargetKeyRef = useRef<string | null>(null);

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

  const logSections = useMemo(
    () => buildLogAccordionSections(lines, effectiveStages),
    [lines, effectiveStages],
  );

  // 根据当前过滤器筛选可见行
  const visibleLines = useMemo(() => {
    if (filterMode === 'all') return lines;
    if (filterMode === 'error') return lines.filter((l) => l.severity === 'error');
    if (filterMode === 'warning') return lines.filter((l) => l.severity === 'warning');
    if (filterMode === 'stage') return lines.filter((l) => l.severity === 'stage' || l.severity === 'command');
    return lines;
  }, [lines, filterMode]);

  const visibleSections = useMemo(() => {
    return logSections
      .map((section) => {
        const sectionLines = filterMode === 'all'
          ? section.lines
          : section.lines.filter((line) => {
            if (filterMode === 'error') return line.severity === 'error';
            if (filterMode === 'warning') return line.severity === 'warning';
            return line.severity === 'stage' || line.severity === 'command';
          });
        return { section, lines: sectionLines };
      })
      .filter(({ lines: sectionLines }) => filterMode === 'all' || sectionLines.length > 0);
  }, [filterMode, logSections]);

  const accordionTargetKey = logView
    ? `${logView.repoId ?? 'pipeline'}:${logView.pipelineId ?? ''}:${logView.runId ?? logView.title}`
    : null;

  useEffect(() => {
    if (followTargetKeyRef.current === accordionTargetKey) return;
    followTargetKeyRef.current = accordionTargetKey;
    followLatestRef.current = true;

    const viewport = contentRef.current?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]');
    if (viewport) {
      previousScrollMetricsRef.current = {
        scrollTop: viewport.scrollTop,
        scrollHeight: viewport.scrollHeight,
        clientHeight: viewport.clientHeight,
      };
    }
  }, [accordionTargetKey]);

  useEffect(() => {
    if (!logView) {
      accordionTargetKeyRef.current = null;
      setOpenSectionId(null);
      return;
    }
    if (!accordionTargetKey || accordionTargetKeyRef.current === accordionTargetKey || logSections.length === 0) return;

    accordionTargetKeyRef.current = accordionTargetKey;
    const running = logSections.find((section) => ['RUNNING', 'IN_PROGRESS', 'QUEUED'].includes(section.status.toUpperCase()));
    const failed = logSections.find((section) => ['FAILED', 'FAILURE', 'FAIL'].includes(section.status.toUpperCase()));
    setOpenSectionId((running ?? failed ?? logSections[0])?.id ?? null);
  }, [accordionTargetKey, logSections, logView]);

  useEffect(() => {
    if (openSectionId && !visibleSections.some(({ section }) => section.id === openSectionId)) {
      setOpenSectionId(visibleSections[0]?.section.id ?? null);
    }
  }, [openSectionId, visibleSections]);

  useEffect(() => {
    const viewport = contentRef.current?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;

    previousScrollMetricsRef.current = {
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
    };

    const handleScroll = () => {
      const previous = previousScrollMetricsRef.current;
      const current: LogScrollMetrics = {
        scrollTop: viewport.scrollTop,
        scrollHeight: viewport.scrollHeight,
        clientHeight: viewport.clientHeight,
      };

      followLatestRef.current = updateLogFollowState(followLatestRef.current, previous, current);
      previousScrollMetricsRef.current = current;
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [accordionTargetKey]);

  // 自动滚动到底部（仅在全量展示且处于实时追加模式时）
  useEffect(() => {
    if (logView && filterMode === 'all' && logView.hasMore && followLatestRef.current) {
      const frame = requestAnimationFrame(() => {
        const vp = bodyRef.current?.closest('[data-slot="scroll-area-viewport"]');
        if (followLatestRef.current) {
          vp?.scrollTo({ top: vp.scrollHeight, behavior: 'auto' });
        }
      });
      return () => cancelAnimationFrame(frame);
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
    const errorSection = logSections.find((section) => section.lines.some((line) => line.lineNumber === stats.firstErrorLine));
    if (errorSection) setOpenSectionId(errorSection.id);
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

  return (
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
        {/* 页头区 */}
        <DrawerHeader className="border-b border-border/70 px-5 py-3 shrink-0">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              {onBack && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="返回运行记录"
                  title="返回运行记录"
                  onClick={onBack}
                >
                  <ArrowLeftIcon className="size-4" />
                </Button>
              )}
              <TerminalIcon className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <DrawerTitle className="text-left text-sm font-semibold text-foreground truncate">
                  {logView?.title ?? fallbackTitle ?? '构建日志'}
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
                onClick={onClose ?? closeLogs}
                title="关闭构建工作台 (Esc)"
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        </DrawerHeader>

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
              className="space-y-3 p-4"
            >
              <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-foreground">
                <GitCommitIcon className="size-3.5 text-primary" aria-hidden="true" />
                <span>流水线步骤追溯 (Trace)</span>
                <span className="font-mono text-[11px] text-muted-foreground">({logSections.length})</span>
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">展开步骤查看阶段日志</span>
              </div>

              <Trace className="gap-2.5">
                {visibleSections.map(({ section, lines: sectionLines }) => {
                  const isOpen = openSectionId === section.id;
                  const traceStatus = toTraceStatus(section.status);

                  return (
                    <TraceCollapsible
                      key={section.id}
                      open={isOpen}
                      onOpenChange={(nextOpen) => setOpenSectionId(nextOpen ? section.id : null)}
                      className={cn(
                        'rounded-lg border border-border/70 transition-colors',
                        isOpen ? 'bg-card/90 shadow-2xs' : 'bg-card/40 hover:bg-card/70',
                      )}
                    >
                      <TraceCollapsibleTrigger>
                        <TraceLine status={traceStatus}>
                          <TraceIcon>
                            <StageStatusIcon status={section.status} />
                          </TraceIcon>
                          <TraceTitle className="text-xs font-semibold">
                            {section.name}
                          </TraceTitle>
                          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                            {section.lines.length} 行
                          </span>
                          {section.errorCount > 0 && (
                            <span className="shrink-0 rounded-sm bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-destructive">
                              {section.errorCount} 错误
                            </span>
                          )}
                          {section.warningCount > 0 && (
                            <span className="hidden shrink-0 rounded-sm bg-sig-run/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sig-run sm:inline-flex">
                              {section.warningCount} 警告
                            </span>
                          )}
                          {section.durationMillis != null && section.durationMillis > 0 && (
                            <TraceDescription
                              className={cn(
                                'hidden rounded border px-1.5 py-0.5 text-[10px] sm:inline-flex ml-auto',
                                stageStatusBadgeClass(section.status),
                              )}
                            >
                              {formatStageDuration(section.durationMillis)}
                            </TraceDescription>
                          )}
                        </TraceLine>
                      </TraceCollapsibleTrigger>

                      <TraceCollapsibleContent>
                        {sectionLines.length === 0 ? (
                          <div className="py-4 text-center font-mono text-xs text-muted-foreground">
                            {filterMode === 'all' ? '（该阶段暂未输出日志）' : '（当前筛选下无匹配日志）'}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'my-1 rounded-md border border-border/60 bg-background/70 py-2 font-mono text-[12px] leading-snug select-text shadow-2xs',
                              wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto',
                            )}
                          >
                            {sectionLines.map((line: ProcessedLogLine) => {
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
                                    isError && 'bg-destructive/10 text-destructive border-l-2 border-destructive pl-2.5 font-medium',
                                    isWarning && 'bg-sig-run/10 text-sig-run border-l-2 border-sig-run pl-2.5',
                                    isStage && 'bg-sky-500/10 text-sky-600 dark:text-sky-300 border-l-2 border-sky-500 pl-2.5 font-medium',
                                    isCommand && 'text-purple-600 dark:text-purple-300 font-medium',
                                  )}
                                >
                                  <span className="w-12 shrink-0 pr-3 text-right select-none font-mono text-[11px] text-muted-foreground/40 tabular-nums">
                                    {line.lineNumber}
                                  </span>
                                  <span className="flex-1 min-w-0">
                                    {line.spans.map((span, sIdx) => (
                                      <span key={sIdx} className={span.className} style={span.style}>
                                        {span.text}
                                      </span>
                                    ))}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </TraceCollapsibleContent>
                    </TraceCollapsible>
                  );
                })}
              </Trace>
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
      </div>
  );
}

/** 兼容旧调用方：日志内容现在由 BuildWorkbenchDrawer 统一承载。 */
export function LogViewer() {
  const { logView, closeLogs } = useApp();
  return (
    <Drawer open={!!logView} onOpenChange={(open) => { if (!open) closeLogs(); }} swipeDirection="right">
      <DrawerContent className="h-[100dvh] w-[100vw] p-0 sm:w-[min(58rem,94vw)] data-[swipe-axis=x]:sm:[--drawer-content-width:min(58rem,94vw)]">
        <LogViewerContent />
      </DrawerContent>
    </Drawer>
  );
}
