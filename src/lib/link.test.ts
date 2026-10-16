// L1 纯函数单测：需求 ↔ 代码 关联匹配（linkPattern 规则核心）
import { describe, it, expect } from 'vitest';
import { extractWorkItemKeys, identifierNum, matchesWorkitem } from './link';

// 与 preview/生产默认配置一致的追溯规则
const PATTERN = '(?:REQ|BUG|TASK)[-_]?(\\d+)';

describe('extractWorkItemKeys', () => {
  it('按捕获组提取编号，去重并大写归一', () => {
    // 捕获组为纯数字（(\d+)），前缀仅用于定位
    expect(extractWorkItemKeys('feature/req-101 … REQ-101 again bug_202', PATTERN)).toEqual(['101', '202']);
  });

  it('无匹配返回空数组', () => {
    expect(extractWorkItemKeys('chore: bump deps', PATTERN)).toEqual([]);
  });

  it('非法正则安全返回空数组（不抛错）', () => {
    expect(extractWorkItemKeys('REQ-1', '(')).toEqual([]);
  });

  it('空文本返回空数组', () => {
    expect(extractWorkItemKeys('', PATTERN)).toEqual([]);
  });
});

describe('identifierNum', () => {
  it('提取标识中的数字段', () => {
    expect(identifierNum('REQ-2048')).toBe('2048');
    expect(identifierNum('BENZ-6214')).toBe('6214');
  });

  it('无数字返回空串', () => {
    expect(identifierNum('REQ')).toBe('');
  });
});

describe('matchesWorkitem', () => {
  it('分支名携带同编号 → 命中', () => {
    expect(matchesWorkitem('REQ-101', 'feature/REQ-101-trace-panel', PATTERN)).toBe(true);
  });

  it('纯数字捕获 + 编号等值 → 命中', () => {
    expect(matchesWorkitem('REQ-101', 'fix(req-101): pagination', PATTERN)).toBe(true);
  });

  it('不同编号 → 不命中', () => {
    expect(matchesWorkitem('REQ-101', 'feature/bug-202-login', PATTERN)).toBe(false);
  });

  it('标识无数字段 → 恒不命中', () => {
    expect(matchesWorkitem('REQ', 'REQ-101', PATTERN)).toBe(false);
  });
});
