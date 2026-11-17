import {
  useState, useMemo, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OverflowTooltip } from '@/components/overflow-tooltip';

export interface DiffFileTreeProps {
  diffs: FileDiffItem[];
  activeFilePath?: string;
  onSelectFile: (filePath: string) => void;
  className?: string;
}

interface VisibleTreeRow {
  node: DiffTreeNode;
  level: number;
}

/** 按当前展开态把树压平成「可见行」序列，供 roving tabindex / 方向键导航定位。 */
function flattenVisibleRows(
  nodes: DiffTreeNode[],
  expandedDirs: Set<string>,
  level = 0,
  out: VisibleTreeRow[] = [],
): VisibleTreeRow[] {
  for (const node of nodes) {
    out.push({ node, level });
    if (node.kind === 'directory' && expandedDirs.has(node.path) && node.children?.length) {
      flattenVisibleRows(node.children, expandedDirs, level + 1, out);
    }
  }
  return out;
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

  // ---- 键盘树模型（WAI-ARIA tree）：roving tabindex + 方向键移动 ----
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const visibleRows = useMemo(
    () => flattenVisibleRows(displayedTree, expandedDirs),
    [displayedTree, expandedDirs],
  );

  // 焦点行：优先保留用户当前聚焦项；失效时回退到活动文件，再回退首行
  const effectiveFocusId = useMemo(() => {
    if (focusedNodeId && visibleRows.some((row) => row.node.id === focusedNodeId)) {
      return focusedNodeId;
    }
    const activeRow = visibleRows.find(
      (row) => row.node.kind === 'file' && row.node.path === activeFilePath,
    );
    return activeRow?.node.id ?? visibleRows[0]?.node.id ?? null;
  }, [focusedNodeId, visibleRows, activeFilePath]);

  const focusNode = (nodeId: string) => {
    setFocusedNodeId(nodeId);
    requestAnimationFrame(() => {
      const target = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>('[data-tree-node-id]') ?? [],
      ).find((element) => element.dataset.treeNodeId === nodeId);
      target?.focus();
    });
  };

  const handleRowKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
    node: DiffTreeNode,
    level: number,
  ) => {
    const index = visibleRows.findIndex((row) => row.node.id === node.id);
    if (index < 0) return;
    const moveTo = (nextIndex: number) => {
      const next = visibleRows[nextIndex];
      if (next) focusNode(next.node.id);
    };

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveTo(Math.min(index + 1, visibleRows.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveTo(Math.max(index - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        moveTo(0);
        break;
      case 'End':
        event.preventDefault();
        moveTo(visibleRows.length - 1);
        break;
      case 'ArrowRight': {
        if (node.kind !== 'directory') return;
        event.preventDefault();
        if (!expandedDirs.has(node.path)) {
          toggleDirectory(node.path);
          return;
        }
        const firstChild = visibleRows[index + 1];
        if (firstChild && firstChild.level === level + 1) {
          focusNode(firstChild.node.id);
        }
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (node.kind === 'directory' && expandedDirs.has(node.path)) {
          toggleDirectory(node.path);
          return;
        }
        // 折叠态目录 / 文件：回到最近的父级行
        for (let i = index - 1; i >= 0; i -= 1) {
          if (visibleRows[i].level < level) {
            focusNode(visibleRows[i].node.id);
            break;
          }
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col h-full select-none bg-background/50 border-r border-border/50',
        className,
      )}
    >
      {/* 顶部搜索与操作区 */}
      <div className="p-2.5 border-b border-border/40 flex flex-col gap-2 shrink-0">
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setSearchQuery('');
              } else if (e.key !== 'Tab') {
                e.stopPropagation();
              }
            }}
            onKeyUp={(e) => {
              if (e.key !== 'Escape' && e.key !== 'Tab') {
                e.stopPropagation();
              }
            }}
            placeholder="搜索改动文件..."
            className="bg-background/80 pl-7 pr-6"
          />
          {searchQuery && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onPress={() => setSearchQuery('')}
                    className="absolute right-1 text-muted-foreground hover:text-foreground"
                    aria-label="清空搜索"
                  >
                    <XIcon className="size-3" />
                  </Button>
                }
              />
              <TooltipContent>清空搜索</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* 工具条：文件计数与展开折叠 */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
          <span className="font-mono tabular-nums">
            {searchQuery ? `${displayedTree.reduce((acc, n) => acc + n.fileCount, 0)} / ` : ''}
            {totalFiles} 个文件
          </span>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-foreground"
                    onPress={expandAll}
                    aria-label="展开全部目录"
                  >
                    <UnfoldVerticalIcon className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent>展开全部目录</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-foreground"
                    onPress={collapseAll}
                    aria-label="折叠全部目录"
                  >
                    <FoldVerticalIcon className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent>折叠全部目录</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* 树节点列表 */}
      <ScrollArea
        role="tree"
        aria-label="代码变更文件列表"
        className="flex-1 min-h-0 p-1.5 space-y-0.5"
      >
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
              focusedNodeId={effectiveFocusId}
              onFocusNode={setFocusedNodeId}
              onRowKeyDown={handleRowKeyDown}
            />
          ))
        )}
      </ScrollArea>
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
  focusedNodeId: string | null;
  onFocusNode: (nodeId: string) => void;
  onRowKeyDown: (
    event: ReactKeyboardEvent<HTMLElement>,
    node: DiffTreeNode,
    level: number,
  ) => void;
}

function TreeNodeItem({
  node,
  level,
  activeFilePath,
  expandedDirs,
  onToggleDir,
  onSelectFile,
  focusedNodeId,
  onFocusNode,
  onRowKeyDown,
}: TreeNodeItemProps) {
  const isFocusedRow = focusedNodeId === node.id;
  const rowProps = {
    role: 'treeitem' as const,
    'aria-level': level + 1,
    tabIndex: isFocusedRow ? 0 : -1,
    'data-tree-node-id': node.id,
    onFocus: () => onFocusNode(node.id),
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => onRowKeyDown(event, node, level),
  };
  if (node.kind === 'directory') {
    const isExpanded = expandedDirs.has(node.path);

    return (
      <div className="flex flex-col">
        {/* 目录项（treeitem 落在可聚焦 button 上，容器仅作分组） */}
        <button
          type="button"
          {...rowProps}
          aria-expanded={isExpanded}
          onClick={() => onToggleDir(node.path)}
          className={cn(
            'flex items-center gap-1.5 w-full text-left py-1 px-1.5 rounded-sm text-xs group cursor-pointer transition-colors',
            'hover:bg-surface-secondary text-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

          <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0 px-1 rounded-sm bg-surface-secondary tabular-nums">
            {node.fileCount}
          </span>
        </button>

        {/* 子节点 */}
        {isExpanded && node.children && node.children.length > 0 && (
          <div role="group" className="flex flex-col border-l border-border/30 ml-2.5 my-0.5">
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.id}
                node={child}
                level={level + 1}
                activeFilePath={activeFilePath}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                focusedNodeId={focusedNodeId}
                onFocusNode={onFocusNode}
                onRowKeyDown={onRowKeyDown}
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
    <button
      type="button"
      {...rowProps}
      aria-selected={isActive}
      aria-current={isActive ? 'true' : undefined}
      onClick={() => onSelectFile(node.path)}
      className={cn(
        'group flex w-full items-center justify-between gap-1.5 py-1 px-1.5 rounded-sm text-left text-xs cursor-pointer transition-colors border-l-2 border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'bg-primary/10 text-primary border-primary font-medium'
          : 'hover:bg-surface-secondary text-muted-foreground hover:text-foreground',
      )}
      style={{ paddingLeft: `${Math.max(6, level * 12 + 6)}px` }}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {file?.newFile ? (
          <FilePlusIcon className="size-3.5 text-success shrink-0" />
        ) : file?.deletedFile ? (
          <FileMinusIcon className="size-3.5 text-danger shrink-0" />
        ) : file?.renamedFile ? (
          <FileCodeIcon className="size-3.5 text-warning shrink-0" />
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
          <span className="text-success font-semibold">
            +{node.additions}
          </span>
        )}
        {node.deletions > 0 && (
          <span className="text-danger font-semibold">
            -{node.deletions}
          </span>
        )}
      </div>
    </button>
  );
}
