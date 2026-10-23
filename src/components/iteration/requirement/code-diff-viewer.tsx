import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileCodeIcon,
  FilePlusIcon,
  FileMinusIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  FoldVerticalIcon,
  UnfoldVerticalIcon,
} from 'lucide-react';
import { type FileDiffItem, getDiffAnchorId } from './diff-utils';
import { DiffFileTree } from './diff-file-tree';
import { CopyButton } from '@/components/ui/copy-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface CodeDiffViewerProps {
  diffs: FileDiffItem[];
  className?: string;
  maxInitialFiles?: number;
  showFileTree?: boolean;
  defaultSidebarOpen?: boolean;
}

export function CodeDiffViewer({
  diffs,
  className,
  maxInitialFiles = 30,
  showFileTree = true,
  defaultSidebarOpen = true,
}: CodeDiffViewerProps) {
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const [activeFilePath, setActiveFilePath] = useState<string | undefined>(() => {
    if (diffs && diffs.length > 0) {
      return diffs[0].newPath || diffs[0].oldPath;
    }
    return undefined;
  });
  const [highlightedPath, setHighlightedPath] = useState<string | undefined>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(defaultSidebarOpen);
  const [visibleLimit, setVisibleLimit] = useState(maxInitialFiles);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserScrollingRef = useRef(false);

  // 清理计时器
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  // 当 diffs 变更时，更新默认选中项
  useEffect(() => {
    if (diffs && diffs.length > 0) {
      const firstPath = diffs[0].newPath || diffs[0].oldPath;
      setActiveFilePath(firstPath);
    }
  }, [diffs]);

  const toggleFile = (path: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  // 折叠或展开所有 Diff
  const expandAllDiffs = () => {
    setCollapsedFiles({});
  };

  const collapseAllDiffs = () => {
    const allCollapsed: Record<string, boolean> = {};
    for (const f of diffs) {
      const p = f.newPath || f.oldPath;
      if (p) allCollapsed[p] = true;
    }
    setCollapsedFiles(allCollapsed);
  };

  // 点击文件树锚点跳转到对应的 diff
  const handleSelectFile = useCallback(
    (filePath: string) => {
      setActiveFilePath(filePath);
      isUserScrollingRef.current = true;

      // 1. 若目标文件已被折叠，自动展开
      setCollapsedFiles((prev) => {
        if (prev[filePath]) {
          const next = { ...prev };
          delete next[filePath];
          return next;
        }
        return prev;
      });

      // 2. 检查是否在当前可视限制内，若超出则自动放开限制
      const fileIndex = diffs.findIndex((f) => (f.newPath || f.oldPath) === filePath);
      if (fileIndex >= 0 && fileIndex >= visibleLimit) {
        setVisibleLimit(Math.max(fileIndex + 10, diffs.length));
      }

      // 3. 执行平滑滚动锚点定位
      requestAnimationFrame(() => {
        const anchorId = getDiffAnchorId(filePath);
        const element = document.getElementById(anchorId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });

          // 高亮闪烁反馈
          setHighlightedPath(filePath);
          if (highlightTimerRef.current) {
            clearTimeout(highlightTimerRef.current);
          }
          highlightTimerRef.current = setTimeout(() => {
            setHighlightedPath(undefined);
            isUserScrollingRef.current = false;
          }, 1500);
        } else {
          isUserScrollingRef.current = false;
        }
      });
    },
    [diffs, visibleLimit],
  );

  if (!diffs || diffs.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
        暂无代码差异变动
      </div>
    );
  }

  const hasFileTree = showFileTree && diffs.length > 1;
  const displayedDiffs = diffs.slice(0, visibleLimit);

  // 单文件或不展示文件树模式（向后兼容轻量视图）
  if (!hasFileTree) {
    return (
      <div className={cn('flex flex-col gap-2.5', className)}>
        {displayedDiffs.map((file) => {
          const filePath = file.newPath || file.oldPath;
          const isCollapsed = Boolean(collapsedFiles[filePath]);

          return (
            <DiffItemCard
              key={filePath}
              file={file}
              filePath={filePath}
              isCollapsed={isCollapsed}
              isHighlighted={highlightedPath === filePath}
              onToggle={() => toggleFile(filePath)}
            />
          );
        })}

        {diffs.length > visibleLimit && (
          <div className="py-2 text-center text-xs text-muted-foreground">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setVisibleLimit((v) => v + 30)}
              className="text-xs"
            >
              加载更多文件 (还有 {diffs.length - visibleLimit} 个)
            </Button>
          </div>
        )}
      </div>
    );
  }

  // 双栏带文件树模式
  return (
    <div
      className={cn(
        'flex h-full min-h-[420px] w-full overflow-hidden rounded-md border border-border/60 bg-card/30',
        className,
      )}
    >
      {/* 左侧文件树侧栏 */}
      {isSidebarOpen && (
        <div className="w-64 sm:w-72 shrink-0 h-full flex flex-col min-w-0">
          <DiffFileTree
            diffs={diffs}
            activeFilePath={activeFilePath}
            onSelectFile={handleSelectFile}
          />
        </div>
      )}

      {/* 右侧 Diff 检视区 */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background/40">
        {/* 工具栏：切换侧栏 + 全部展开/折叠 */}
        <div className="h-9 px-3 border-b border-border/40 bg-muted/20 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={() => setIsSidebarOpen((v) => !v)}
              title={isSidebarOpen ? '收起文件列表' : '展开文件列表'}
            >
              {isSidebarOpen ? (
                <PanelLeftCloseIcon className="size-3.5" />
              ) : (
                <PanelLeftOpenIcon className="size-3.5" />
              )}
            </Button>

            <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[280px]">
              {activeFilePath || `${diffs.length} 个文件变动`}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
              onClick={expandAllDiffs}
              title="展开全部代码差异"
            >
              <UnfoldVerticalIcon className="size-3" />
              <span>展开全部</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
              onClick={collapseAllDiffs}
              title="折叠全部代码差异"
            >
              <FoldVerticalIcon className="size-3" />
              <span>折叠全部</span>
            </Button>
          </div>
        </div>

        {/* 差异卡片滚动列表 */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3"
        >
          {displayedDiffs.map((file) => {
            const filePath = file.newPath || file.oldPath;
            const isCollapsed = Boolean(collapsedFiles[filePath]);

            return (
              <DiffItemCard
                key={filePath}
                file={file}
                filePath={filePath}
                isCollapsed={isCollapsed}
                isHighlighted={highlightedPath === filePath}
                onToggle={() => toggleFile(filePath)}
              />
            );
          })}

          {diffs.length > visibleLimit && (
            <div className="py-2 text-center text-xs text-muted-foreground">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setVisibleLimit((v) => v + 30)}
                className="text-xs"
              >
                加载更多文件 (还有 {diffs.length - visibleLimit} 个)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DiffItemCardProps {
  file: FileDiffItem;
  filePath: string;
  isCollapsed: boolean;
  isHighlighted?: boolean;
  onToggle: () => void;
}

function DiffItemCard({
  file,
  filePath,
  isCollapsed,
  isHighlighted,
  onToggle,
}: DiffItemCardProps) {
  const anchorId = getDiffAnchorId(filePath);

  return (
    <div
      id={anchorId}
      className={cn(
        'flex flex-col overflow-hidden rounded-md border border-border/60 bg-card/60 text-xs shadow-xs scroll-mt-2 transition-all duration-300',
        isHighlighted && 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/[0.04]',
      )}
    >
      {/* 文件头部 */}
      <div
        className={cn(
          'flex items-center justify-between gap-2 border-b border-border/40 bg-muted/40 px-2.5 py-1.5 cursor-pointer select-none hover:bg-muted/60 transition-colors',
          isHighlighted && 'bg-primary/10 hover:bg-primary/15',
        )}
        onClick={onToggle}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            className="p-0.5 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {isCollapsed ? (
              <ChevronRightIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
          </button>

          {file.newFile ? (
            <FilePlusIcon className="size-3.5 text-emerald-500 shrink-0" />
          ) : file.deletedFile ? (
            <FileMinusIcon className="size-3.5 text-rose-500 shrink-0" />
          ) : file.renamedFile ? (
            <FileCodeIcon className="size-3.5 text-amber-500 shrink-0" />
          ) : (
            <FileCodeIcon className="size-3.5 text-primary shrink-0" />
          )}

          <span
            className="truncate font-mono font-medium text-foreground text-[11px]"
            title={filePath}
          >
            {filePath}
          </span>

          {file.renamedFile && file.oldPath !== file.newPath && (
            <span className="text-[10px] text-muted-foreground font-mono truncate">
              (重命名自 {file.oldPath})
            </span>
          )}
        </div>

        {/* 变动统计与操作 */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 font-mono text-[10px]">
            {file.additions > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                +{file.additions}
              </span>
            )}
            {file.deletions > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                -{file.deletions}
              </span>
            )}
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            <CopyButton text={filePath} label="复制路径" />
          </div>
        </div>
      </div>

      {/* 文件 Diff 正文 */}
      {!isCollapsed && (
        <div className="overflow-x-auto font-mono text-[11px] leading-relaxed max-h-[32rem] divide-y divide-border/10 bg-background/60">
          {file.lines.length === 0 ? (
            <div className="p-3 text-center text-muted-foreground text-[10px]">
              {file.newFile
                ? '新建空白文件'
                : file.deletedFile
                  ? '文件已删除'
                  : '二进制文件或无文本改动'}
            </div>
          ) : (
            file.lines.map((line, idx) => {
              if (line.type === 'meta') {
                return null; // 隐藏 --- / +++ 元信息行
              }

              if (line.type === 'hunk') {
                return (
                  <div
                    key={idx}
                    className="bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground font-medium select-none"
                  >
                    {line.text}
                  </div>
                );
              }

              const isAdd = line.type === 'add';
              const isDel = line.type === 'del';

              return (
                <div
                  key={idx}
                  className={cn(
                    'flex items-stretch hover:bg-muted/30 transition-colors',
                    isAdd &&
                      'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-950 dark:text-emerald-100',
                    isDel &&
                      'bg-rose-500/10 dark:bg-rose-500/15 text-rose-950 dark:text-rose-100',
                  )}
                >
                  {/* 旧行号 */}
                  <span className="w-10 shrink-0 select-none px-1.5 py-0.5 text-right font-mono text-[10px] text-muted-foreground/60">
                    {line.oldLineNumber ?? ''}
                  </span>
                  {/* 新行号 */}
                  <span className="w-10 shrink-0 select-none px-1.5 py-0.5 text-right font-mono text-[10px] text-muted-foreground/60 border-r border-border/30">
                    {line.newLineNumber ?? ''}
                  </span>
                  {/* +/- 符号 */}
                  <span
                    className={cn(
                      'w-5 shrink-0 select-none py-0.5 text-center font-bold text-[11px]',
                      isAdd && 'text-emerald-600 dark:text-emerald-400',
                      isDel && 'text-rose-600 dark:text-rose-400',
                      !isAdd && !isDel && 'text-transparent',
                    )}
                  >
                    {isAdd ? '+' : isDel ? '-' : ' '}
                  </span>
                  {/* 代码文本 */}
                  <span className="flex-1 whitespace-pre-wrap break-all py-0.5 pr-2">
                    {line.text || ' '}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
