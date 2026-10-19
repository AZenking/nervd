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
