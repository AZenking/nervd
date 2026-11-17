import { describe, expect, it } from 'vitest';
import {
  workitemExplicitRepoIds,
  workitemOwnsRepoConfig,
  workitemRepoOverride,
  workitemScanRepoIds,
} from './workitem-repos';
import type { Settings } from '../types';

const base: Pick<Settings, 'watchedRepos' | 'workitemRepos'> = {
  watchedRepos: [1, 2, 3],
  workitemRepos: {},
};

describe('显式关联：只有配置过的键才算关联', () => {
  it('Req：没有覆盖键时显式关联为空，不再回退默认池', () => {
    expect(workitemRepoOverride('Req', 'req-2', base)).toBeNull();
    expect(workitemExplicitRepoIds('Req', 'req-2', base)).toEqual([]);
  });

  it('Req：覆盖键优先，空数组表示显式清空', () => {
    const settings = { ...base, workitemRepos: { 'req-1': [7, 8], 'req-2': [] } };
    expect(workitemExplicitRepoIds('Req', 'req-1', settings)).toEqual([7, 8]);
    expect(workitemRepoOverride('Req', 'req-2', settings)).toEqual([]);
    expect(workitemExplicitRepoIds('Req', 'req-2', settings)).toEqual([]);
  });

  it('Task/Bug：继承父需求的显式关联；父需求未设置时为空', () => {
    const settings = { ...base, workitemRepos: { 'req-1': [7, 8] } };
    expect(workitemExplicitRepoIds('Task', 'task-9', settings, 'req-1')).toEqual([7, 8]);
    expect(workitemExplicitRepoIds('Bug', 'bug-9', settings, 'req-1')).toEqual([7, 8]);
    expect(workitemExplicitRepoIds('Task', 'task-9', base, 'req-1')).toEqual([]);
  });

  it('Task/Bug：子项自身的键不生效（仓库始终由父需求管理）', () => {
    const settings = { ...base, workitemRepos: { 'task-9': [99] } };
    expect(workitemExplicitRepoIds('Task', 'task-9', settings, 'req-1')).toEqual([]);
  });

  it('独立 Bug（无父需求）：自身键生效，不再只能靠默认池', () => {
    const settings = { ...base, workitemRepos: { 'bug-9': [7, 8] } };
    expect(workitemRepoOverride('Bug', 'bug-9', settings)).toEqual([7, 8]);
    expect(workitemExplicitRepoIds('Bug', 'bug-9', settings)).toEqual([7, 8]);
    expect(workitemScanRepoIds('Bug', 'bug-9', settings)).toEqual([7, 8]);
  });

  it('独立 Bug：空数组表示显式不关联（区别于未设置）', () => {
    const settings = { ...base, workitemRepos: { 'bug-9': [] } };
    expect(workitemRepoOverride('Bug', 'bug-9', settings)).toEqual([]);
    expect(workitemScanRepoIds('Bug', 'bug-9', settings)).toEqual([]);
  });

  it('独立 Bug：没有自身键时仍未关联（扫描回退默认池）', () => {
    expect(workitemRepoOverride('Bug', 'bug-9', base)).toBeNull();
    expect(workitemScanRepoIds('Bug', 'bug-9', base)).toEqual([1, 2, 3]);
  });

  it('挂到需求下的缺陷以父需求为准，自身历史键被忽略', () => {
    const settings = { ...base, workitemRepos: { 'req-1': [7], 'bug-9': [99] } };
    expect(workitemExplicitRepoIds('Bug', 'bug-9', settings, 'req-1')).toEqual([7]);
  });
});

describe('扫描范围：显式关联优先，缺省回退默认云效仓库', () => {
  it('Req：无覆盖时回退默认池', () => {
    expect(workitemScanRepoIds('Req', 'req-2', base)).toEqual([1, 2, 3]);
  });

  it('Req：有覆盖时以覆盖为准（空数组 = 不扫描）', () => {
    const settings = { ...base, workitemRepos: { 'req-1': [7, 8], 'req-2': [] } };
    expect(workitemScanRepoIds('Req', 'req-1', settings)).toEqual([7, 8]);
    expect(workitemScanRepoIds('Req', 'req-2', settings)).toEqual([]);
  });

  it('Task/Bug：父需求显式覆盖优先，否则回退默认池', () => {
    const settings = { ...base, workitemRepos: { 'req-1': [7, 8] } };
    expect(workitemScanRepoIds('Task', 'task-9', settings, 'req-1')).toEqual([7, 8]);
    expect(workitemScanRepoIds('Task', 'task-9', base, 'req-1')).toEqual([1, 2, 3]);
    expect(workitemScanRepoIds('Bug', 'bug-9', base, undefined)).toEqual([1, 2, 3]);
  });
});
describe('仓库配置归属：需求恒自持，子项只读继承', () => {
  it('需求自持；挂在需求下的 Task/Bug 只读继承', () => {
    expect(workitemOwnsRepoConfig('Req', undefined)).toBe(true);
    expect(workitemOwnsRepoConfig('Req', 'req-1')).toBe(true);
    expect(workitemOwnsRepoConfig('Task', 'req-1')).toBe(false);
    expect(workitemOwnsRepoConfig('Bug', 'req-1')).toBe(false);
  });

  it('独立缺陷/任务（无父需求）自持关联与分支模板', () => {
    expect(workitemOwnsRepoConfig('Bug', undefined)).toBe(true);
    expect(workitemOwnsRepoConfig('Task', '')).toBe(true);
  });
});
