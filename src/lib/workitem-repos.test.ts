import { describe, expect, it } from 'vitest';
import {
  workitemExplicitRepoIds,
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