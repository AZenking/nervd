import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttributionSection } from './AttributionSection';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const attributionStore = vi.hoisted(() => ({
  policy: {
    enabled: true,
    childMode: 'batch' as const,
    parentMode: 'milestone' as const,
    maxPerDay: 8,
  },
  status: { lastSyncAt: new Date('2026-11-13T09:30:00+08:00').getTime(), syncing: false, repos: [] },
  activeWorkitems: {
    101: {
      repoId: 101,
      workitemId: 'wi-req-101',
      identifier: 'REQ-101',
      category: 'Req' as const,
      parentIdentifier: 'REQ-100',
      updatedAt: 1,
    },
  } as Record<number, Record<string, unknown>>,
  syncing: false,
  loadPolicy: vi.fn(),
  savePolicy: vi.fn(),
  refreshStatus: vi.fn(),
  syncNow: vi.fn(),
  loadActiveWorkitems: vi.fn(),
}));

const appStore = vi.hoisted(() => {
  const state: Record<string, unknown> = {
    settings: {
      watchedRepos: [101, 102],
      allowWriteOps: false,
      hasPat: true,
    },
    repositories: [
      { id: 101, name: 'order-api', pathWithNamespace: 'core/trade/order-api' },
      { id: 102, name: 'order-web', pathWithNamespace: 'core/trade/order-web' },
    ],
    loadRepos: vi.fn(),
    setToast: vi.fn(),
  };
  return state;
});

vi.mock('@/store/attribution', () => ({
  useAttribution: (selector: (state: typeof attributionStore) => unknown) =>
    selector(attributionStore),
}));

vi.mock('@/store/app', () => {
  const useApp = ((selector: (state: typeof appStore) => unknown) => selector(appStore)) as
    & ((selector: (state: typeof appStore) => unknown) => unknown)
    & { getState: () => typeof appStore };
  useApp.getState = () => appStore;
  return { useApp };
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function chooseSelect(label: string, optionLabel: string) {
  const trigger = document.querySelector<HTMLElement>(`button[aria-label="${label}"]`);
  expect(trigger, `未找到下拉框：${label}`).toBeTruthy();
  await act(async () => {
    trigger!.click();
    await Promise.resolve();
  });
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) =>
    element.textContent?.includes(optionLabel),
  );
  expect(option, `未找到选项：${optionLabel}`).toBeTruthy();
  await act(async () => {
    option!.click();
    await Promise.resolve();
  });
}

describe('AttributionSection 设置分区', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    attributionStore.policy = {
      enabled: true,
      childMode: 'batch',
      parentMode: 'milestone',
      maxPerDay: 8,
    };
    attributionStore.status = {
      lastSyncAt: new Date('2026-11-13T09:30:00+08:00').getTime(),
      syncing: false,
      repos: [],
    };
    attributionStore.activeWorkitems = {
      101: {
        repoId: 101,
        workitemId: 'wi-req-101',
        identifier: 'REQ-101',
        category: 'Req',
        parentIdentifier: 'REQ-100',
        updatedAt: 1,
      },
    };
    attributionStore.syncing = false;

    appStore.settings = { watchedRepos: [101, 102], allowWriteOps: false, hasPat: true };
    appStore.repositories = [
      { id: 101, name: 'order-api', pathWithNamespace: 'core/trade/order-api' },
      { id: 102, name: 'order-web', pathWithNamespace: 'core/trade/order-web' },
    ];

    attributionStore.loadPolicy.mockResolvedValue(attributionStore.policy);
    attributionStore.savePolicy.mockImplementation(async (policy: unknown) => policy);
    attributionStore.refreshStatus.mockResolvedValue(attributionStore.status);
    attributionStore.syncNow.mockResolvedValue(null);
    attributionStore.loadActiveWorkitems.mockResolvedValue(attributionStore.activeWorkitems);

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
      root.render(<AttributionSection />);
      await Promise.resolve();
    });
    await flush();
  };

  it('渲染回写策略、同步状态与只读模式说明', async () => {
    await render();

    expect(document.body.textContent).toContain('回写策略');
    expect(document.body.textContent).toContain('子项回写模式');
    expect(document.body.textContent).toContain('需求回写模式');
    expect(document.body.textContent).toContain('每日回写上限');
    expect(document.body.textContent).toContain('同步状态');
    expect(document.body.textContent).toContain('只读保护模式');
    expect(document.body.textContent).toContain('allowWriteOps=false');
    expect(document.body.textContent).toContain('回写评论会挂起');
  });

  it('切换子项回写模式后防抖自动保存，保存调用携带新策略', async () => {
    await render();

    await chooseSelect('子项回写模式', '每条事件');
    // 回写策略已改为 800ms 防抖自动保存，等待防抖窗口结束再断言
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    await flush();

    expect(attributionStore.savePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        childMode: 'per_event',
        parentMode: 'milestone',
        maxPerDay: 8,
      }),
      expect.objectContaining({ silent: true }),
    );
  });

  it('展示当前 Agent 工作项与提交命令', async () => {
    await render();

    expect(document.body.textContent).toContain('REQ-101');
    expect(document.body.textContent).toContain('父需求 REQ-100');
    expect(document.body.textContent).toContain('./scripts/agent-commit.sh -m');
    expect(document.body.textContent).toContain('.nervd/active-workitem.json');
  });

  it('明确标注构建事件暂未接入（同步说明 / 状态行 / 回写策略），避免误以为构建归属已生效', async () => {
    await render();
    const text = document.body.textContent ?? '';

    // 同步分组说明与状态行：只接入 commit / MR
    expect(text).toContain('构建事件暂未接入');
    expect(text).toContain('同步范围仅包含 commit / MR');
    // 回写策略中提及「构建失败」的位置同步澄清
    expect(text).toContain('构建失败回写依赖构建事件归属');
    // 不破坏原有七个分区：回写策略与同步状态仍在
    expect(text).toContain('回写策略');
    expect(text).toContain('同步状态');
  });
});