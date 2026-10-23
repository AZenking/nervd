import { describe, it, expect } from 'vitest';
import { parseDiffLines, parseFileDiffs } from './diff-utils';

describe('parseDiffLines', () => {
  it('正确解析 unified diff 中的新增、删除与代码上下文行', () => {
    const rawDiff = `--- a/test.vue
+++ b/test.vue
@@ -10,3 +10,3 @@
 context line 1
-old code
+new code
 context line 2`;

    const { lines, additions, deletions } = parseDiffLines(rawDiff);
    expect(additions).toBe(1);
    expect(deletions).toBe(1);

    const adds = lines.filter((l) => l.type === 'add');
    const dels = lines.filter((l) => l.type === 'del');
    const hunks = lines.filter((l) => l.type === 'hunk');
    const normals = lines.filter((l) => l.type === 'normal');

    expect(adds.length).toBe(1);
    expect(adds[0].text).toBe('new code');
    expect(dels.length).toBe(1);
    expect(dels[0].text).toBe('old code');
    expect(hunks.length).toBe(1);
    expect(normals.length).toBe(2);
  });

  it('空文本安全返回空数组与 0 变动', () => {
    const res = parseDiffLines('');
    expect(res.lines).toEqual([]);
    expect(res.additions).toBe(0);
    expect(res.deletions).toBe(0);
  });
});

describe('parseFileDiffs', () => {
  it('解析多文件 diff 列表并正确归并统计', () => {
    const raw = [
      {
        oldPath: 'src/Dialog.vue',
        newPath: 'src/Dialog.vue',
        diff: '@@ -1,2 +1,3 @@\n+line1\n+line2\n-old',
      },
      {
        oldPath: 'src/utils.ts',
        newPath: 'src/utils.ts',
        newFile: true,
        diff: '@@ -0,0 +1,1 @@\n+export const a = 1;',
      },
    ];

    const result = parseFileDiffs(raw);
    expect(result.length).toBe(2);
    expect(result[0].newPath).toBe('src/Dialog.vue');
    expect(result[0].additions).toBe(2);
    expect(result[0].deletions).toBe(1);
    expect(result[1].newFile).toBe(true);
    expect(result[1].additions).toBe(1);
  });
});

describe('diff-tree utils', () => {
  const sampleDiffs = [
    {
      oldPath: 'src/components/button.tsx',
      newPath: 'src/components/button.tsx',
      newFile: false,
      deletedFile: false,
      renamedFile: false,
      diff: '',
      additions: 10,
      deletions: 2,
      lines: [],
    },
    {
      oldPath: 'src/components/card.tsx',
      newPath: 'src/components/card.tsx',
      newFile: false,
      deletedFile: false,
      renamedFile: false,
      diff: '',
      additions: 5,
      deletions: 1,
      lines: [],
    },
    {
      oldPath: 'src/lib/utils.ts',
      newPath: 'src/lib/utils.ts',
      newFile: false,
      deletedFile: false,
      renamedFile: false,
      diff: '',
      additions: 3,
      deletions: 0,
      lines: [],
    },
    {
      oldPath: 'README.md',
      newPath: 'README.md',
      newFile: false,
      deletedFile: false,
      renamedFile: false,
      diff: '',
      additions: 1,
      deletions: 1,
      lines: [],
    },
  ];

  it('buildDiffTree 正确构建层级树并计算统计', async () => {
    const { buildDiffTree, getAllDirectoryPaths } = await import('./diff-utils');
    const tree = buildDiffTree(sampleDiffs);

    // 根目录应有 1 个目录 src 和 1 个文件 README.md
    expect(tree.length).toBe(2);
    expect(tree[0].kind).toBe('directory');
    expect(tree[0].name).toBe('src');
    expect(tree[0].fileCount).toBe(3);
    expect(tree[0].additions).toBe(18);
    expect(tree[0].deletions).toBe(3);

    expect(tree[1].kind).toBe('file');
    expect(tree[1].name).toBe('README.md');

    // 验证 src 的子节点
    const srcChildren = tree[0].children!;
    expect(srcChildren.length).toBe(2); // components, lib
    expect(srcChildren[0].name).toBe('components');
    expect(srcChildren[0].fileCount).toBe(2);
    expect(srcChildren[1].name).toBe('lib');
    expect(srcChildren[1].fileCount).toBe(1);

    // getAllDirectoryPaths
    const dirPaths = getAllDirectoryPaths(tree);
    expect(dirPaths).toContain('src');
    expect(dirPaths).toContain('src/components');
    expect(dirPaths).toContain('src/lib');
  });

  it('filterDiffTree 支持按文件名过滤并保留父级目录', async () => {
    const { buildDiffTree, filterDiffTree } = await import('./diff-utils');
    const tree = buildDiffTree(sampleDiffs);

    // 搜索 "button"
    const filtered = filterDiffTree(tree, 'button');
    expect(filtered.length).toBe(1); // 只有 src
    expect(filtered[0].name).toBe('src');
    const componentsDir = filtered[0].children![0];
    expect(componentsDir.name).toBe('components');
    expect(componentsDir.children!.length).toBe(1);
    expect(componentsDir.children![0].name).toBe('button.tsx');

    // 大小写不敏感搜索 "BUTTON"
    const filteredUpper = filterDiffTree(tree, 'BUTTON');
    expect(filteredUpper.length).toBe(1);

    // 未匹配的查询返回空
    const filteredNone = filterDiffTree(tree, 'non-existent-keyword');
    expect(filteredNone.length).toBe(0);

    // 空查询返回全部
    const filteredEmpty = filterDiffTree(tree, '');
    expect(filteredEmpty.length).toBe(tree.length);
  });

  it('getDiffAnchorId 安全转义并生成 DOM 合法 ID', async () => {
    const { getDiffAnchorId } = await import('./diff-utils');
    expect(getDiffAnchorId('src/components/button.tsx')).toBe('diff-file-src_components_button_tsx');
    expect(getDiffAnchorId('foo bar/baz.js')).toBe('diff-file-foo_bar_baz_js');
  });

  it('buildDiffTree 能够安全处理空列表与边界路径', async () => {
    const { buildDiffTree } = await import('./diff-utils');
    expect(buildDiffTree([])).toEqual([]);

    const edgeDiffs = [
      {
        oldPath: '',
        newPath: '   ',
        newFile: false,
        deletedFile: false,
        renamedFile: false,
        diff: '',
        additions: 0,
        deletions: 0,
        lines: [],
      },
    ];
    expect(buildDiffTree(edgeDiffs)).toEqual([]);
  });
});


