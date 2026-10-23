/**
 * Git 统一差异 (Unified Diff) 解析工具
 */

export interface ParsedDiffLine {
  type: 'add' | 'del' | 'hunk' | 'meta' | 'normal';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface FileDiffItem {
  oldPath: string;
  newPath: string;
  newFile: boolean;
  deletedFile: boolean;
  renamedFile: boolean;
  diff: string;
  additions: number;
  deletions: number;
  lines: ParsedDiffLine[];
}

/**
 * 解析单段 Unified Diff 文本为结构化行
 */
export function parseDiffLines(diffText: string): { lines: ParsedDiffLine[]; additions: number; deletions: number } {
  if (!diffText) return { lines: [], additions: 0, deletions: 0 };

  const rawLines = diffText.split('\n');
  const lines: ParsedDiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  let currentOldLine = 0;
  let currentNewLine = 0;

  for (const raw of rawLines) {
    if (raw.startsWith('---') || raw.startsWith('+++')) {
      lines.push({ type: 'meta', text: raw });
      continue;
    }

    if (raw.startsWith('@@')) {
      // 解析 @@ -oldStart,oldCount +newStart,newCount @@
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (match) {
        currentOldLine = parseInt(match[1], 10);
        currentNewLine = parseInt(match[2], 10);
      }
      lines.push({ type: 'hunk', text: raw });
      continue;
    }

    if (raw.startsWith('+')) {
      additions += 1;
      lines.push({
        type: 'add',
        text: raw.slice(1),
        newLineNumber: currentNewLine,
      });
      currentNewLine += 1;
      continue;
    }

    if (raw.startsWith('-')) {
      deletions += 1;
      lines.push({
        type: 'del',
        text: raw.slice(1),
        oldLineNumber: currentOldLine,
      });
      currentOldLine += 1;
      continue;
    }

    // 正常上下文行（以空格开头或无前缀）
    lines.push({
      type: 'normal',
      text: raw.startsWith(' ') ? raw.slice(1) : raw,
      oldLineNumber: currentOldLine > 0 ? currentOldLine : undefined,
      newLineNumber: currentNewLine > 0 ? currentNewLine : undefined,
    });
    if (currentOldLine > 0) currentOldLine += 1;
    if (currentNewLine > 0) currentNewLine += 1;
  }

  return { lines, additions, deletions };
}

/**
 * 将云效 compare 返回的多层包裹 diff 列表提取为标准 FileDiffItem
 */
export function parseFileDiffs(rawDiffs: unknown[]): FileDiffItem[] {
  if (!Array.isArray(rawDiffs)) return [];

  return rawDiffs.map((item) => {
    const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const oldPath = String(obj.oldPath ?? obj.old_path ?? '');
    const newPath = String(obj.newPath ?? obj.new_path ?? oldPath);
    const newFile = Boolean(obj.newFile ?? obj.new_file);
    const deletedFile = Boolean(obj.deletedFile ?? obj.deleted_file);
    const renamedFile = Boolean(obj.renamedFile ?? obj.renamed_file);
    const diff = String(obj.diff ?? '');

    const { lines, additions, deletions } = parseDiffLines(diff);

    return {
      oldPath,
      newPath,
      newFile,
      deletedFile,
      renamedFile,
      diff,
      additions,
      deletions,
      lines,
    };
  });
}

export interface DiffTreeNode {
  id: string;
  name: string;
  path: string;
  kind: 'directory' | 'file';
  file?: FileDiffItem;
  children?: DiffTreeNode[];
  additions: number;
  deletions: number;
  fileCount: number;
}

/**
 * 将文件路径安全转为 DOM 锚点 ID
 */
export function getDiffAnchorId(filePath: string): string {
  return `diff-file-${filePath.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/**
 * 将 FileDiffItem 列表构建为具有层级关系的树形结构
 */
export function buildDiffTree(diffs: FileDiffItem[]): DiffTreeNode[] {
  if (!diffs || diffs.length === 0) return [];

  interface InternalDir {
    name: string;
    path: string;
    subDirs: Map<string, InternalDir>;
    files: DiffTreeNode[];
  }

  const rootDir: InternalDir = {
    name: '',
    path: '',
    subDirs: new Map(),
    files: [],
  };

  for (const diffItem of diffs) {
    const rawPath = (diffItem.newPath || diffItem.oldPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!rawPath) continue;

    const parts = rawPath.split('/');
    const fileName = parts.pop()!;
    let currentDir = rootDir;
    let accumulatedPath = '';

    for (const folder of parts) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${folder}` : folder;
      let nextDir = currentDir.subDirs.get(folder);
      if (!nextDir) {
        nextDir = {
          name: folder,
          path: accumulatedPath,
          subDirs: new Map(),
          files: [],
        };
        currentDir.subDirs.set(folder, nextDir);
      }
      currentDir = nextDir;
    }

    const fileNode: DiffTreeNode = {
      id: rawPath,
      name: fileName,
      path: rawPath,
      kind: 'file',
      file: diffItem,
      additions: diffItem.additions,
      deletions: diffItem.deletions,
      fileCount: 1,
    };

    currentDir.files.push(fileNode);
  }

  // 递归将 InternalDir 转换为 DiffTreeNode
  function convertDir(dir: InternalDir): DiffTreeNode[] {
    const nodes: DiffTreeNode[] = [];

    // 目录按名称排序
    const sortedDirEntries = Array.from(dir.subDirs.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );

    for (const subDir of sortedDirEntries) {
      const childNodes = convertDir(subDir);
      const totalAdditions = childNodes.reduce((acc, c) => acc + c.additions, 0);
      const totalDeletions = childNodes.reduce((acc, c) => acc + c.deletions, 0);
      const totalFileCount = childNodes.reduce((acc, c) => acc + c.fileCount, 0);

      nodes.push({
        id: `dir:${subDir.path}`,
        name: subDir.name,
        path: subDir.path,
        kind: 'directory',
        children: childNodes,
        additions: totalAdditions,
        deletions: totalDeletions,
        fileCount: totalFileCount,
      });
    }

    // 文件按名称排序
    const sortedFiles = dir.files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );

    nodes.push(...sortedFiles);
    return nodes;
  }

  return convertDir(rootDir);
}

/**
 * 递归收集所有目录路径
 */
export function getAllDirectoryPaths(nodes: DiffTreeNode[]): string[] {
  const paths: string[] = [];
  function traverse(list: DiffTreeNode[]) {
    for (const node of list) {
      if (node.kind === 'directory') {
        paths.push(node.path);
        if (node.children) {
          traverse(node.children);
        }
      }
    }
  }
  traverse(nodes);
  return paths;
}

/**
 * 根据搜索关键字过滤树节点（保留匹配节点的全部祖先路径）
 */
export function filterDiffTree(nodes: DiffTreeNode[], query: string): DiffTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  function filterNode(node: DiffTreeNode): DiffTreeNode | null {
    if (node.kind === 'file') {
      const matches = node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q);
      return matches ? node : null;
    }

    // 目录节点：递归过滤子节点
    const filteredChildren = (node.children || [])
      .map(filterNode)
      .filter((n): n is DiffTreeNode => n !== null);

    const dirMatches = node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q);

    if (filteredChildren.length > 0 || dirMatches) {
      const children = filteredChildren.length > 0 ? filteredChildren : node.children;
      const totalAdditions = (children || []).reduce((acc, c) => acc + c.additions, 0);
      const totalDeletions = (children || []).reduce((acc, c) => acc + c.deletions, 0);
      const totalFileCount = (children || []).reduce((acc, c) => acc + c.fileCount, 0);

      return {
        ...node,
        children,
        additions: totalAdditions,
        deletions: totalDeletions,
        fileCount: totalFileCount,
      };
    }

    return null;
  }

  return nodes.map(filterNode).filter((n): n is DiffTreeNode => n !== null);
}

