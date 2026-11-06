import { describe, expect, it } from 'vitest';
import { workitemRepoIds } from './workitem-repos';
import type { Settings } from '../types';

const base: Pick<Settings, 'watchedRepos' | 'workitemRepos'> = {
  watchedRepos: [1, 2, 3],
  workitemRepos: {},
};

describe('workitemRepoIds（子项继承父需求关联仓库）', () => {
  it('Req：需求级覆盖优先，缺省回退默认云效仓库', () => {
    expect(workitemRepoIds('Req', 'req-1', { ...base, workitemRepos: { 'req-1': [7, 8] } })).toEqual([7, 8]);
    expect(workitemRepoIds('Req', 'req-2', base)).toEqual([1, 2, 3]);
  });

  it('Task/Bug：有父需求覆盖键时继承父需求覆盖', () => {
    const settings = { ...base, workitemRepos: { 'req-1': [7, 8] } };
    expect(workitemRepoIds('Task', 'task-9', settings, 'req-1')).toEqual([7, 8]);
    expect(workitemRepoIds('Bug', 'bug-9', settings, 'req-1')).toEqual([7, 8]);
  });

  it('Task/Bug：父需求无覆盖键时回退默认云效仓库（与父需求解析链一致）', () => {
    expect(workitemRepoIds('Task', 'task-9', base, 'req-1')).toEqual([1, 2, 3]);
  });

  it('Task/Bug：父级未知时回退默认云效仓库，行为不劣化（兼容旧签名）', () => {
    expect(workitemRepoIds('Task', 'task-9', base)).toEqual([1, 2, 3]);
    expect(workitemRepoIds('Bug', 'bug-9', base, undefined)).toEqual([1, 2, 3]);
  });

  it('Task/Bug：子项自身的覆盖键不生效（子项仓库始终由父需求管理）', () => {
    const settings = { ...base, workitemRepos: { 'task-9': [99] } };
    expect(workitemRepoIds('Task', 'task-9', settings, 'req-1')).toEqual([1, 2, 3]);
  });

  it('空数组覆盖默认值语义保留（父需求覆盖为空数组时子项同样为空）', () => {
    const settings = { ...base, workitemRepos: { 'req-1': [] } };
    expect(workitemRepoIds('Req', 'req-1', settings)).toEqual([]);
    expect(workitemRepoIds('Bug', 'bug-9', settings, 'req-1')).toEqual([]);
  });
});
