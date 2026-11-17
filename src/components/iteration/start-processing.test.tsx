import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StartProcessingButton } from './start-processing';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const appStore = vi.hoisted(() => ({
  settings: {
    watchedRepos: [101, 102],
    workitemRepos: { 'req-1': [101, 102] } as Record<string, number[]>,
    allowWriteOps: true,
    hasPat: true,
  },
  repositories: [
    { id: 101, name: 'order-api', pathWithNamespace: 'core/trade/order-api' },
    { id: 102, name: 'order-web', pathWithNamespace: 'core/trade/order-web' },
    { id: 103, name: 'other-api', pathWithNamespace: 'core/other/other-api' },
  ],
}));

const attributionStore = vi.hoisted(() => ({
  activeWorkitems: {} as Record<number, Record<string, unknown>>,
  bindings: [
    { repoId: 101, path: '/tmp/order-api', hookInstalled: true, hookMode: 'fill', updatedAt: 1 },
    { repoId: 102, path: '/tmp/order-web', hookInstalled: true, hookMode: 'fill', updatedAt: 1 },
    { repoId: 103, path: '/tmp/other-api', hookInstalled: false, hookMode: 'off', updatedAt: 1 },
  ],
  loadBindings: vi.fn(),
  loadActiveWorkitems: vi.fn(),
  setActive: vi.fn(),
}));

const uiStore = vi.hoisted(() => ({ openSettings: vi.fn() }));
const toastMock = vi.hoisted(() => ({ add: vi.fn() }));
const apiMock = vi.hoisted(() => ({ inspectLocalRepo: vi.fn() }));

vi.mock('@/store/app', () => {
  const useApp = ((selector: (state: typeof appStore) => unknown) => selector(appStore)) as
    & ((selector: (state: typeof appStore) => unknown) => unknown)
    & { getState: () => typeof appStore };
  useApp.getState = () => appStore;
  return { useApp };
});

vi.mock('@/store/attribution', () => ({
  useAttribution: (selector: (state: typeof attributionStore) => unknown) => selector(attributionStore),
}));

vi.mock('@/store/ui', () => ({
  useUi: (selector: (state: typeof uiStore) => unknown) => selector(uiStore),
}));

vi.mock('@/components/ui/toast', () => ({ toast: toastMock }));
vi.mock('@/lib/attribution-api', () => apiMock);

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findButton(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((element) =>
    element.textContent?.includes(text),
  );
}

async function clickButton(text: string) {
  const button = findButton(text);
  expect(button, `未找到按钮：${text}`).toBeTruthy();
  await act(async () => {
    button!.click();
    await Promise.resolve();
  });
  await flush();
}

describe('StartProcessingButton', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    appStore.settings = {
      watchedRepos: [101, 102],
      workitemRepos: { 'req-1': [101, 102] },
      allowWriteOps: true,
      hasPat: true,
    };
    attributionStore.activeWorkitems = {};
    attributionStore.loadBindings.mockResolvedValue(attributionStore.bindings);
    attributionStore.loadActiveWorkitems.mockResolvedValue({});
    attributionStore.setActive.mockResolvedValue(true);
    apiMock.inspectLocalRepo.mockResolvedValue({
      path: '/tmp/order-api',
      isGit: true,
      dirty: false,
      hookInstalled: true,
      hookMode: 'fill',
    });

    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  const render = async () => {
    await act(async () => {
      root.render(
        <StartProcessingButton
          workitemId="wi-task"
          category="Task"
          parentWorkitemId="req-1"
        />,
      );
      await Promise.resolve();
    });
    await flush();
  };

  it('只把「需求关联 ∩ 已绑定」的仓库作为候选', async () => {
    await render();
    await clickButton('开始处理');

    expect(document.body.textContent).toContain('core/trade/order-api');
    expect(document.body.textContent).toContain('core/trade/order-web');
    // 未纳入父需求关联的仓库不出现在候选里
    expect(document.body.textContent).not.toContain('core/other/other-api');
  });

  it('选择仓库后写入活动工作项，并按钩子状态提示', async () => {
    await render();
    await clickButton('开始处理');
    await clickButton('core/trade/order-api');

    expect(attributionStore.setActive).toHaveBeenCalledWith(
      { repoId: 101, workitemId: 'wi-task', parentWorkitemId: 'req-1' },
      { silent: true },
    );
    expect(toastMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
    const calls = toastMock.add.mock.calls;
    const last = calls[calls.length - 1]?.[0] as { description?: string } | undefined;
    expect(String(last?.description)).toContain('自动补充 Refs');
    // 开始处理同时生成 Agent 脚手架（任务说明 + 脚本）
    expect(String(last?.description)).toContain('.nervd/agent-task.md');
    expect(String(last?.description)).toContain('.nervd/scripts/');
  });

  it('活动状态按仓库回显“正在处理 · 仓库”', async () => {
    attributionStore.activeWorkitems = {
      102: {
        repoId: 102,
        workitemId: 'wi-task',
        identifier: 'TASK-1',
        category: 'Task',
        updatedAt: 10,
      },
    };
    await render();

    expect(document.body.textContent).toContain('正在处理 · core/trade/order-web');
  });

  it('只读模式下拦截写入', async () => {
    appStore.settings = { ...appStore.settings, allowWriteOps: false };
    await render();
    await clickButton('开始处理');

    expect(attributionStore.setActive).not.toHaveBeenCalled();
    expect(toastMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: '当前处于只读模式' }),
    );
  });

  it('只有一个候选时直接写入，不弹选择框', async () => {
    appStore.settings = { ...appStore.settings, workitemRepos: { 'req-1': [101] } };
    await render();
    await clickButton('开始处理');

    expect(attributionStore.setActive).toHaveBeenCalledWith(
      { repoId: 101, workitemId: 'wi-task', parentWorkitemId: 'req-1' },
      { silent: true },
    );
    expect(document.body.textContent).not.toContain('选择本地仓库');
  });

  it('钩子不可用时提示安装或改用提交脚本', async () => {
    appStore.settings = { ...appStore.settings, workitemRepos: { 'req-1': [101] } };
    apiMock.inspectLocalRepo.mockResolvedValue({
      path: '/tmp/order-api',
      isGit: true,
      dirty: false,
      hookInstalled: false,
      hookMode: 'off',
    });
    await render();
    await clickButton('开始处理');

    expect(toastMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning' }),
    );
    const calls = toastMock.add.mock.calls;
    const last = calls[calls.length - 1]?.[0] as { description?: string } | undefined;
    expect(String(last?.description)).toContain('agent-commit.sh');
  });

  it('写入后提示本地当前分支（只读分支检查）', async () => {
    appStore.settings = { ...appStore.settings, workitemRepos: { 'req-1': [101] } };
    apiMock.inspectLocalRepo.mockResolvedValue({
      path: '/tmp/order-api',
      isGit: true,
      currentBranch: 'feature/REQ-1',
      headSha: 'abc1234',
      dirty: false,
      hookInstalled: true,
      hookMode: 'fill',
    });
    await render();
    await clickButton('开始处理');

    const calls = toastMock.add.mock.calls;
    const last = calls[calls.length - 1]?.[0] as { type?: string; description?: string } | undefined;
    expect(last?.type).toBe('success');
    expect(String(last?.description)).toContain('当前分支 feature/REQ-1');
  });

  it('工作区有未提交修改时给出警告，但仍写入当前工作项', async () => {
    appStore.settings = { ...appStore.settings, workitemRepos: { 'req-1': [101] } };
    apiMock.inspectLocalRepo.mockResolvedValue({
      path: '/tmp/order-api',
      isGit: true,
      currentBranch: 'feature/REQ-1',
      headSha: 'abc1234',
      dirty: true,
      hookInstalled: true,
      hookMode: 'fill',
    });
    await render();
    await clickButton('开始处理');

    expect(attributionStore.setActive).toHaveBeenCalledWith(
      { repoId: 101, workitemId: 'wi-task', parentWorkitemId: 'req-1' },
      { silent: true },
    );
    const calls = toastMock.add.mock.calls;
    const last = calls[calls.length - 1]?.[0] as { type?: string; description?: string } | undefined;
    expect(last?.type).toBe('warning');
    expect(String(last?.description)).toContain('工作区有未提交修改');
    expect(String(last?.description)).toContain('不会自动提交或切换分支');
  });

  it('游离 HEAD 时提示不在分支上', async () => {
    appStore.settings = { ...appStore.settings, workitemRepos: { 'req-1': [101] } };
    apiMock.inspectLocalRepo.mockResolvedValue({
      path: '/tmp/order-api',
      isGit: true,
      headSha: 'abc1234',
      dirty: false,
      hookInstalled: true,
      hookMode: 'fill',
    });
    await render();
    await clickButton('开始处理');

    const calls = toastMock.add.mock.calls;
    const last = calls[calls.length - 1]?.[0] as { type?: string; description?: string } | undefined;
    expect(last?.type).toBe('warning');
    expect(String(last?.description)).toContain('游离 HEAD');
  });
});
