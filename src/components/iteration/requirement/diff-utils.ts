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
