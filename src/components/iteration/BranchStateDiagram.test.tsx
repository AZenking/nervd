import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import BranchStateDiagram, { type BranchSyncRepo } from './BranchStateDiagram';

vi.mock('@/lib/api', () => ({
  compareBranches: vi.fn().mockResolvedValue({ commits: [] }),
}));

describe('BranchStateDiagram 直连轨道两节点形态', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.mocked(api.compareBranches).mockClear();
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
  });

  const directRepo: BranchSyncRepo = {
    key: '101',
    repoId: 101,
    repoName: 'group/trade-service',
    sourceBranch: 'master',
    baselineBranch: 'master',
    baselineState: 'exists',
    developmentBranch: 'feature/REQ-101',
  };

  const threeNodeRepo: BranchSyncRepo = {
    key: '102',
    repoId: 102,
    repoName: 'group/portal-web',
    sourceBranch: 'master',
    baselineBranch: 'iteration/Sprint-1',
    baselineState: 'exists',
    developmentBranch: 'feature/REQ-102',
  };

  const renderDiagram = async (repos: BranchSyncRepo[]) => {
    await act(() => {
      root.render(
        <BranchStateDiagram
          requirement={{ identifier: 'REQ-101', subject: '直连拓扑' }}
          repos={repos}
        />,
      );
    });
    // compare 双向请求为异步，flush 后再断言调用计数
    for (let i = 0; i < 3; i++) {
      await act(async () => { await Promise.resolve(); });
    }
  };

  it('直连仓库（基准≡源）不渲染迭代分支节点，跳过基准↔源自比较', async () => {
    await renderDiagram([directRepo]);

    const text = host.textContent ?? '';
    expect(text).toContain('trade-service');
    expect(text).toContain('master');
    expect(text).toContain('feature/REQ-101');
    // 直连轨道：无迭代分支层（「迭代分支」节点种类不出现）
    expect(text).not.toContain('迭代分支');
    // compare 口径：仅 开发↔基准 一组双向比较（2 次调用），跳过 基准↔源 自比较
    expect(api.compareBranches).toHaveBeenCalledTimes(2);
    expect(api.compareBranches).toHaveBeenCalledWith(101, 'master', 'feature/REQ-101');
    expect(api.compareBranches).toHaveBeenCalledWith(101, 'feature/REQ-101', 'master');
  });

  it('三节点仓库保持既有形态：迭代分支节点 + 两组双向比较', async () => {
    await renderDiagram([threeNodeRepo]);

    const text = host.textContent ?? '';
    expect(text).toContain('迭代分支');
    expect(text).toContain('iteration/Sprint-1');
    expect(text).toContain('master');
    expect(text).toContain('feature/REQ-102');
    // compare 口径不变：开发↔迭代 + 迭代↔源（各 2 次调用）
    expect(api.compareBranches).toHaveBeenCalledTimes(4);
  });

  it('直连与三节点仓库混排互不影响（仅三节点仓库渲染迭代分支层）', async () => {
    await renderDiagram([directRepo, threeNodeRepo]);

    const iterNodes = Array.from(host.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && el.textContent === '迭代分支',
    );
    expect(iterNodes).toHaveLength(1);
    // 直连 2 + 三节点 4 = 6 次调用
    expect(api.compareBranches).toHaveBeenCalledTimes(6);
  });
});
