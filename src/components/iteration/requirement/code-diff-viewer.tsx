import { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileCodeIcon,
  FilePlusIcon,
  FileMinusIcon,
} from 'lucide-react';
import type { FileDiffItem } from './diff-utils';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';

export interface CodeDiffViewerProps {
  diffs: FileDiffItem[];
  className?: string;
  maxInitialFiles?: number;
}

export function CodeDiffViewer({ diffs, className, maxInitialFiles = 10 }: CodeDiffViewerProps) {
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const toggleFile = (path: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  if (!diffs || diffs.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
        暂无代码差异变动
      </div>
    );
  }

  const displayedDiffs = diffs.slice(0, maxInitialFiles);

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {displayedDiffs.map((file) => {
        const filePath = file.newPath || file.oldPath;
        const isCollapsed = Boolean(collapsedFiles[filePath]);

        return (
          <div
            key={filePath}
            className="flex flex-col overflow-hidden rounded-md border border-border/60 bg-card/60 text-xs shadow-xs"
          >
            {/* 文件头部 */}
            <div
              className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/40 px-2.5 py-1.5 cursor-pointer select-none hover:bg-muted/60 transition-colors"
              onClick={() => toggleFile(filePath)}
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
                ) : (
                  <FileCodeIcon className="size-3.5 text-primary shrink-0" />
                )}

                <span className="truncate font-mono font-medium text-foreground text-[11px]" title={filePath}>
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
              <div className="overflow-x-auto font-mono text-[11px] leading-relaxed max-h-96 divide-y divide-border/10 bg-background/60">
                {file.lines.length === 0 ? (
                  <div className="p-2 text-center text-muted-foreground text-[10px]">
                    {file.newFile ? '新建空白文件' : file.deletedFile ? '文件已删除' : '二进制文件或无文本改动'}
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
                          isAdd && 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-950 dark:text-emerald-100',
                          isDel && 'bg-rose-500/10 dark:bg-rose-500/15 text-rose-950 dark:text-rose-100',
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
      })}

      {diffs.length > maxInitialFiles && (
        <div className="py-1 text-center text-xs text-muted-foreground">
          …还有 {diffs.length - maxInitialFiles} 个文件改动
        </div>
      )}
    </div>
  );
}
