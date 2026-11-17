import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  CopyIcon,
  GitCommitIcon,
  TerminalIcon,
  WrapTextIcon,
  XIcon,
} from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { Tabs } from '@/components/ui/tabs';
import { useApp } from '../store/app';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { StatusIcon } from '@/components/status-icon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { SectionHeader } from '@/components/section-header';
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

/** 阶段状态图形：统一走 StatusIcon（状态语义单一来源），不再自绘 lucide 图标 */
function StageStatusIcon({ status }: { status: string }) {
  return <StatusIcon status={status} className="size-3.5 shrink-0" />;
}

function stageStatusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === 'SUCCESS') {
    return 'border-sig-ok/25 bg-sig-ok/10 text-sig-ok';
  }
  if (s === 'IN_PROGRESS' || s === 'RUNNING') {
    return 'border-sig-run/30 bg-sig-run/10 text-sig-run';
  }
  if (s === 'FAILED' || s === 'FAILURE' || s === 'FAIL') {
    return 'border-destructive/30 bg-destructive/10 text-destructive';
  }
  return 'border-border/60 bg-surface-secondary text-muted-foreground';
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
  // 只订阅日志视图与稳定 action，避免其他 slice 的高频 set 触发日志树重渲。
  const logView = useApp((s) => s.logView);
  const closeLogs = useApp((s) => s.closeLogs);
  const refreshRepoCiLogs = useApp((s) => s.refreshRepoCiLogs);
  const setToast = useApp((s) => s.setToast);
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const followTargetKeyRef = useRef<string | null>(null);
  const previousScrollMetricsRef = useRef<LogScrollMetrics | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  // 默认不折行：日志以单行横向滚动呈现（换行后长命令行会被截成多行，破坏列对齐与报错定位）；
  // 用户仍可用头部「自动换行」按钮切回折行模式。
  const [wrapLines, setWrapLines] = useState<boolean>(false);
  // followLatestRef 是滚动判定用的可变引用，UI 状态另存一份用于底部「跟随中/已暂停」反馈
  const [isFollowing, setIsFollowing] = useState(true);
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
    setIsFollowing(true);

    // ScrollArea 的滚动节点就是 ScrollShadow 根节点（data-slot="scroll-area"），
    // 旧选择器 scroll-area-viewport 在当前 HeroUI 版本并不存在，会导致跟随判定永远不触发。
    const viewport = bodyRef.current?.closest<HTMLElement>('[data-slot="scroll-area"]');
    if (viewport) {
      previousScrollMetricsRef.current = {
        scrollTop: viewport.scrollTop,
        scrollHeight: viewport.scrollHeight,
        clientHeight: viewport.clientHeight,
      };
    }
  }, [accordionTargetKey, logView?.loading]);

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
    const viewport = bodyRef.current?.closest<HTMLElement>('[data-slot="scroll-area"]');
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
      setIsFollowing(followLatestRef.current);
      previousScrollMetricsRef.current = current;
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
    // logView.loading 翻转为 false / 筛选切换后正文节点可能重新挂载，需要重新绑定滚动监听
  }, [accordionTargetKey, logView?.loading, filterMode]);

  // 自动滚动到底部（仅在全量展示且处于实时追加模式时）
  useEffect(() => {
    if (logView && filterMode === 'all' && logView.hasMore && followLatestRef.current) {
      const frame = requestAnimationFrame(() => {
        const vp = bodyRef.current?.closest<HTMLElement>('[data-slot="scroll-area"]');
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

  /**
   * 恢复实时跟随：把可变引用与可见状态同时复位，并立刻滚到最新一行。
   * 用户向上翻看历史时跟随会自动暂停，此处是唯一显式的「回到最新」入口。
   */
  const resumeFollow = () => {
    followLatestRef.current = true;
    setIsFollowing(true);
    const vp = bodyRef.current?.closest<HTMLElement>('[data-slot="scroll-area"]');
    vp?.scrollTo({ top: vp.scrollHeight, behavior: 'smooth' });
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
                  onPress={onBack}
                >
                  <ArrowLeftIcon className="size-4" />
                </Button>
              )}
              <TerminalIcon className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <DrawerTitle className="min-w-0 text-left text-sm font-semibold text-foreground">
                  <OverflowTooltip
                    text={logView?.title ?? fallbackTitle ?? '构建日志'}
                    className="block max-w-full truncate"
                  />
                </DrawerTitle>
                <DrawerDescription className="text-xs text-muted-foreground font-mono mt-0.5 text-left flex items-center gap-2">
                  <span>{logView?.repoId ? `仓库 #${logView.repoId} · 构建运行实时日志` : '流水线运行日志'}</span>
                  {stats.totalLines > 0 && (
                    <span className="text-[11px] text-muted-foreground/80">
                      (共 <span className="font-mono tabular-nums">{stats.totalLines}</span> 行
                      {stats.errorCount > 0 ? <> · <span className="font-mono tabular-nums">{stats.errorCount}</span> 处报错</> : ''})
                    </span>
                  )}
                </DrawerDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant={wrapLines ? 'secondary' : 'ghost'}
                size="icon-sm"
                onPress={() => setWrapLines((v) => !v)}
                aria-label={wrapLines ? '关闭自动换行 (单行横向滚动)' : '开启自动换行'}
              >
                <WrapTextIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onPress={copyAll}
                aria-label="复制全部日志"
              >
                <CopyIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onPress={onClose ?? closeLogs}
                aria-label="关闭构建工作台 (Esc)"
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        </DrawerHeader>

        {/* 过滤工具栏与快速跳转 */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-2 text-xs">
          <ScrollArea orientation="horizontal" hideScrollBar size={24} className="flex min-w-0 flex-1 items-center gap-1">
            <Tabs
              selectedKey={filterMode}
              onSelectionChange={(k) => {
                if (k) setFilterMode(k as FilterMode);
              }}
            >
              <Tabs.List aria-label="日志级别筛选" className="flex-nowrap shrink-0 gap-1">
                <Tabs.Tab id="all" className="whitespace-nowrap shrink-0 px-2.5 text-xs">
                  <span className="whitespace-nowrap">全部 (<span className="font-mono tabular-nums">{stats.totalLines}</span>)</span>
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="error" className="whitespace-nowrap shrink-0 px-2.5 text-xs">
                  <span className={cn('whitespace-nowrap', stats.errorCount > 0 && filterMode !== 'error' && 'text-destructive font-medium')}>
                    错误 (<span className="font-mono tabular-nums">{stats.errorCount}</span>)
                  </span>
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="warning" className="whitespace-nowrap shrink-0 px-2.5 text-xs">
                  <span className={cn('whitespace-nowrap', stats.warningCount > 0 && filterMode !== 'warning' && 'text-warning font-medium')}>
                    警告 (<span className="font-mono tabular-nums">{stats.warningCount}</span>)
                  </span>
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="stage" className="whitespace-nowrap shrink-0 px-2.5 text-xs">
                  <span className="whitespace-nowrap">阶段步骤</span>
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs>
          </ScrollArea>

          {stats.firstErrorLine && (
            <Button
              variant="danger-soft"
              size="sm"
              onPress={scrollToFirstError}
              className="gap-1"
              aria-label={`直接滚动至第 ${stats.firstErrorLine} 行报错`}
            >
              <AlertTriangleIcon className="size-3" />
              <span>直达首个报错 (第 <span className="font-mono tabular-nums">{stats.firstErrorLine}</span> 行)</span>
              <ArrowDownIcon className="size-3 ml-0.5" />
            </Button>
          )}
        </div>

        {/* 控制台正文展示 */}
        {/* 控制台正文不再铺 muted 灰底：由抽屉 surface 透出，日志面板用内层 Surface secondary 自成一个面，避免同层级双底叠加 */}
        <ScrollArea className="min-h-0 flex-1">
          {logView?.loading && (!logView.text || logView.text === '加载中…') ? (
            <div className="flex flex-col gap-2.5 p-5" aria-hidden>
              <Skeleton className="h-3.5 w-3/4 rounded" />
              <Skeleton className="h-3.5 w-1/2 rounded" />
              <Skeleton className="h-3.5 w-5/6 rounded" />
              <Skeleton className="h-3.5 w-2/3 rounded" />
              <Skeleton className="h-3.5 w-4/5 rounded" />
              <Skeleton className="h-3.5 w-1/3 rounded" />
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
              {/* 区块标题统一走 SectionHeader（DESIGN 第三部分 B：禁止内联复刻） */}
              <SectionHeader
                level="h3"
                title={(
                  <span className="flex items-center gap-1.5">
                    <GitCommitIcon className="size-3.5 text-primary" aria-hidden="true" />
                    流水线步骤追溯 (Trace)
                  </span>
                )}
                count={`(${logSections.length})`}
                hint="展开步骤查看阶段日志"
              />

              <Accordion
                allowsMultipleExpanded
                className="w-full px-0 gap-2"
                expandedKeys={openSectionId ? [openSectionId] : []}
                onExpandedChange={(keys: any) => {
                  const arr = Array.from(keys ?? []);
                  setOpenSectionId((arr[0] as string) || null);
                }}
              >
                {visibleSections.map(({ section, lines: sectionLines }) => {
                  return (
                    <Accordion.Item
                      key={section.id}
                      id={section.id}
                      className="rounded-lg border border-border/70 bg-card/60 transition-colors data-[expanded=true]:bg-card/90 overflow-hidden"
                    >
                      <Accordion.Heading>
                        <Accordion.Trigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-secondary">
                          <StageStatusIcon status={section.status} />
                          <span className="font-semibold text-foreground truncate">{section.name}</span>
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
                            <span
                              className={cn(
                                'hidden rounded border px-1.5 py-0.5 text-[10px] sm:inline-flex ml-auto',
                                stageStatusBadgeClass(section.status),
                              )}
                            >
                              {formatStageDuration(section.durationMillis)}
                            </span>
                          )}
                          <Accordion.Indicator className="ms-2 shrink-0 text-muted-foreground" />
                        </Accordion.Trigger>
                      </Accordion.Heading>

                      <Accordion.Panel>
                        <Accordion.Body className="p-2 pt-0">
                          {sectionLines.length === 0 ? (
                            <div className="py-4 text-center font-mono text-xs text-muted-foreground">
                              {filterMode === 'all' ? '（该阶段暂未输出日志）' : '（当前筛选下无匹配日志）'}
                            </div>
                          ) : (
                            <Surface
                              variant="secondary"
                              className="my-1 rounded-md border border-border/60 overflow-hidden"
                            >
                              <ScrollArea
                                orientation={wrapLines ? 'vertical' : 'horizontal'}
                                size={24}
                                className={cn(
                                  'py-2 font-mono text-[12px] leading-snug select-text bg-transparent',
                                  wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
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
                                      'flex items-start px-3 py-0.5 transition-colors hover:bg-surface-secondary',
                                      isError && 'bg-destructive/10 text-destructive border-l-2 border-destructive pl-2.5 font-medium',
                                      isWarning && 'bg-sig-run/10 text-sig-run border-l-2 border-sig-run pl-2.5',
                                      isStage && 'bg-primary/10 text-primary border-l-2 border-primary pl-2.5 font-medium',
                                      isCommand && 'text-(--ansi-magenta) font-medium',
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
                              </ScrollArea>
                            </Surface>
                          )}
                        </Accordion.Body>
                      </Accordion.Panel>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            </div>
          )}
        </ScrollArea>

        {/* 底部状态条 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-popover px-5 py-2.5">
          <span className="min-w-0 text-xs text-muted-foreground truncate">
            {logView?.error
              ? `日志读取失败，将自动重试：${humanizeError(logView.error, '日志暂时不可读')}`
              : logView?.repoId && logView.hasMore
                ? isFollowing
                  ? '正在自动跟随 Jenkins 实时日志…'
                  : '已暂停跟随：向上滚动查看历史，点「回到最新」恢复'
                : logView?.repoId
                  ? '构建已结束，日志已更新至最新'
                  : ''}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {/* 仅在「仍在增量追加」的实时日志上暴露跟随开关；已结束的日志显示跟随状态没有意义 */}
            {logView?.hasMore && (
              isFollowing ? (
                <span
                  role="status"
                  className="flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <ArrowDownIcon className="size-3" aria-hidden="true" />
                  跟随中
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={resumeFollow}
                  className="gap-1"
                  aria-label="已暂停跟随，回到最新日志"
                >
                  <ArrowDownIcon className="size-3" aria-hidden="true" />
                  已暂停 · 回到最新
                </Button>
              )
            )}
            {logView?.repoId && (
              <Button
                variant="outline"
                size="sm"
                isDisabled={logView.loading}
                onPress={() => void refreshRepoCiLogs()}
              >
                {logView.loading ? '刷新中…' : '刷新日志'}
              </Button>
            )}
          </div>
        </div>
      </div>
  );
}
