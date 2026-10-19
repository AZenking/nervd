import { describe, it, expect, beforeEach } from 'vitest';
import { getCustomDevBranch, setCustomDevBranch, DEFAULT_DEV_BRANCH } from './dev-branch-settings';

describe('dev-branch-settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('未配置时返回默认分支 dev', () => {
    expect(getCustomDevBranch()).toBe(DEFAULT_DEV_BRANCH);
  });

  it('支持保存并读取自定义 dev 分支', () => {
    setCustomDevBranch('develop');
    expect(getCustomDevBranch()).toBe('develop');
  });

  it('传入空白或空串时自动回退为默认分支 dev', () => {
    setCustomDevBranch('   ');
    expect(getCustomDevBranch()).toBe(DEFAULT_DEV_BRANCH);
  });
});
