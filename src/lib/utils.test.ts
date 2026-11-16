import { describe, expect, it } from 'vitest';
import { compactFsPath } from './utils';

describe('compactFsPath', () => {
  it('保留末两段，用 … 省略前缀', () => {
    expect(compactFsPath('/Users/me/work/chery/maintain-view')).toBe('…/chery/maintain-view');
    expect(compactFsPath('/Users/me/work/foton/maintain-view')).toBe('…/foton/maintain-view');
  });

  it('短路径原样返回，避免无意义的省略', () => {
    expect(compactFsPath('/tmp/order-api')).toBe('/tmp/order-api');
    expect(compactFsPath('maintain-view')).toBe('maintain-view');
  });

  it('兼容 Windows 分隔符与尾斜杠', () => {
    expect(compactFsPath('C:\\work\\chery\\maintain-view\\')).toBe('…/chery/maintain-view');
  });

  it('按 segments 参数保留更多层级', () => {
    expect(compactFsPath('/a/b/c/d', 3)).toBe('…/b/c/d');
  });
});