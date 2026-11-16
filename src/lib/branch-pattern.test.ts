import { describe, expect, it } from 'vitest';
import {
  extractPatternTokens,
  findUnknownPlaceholders,
  insertAtSelection,
  missingRequiredTokens,
  renderPatternPreview,
} from './branch-pattern';

describe('branch-pattern', () => {
  it('在光标中间插入并返回新光标', () => {
    expect(insertAtSelection('iteration//x', '{iteration}', 10, 10)).toEqual({
      value: 'iteration/{iteration}/x',
      cursor: 21,
    });
  });

  it('替换选中区间', () => {
    expect(insertAtSelection('feature/OLD', '{identifier}', 8, 11)).toEqual({
      value: 'feature/{identifier}',
      cursor: 20,
    });
  });

  it('无光标时追加到末尾，越界自动收敛', () => {
    expect(insertAtSelection('feature/', '{identifier}')).toEqual({
      value: 'feature/{identifier}',
      cursor: 20,
    });
    expect(insertAtSelection('abc', '{identifier}', 99, 120).value).toBe('abc{identifier}');
  });

  it('识别未知占位符并去重', () => {
    expect(
      findUnknownPlaceholders('iteration/{iteration}/{slug}/{slug}/{bogus}', [
        '{iteration}',
        '{track}',
        '{identifier}',
      ]),
    ).toEqual(['{slug}', '{bogus}']);
  });

  it('识别缺失的必需 token', () => {
    expect(missingRequiredTokens('feature/x', ['{identifier}'])).toEqual(['{identifier}']);
    expect(missingRequiredTokens('feature/{identifier}', ['{identifier}'])).toEqual([]);
  });

  it('按示例展开预览，未知 token 保留', () => {
    expect(
      renderPatternPreview('iteration/{iteration}/{track}/{unknown}', {
        '{iteration}': 'Sprint-1',
        '{track}': 'chery',
      }),
    ).toBe('iteration/Sprint-1/chery/{unknown}');
  });

  it('提取 token', () => {
    expect(extractPatternTokens('{iteration}/{track}/{template}/{identifier}')).toEqual([
      '{iteration}',
      '{track}',
      '{template}',
      '{identifier}',
    ]);
  });
});
