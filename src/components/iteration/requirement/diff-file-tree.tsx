import { useState, useMemo, useEffect } from 'react';
import {
  FolderIcon,
  FolderOpenIcon,
  FileCodeIcon,
  FilePlusIcon,
  FileMinusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  XIcon,
  FoldVerticalIcon,
  UnfoldVerticalIcon,
} from 'lucide-react';
import {
  type DiffTreeNode,
  type FileDiffItem,
  buildDiffTree,
  filterDiffTree,
  getAllDirectoryPaths,
} from './diff-utils';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OverflowTooltip } from '@/components/overflow-tooltip';

export interface DiffFileTreeProps {
  diffs: FileDiffItem[];
  activeFilePath?: string;
  onSelectFile: (filePath: string) => void;
  className?: string;
}

export function DiffFileTree({
  diffs,
  activeFilePath,
  onSelectFile,
  className,
}: DiffFileTreeProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // 1. 构建全量目录树
  const fullTree = useMemo(() => buildDiffTree(diffs), [diffs]);

  // 2. 收集所有目录路径以供展开/折叠
  const allDirPaths = useMemo(() => getAllDirectoryPaths(fullTree), [fullTree]);

  // 3. 展开状态管理（默认全展开）
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set(allDirPaths));

  // 当 diffs 改变时，确保默认全部展开
  useEffect(() => {
    setExpandedDirs(new Set(allDirPaths));
  }, [allDirPaths]);

  // 4. 搜索过滤
  const displayedTree = useMemo(() => {
    if (!searchQuery.trim()) return fullTree;
    return filterDiffTree(fullTree, searchQuery);
  }, [fullTree, searchQuery]);

  // 搜索时自动展开匹配目录
  useEffect(() => {
    if (searchQuery.trim()) {
      const matchingDirPaths = getAllDirectoryPaths(displayedTree);
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        for (const p of matchingDirPaths) {
          next.add(p);
        }
        return next;
      });
    }
  }, [searchQuery, displayedTree]);

  const toggleDirectory = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedDirs(new Set(allDirPaths));
  };

  const collapseAll = () => {
    setExpandedDirs(new Set());
  };

  const totalFiles = diffs.length;

  return (
    <div
      className={cn(
        'flex flex-col h-full select-none bg-background/50 border-r border-border/50',
        className,
      )}
      role="tree"
      aria-label="代码变更文件列表"
    >
      {/* 顶部搜索与操作区 */}
      <div className="p-2.5 border-b border-border/40 flex flex-col gap-2 shrink-0 bg-muted/20">
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('');
              }
            }}
            placeholder="搜索改动文件..."
            className="h-7 text-xs pl-7 pr-6 rounded bg-background/80"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
              title="清空搜索"
            >
              <XIcon className="size-3" />
            </button>
          )}
        </div>

        {/* 工具条：文件计数与展开折叠 */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
          <span className="font-mono tabular-nums">
            {searchQuery ? `${displayedTree.reduce((acc, n) => acc + n.fileCount, 0)} / ` : ''}
            {totalFiles} 个文件
          </span>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 text-muted-foreground hover:text-foreground"
              onClick={expandAll}
              title="展开全部目录"
            >
              <UnfoldVerticalIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 text-muted-foreground hover:text-foreground"
              onClick={collapseAll}
              title="折叠全部目录"
            >
              <FoldVerticalIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* 树节点列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-0.5">
        {displayedTree.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {searchQuery ? '未找到匹配的文件' : '暂无改动文件'}
          </div>
        ) : (
          displayedTree.map((node) => (
            <TreeNodeItem
              key={node.id}
              node={node}
              level={0}
              activeFilePath={activeFilePath}
              expandedDirs={expandedDirs}
              onToggleDir={toggleDirectory}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TreeNodeItemProps {
  node: DiffTreeNode;
  level: number;
  activeFilePath?: string;
  expandedDirs: Set<string>;
  onToggleDir: (dirPath: string) => void;
  onSelectFile: (filePath: string) => void;
}

function TreeNodeItem({
  node,
  level,
  activeFilePath,
  expandedDirs,
  onToggleDir,
  onSelectFile,
}: TreeNodeItemProps) {
  if (node.kind === 'directory') {
    const isExpanded = expandedDirs.has(node.path);

    return (
      <div className="flex flex-col" role="treeitem" aria-expanded={isExpanded}>
        {/* 目录项 */}
        <button
          type="button"
          onClick={() => onToggleDir(node.path)}
          className={cn(
            'flex items-center gap-1.5 w-full text-left py-1 px-1.5 rounded-sm text-xs group cursor-pointer transition-colors',
            'hover:bg-muted/60 text-foreground/80 hover:text-foreground',
          )}
          style={{ paddingLeft: `${Math.max(4, level * 12 + 4)}px` }}
        >
          <span className="text-muted-foreground group-hover:text-foreground shrink-0">
            {isExpanded ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )}
          </span>

          {isExpanded ? (
            <FolderOpenIcon className="size-3.5 text-muted-foreground shrink-0" />
          ) : (
            <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
          )}

          <OverflowTooltip
            text={node.path}
            tooltip={node.path}
            className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium"
          >
            {node.name}
          </OverflowTooltip>

          <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0 px-1 rounded bg-muted/40 tabular-nums">
            {node.fileCount}
          </span>
        </button>

        {/* 子节点 */}
        {isExpanded && node.children && node.children.length > 0 && (
          <div className="flex flex-col border-l border-border/30 ml-2.5 my-0.5">
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.id}
                node={child}
                level={level + 1}
                activeFilePath={activeFilePath}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 文件项
  const file = node.file;
  const isActive = activeFilePath === node.path;

  return (
    <div
      role="treeitem"
      aria-selected={isActive}
      aria-current={isActive ? 'true' : undefined}
      onClick={() => onSelectFile(node.path)}
      className={cn(
        'group flex items-center justify-between gap-1.5 py-1 px-1.5 rounded-sm text-xs cursor-pointer transition-colors border-l-2 border-transparent',
        isActive
          ? 'bg-primary/10 text-primary border-primary font-medium shadow-xs'
          : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground',
      )}
      style={{ paddingLeft: `${Math.max(6, level * 12 + 6)}px` }}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {file?.newFile ? (
          <FilePlusIcon className="size-3.5 text-emerald-500 shrink-0" />
        ) : file?.deletedFile ? (
          <FileMinusIcon className="size-3.5 text-rose-500 shrink-0" />
        ) : file?.renamedFile ? (
          <FileCodeIcon className="size-3.5 text-amber-500 shrink-0" />
        ) : (
          <FileCodeIcon
            className={cn(
              'size-3.5 shrink-0',
              isActive ? 'text-primary' : 'text-primary/70',
            )}
          />
        )}

        <OverflowTooltip
          text={node.path}
          tooltip={node.path}
          className="min-w-0 truncate font-mono text-[11px] leading-tight"
        >
          {node.name}
        </OverflowTooltip>
      </div>

      {/* 变动统计 (+X / -Y) */}
      <div className="flex items-center gap-1 font-mono text-[10px] shrink-0 tabular-nums">
        {node.additions > 0 && (
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
            +{node.additions}
          </span>
        )}
        {node.deletions > 0 && (
          <span className="text-rose-600 dark:text-rose-400 font-semibold">
            -{node.deletions}
          </span>
        )}
      </div>
    </div>
  );
}
