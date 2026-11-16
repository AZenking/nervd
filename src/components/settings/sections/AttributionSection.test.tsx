import { act } from 'react';
import type { ChangeEvent } from 'react';
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
  bindings: [] as Array<Record<string, unknown>>,
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
  loadBindings: vi.fn(),
  saveBinding: vi.fn(),
  deleteBinding: vi.fn(),
  loadActiveWorkitems: vi.fn(),
  installHook: vi.fn(),
  uninstallHook: vi.fn(),
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

const apiMock = vi.hoisted(() => ({
  pickRepoDirectory: vi.fn(),
  inspectLocalRepo: vi.fn(),
}));

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

vi.mock('@/lib/attribution-api', () => apiMock);

// SearchableSelect 内部是 HeroUI Autocomplete（Portal + 弹层），jsdom 里难以稳定驱动；
// 这里退化成原生 select，只验证 AttributionSection 的选择 → 绑定编排。
vi.mock('@/components/searchable-select', async () => {
  const { createElement } = await import('react');
  type MockSearchableSelectProps = {
    items?: Array<{ label: string; value: number }>;
    value?: number | null;
    onValueChange?: (value: number | null) => void;
    ariaLabel?: string;
    placeholder?: string;
    disabled?: boolean;
  };
  return {
    SearchableSelect: (props: MockSearchableSelectProps) =>
      createElement(
        'select',
        {
          'aria-label': props.ariaLabel,
          value: props.value ?? '',
          disabled: props.disabled,
          onChange: (event: ChangeEvent<HTMLSelectElement>) =>
            props.onValueChange?.(event.target.value ? Number(event.target.value) : null),
        },
        createElement('option', { value: '' }, props.placeholder ?? ''),
        (props.items ?? []).map((item) =>
          createElement('option', { key: item.value, value: item.value }, item.label),
        ),
      ),
  };
});

vi.mock('@/hooks/use-clipboard', () => ({
  useClipboard: () => ({ copy: vi.fn(), copied: false }),
}));

/** 绕过 React 的 value tracker，让受控 select 的 change 事件真正触达 onChange */
async function pickOption(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

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

function findButton(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((element) =>
    element.textContent?.includes(text),
  );
  expect(button, `未找到按钮：${text}`).toBeTruthy();
  return button!;
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
    attributionStore.bindings = [];
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
    attributionStore.loadBindings.mockResolvedValue([]);
    attributionStore.saveBinding.mockResolvedValue({ repoId: 102, path: '/tmp/order-web' });
    attributionStore.loadActiveWorkitems.mockResolvedValue(attributionStore.activeWorkitems);
    attributionStore.installHook.mockResolvedValue({
      installed: true,
      mode: 'fill',
    });
    attributionStore.uninstallHook.mockResolvedValue({ installed: false, mode: 'off' });

    apiMock.pickRepoDirectory.mockResolvedValue('/tmp/order-web');
    apiMock.inspectLocalRepo.mockResolvedValue({
      path: '/tmp/order-api',
      isGit: true,
      currentBranch: 'feature/REQ-101',
      headSha: '7a3f8b1c9d',
      dirty: false,
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

  it('展示已绑定仓库路径 / Git 状态，并可安装默认 fill 钩子', async () => {
    attributionStore.bindings = [
      {
        repoId: 101,
        path: '/tmp/order-api',
        hookInstalled: false,
        hookMode: 'fill',
        updatedAt: 1,
      },
    ];
    attributionStore.loadBindings.mockResolvedValue(attributionStore.bindings);
    await render();

    expect(document.body.textContent).toContain('/tmp/order-api');
    expect(apiMock.inspectLocalRepo).toHaveBeenCalledWith({ path: '/tmp/order-api' });
    expect(document.body.textContent).toContain('feature/REQ-101');
    expect(document.body.textContent).toContain('工作区干净');
    expect(document.body.textContent).toContain('未绑定');

    await act(async () => {
      findButton('安装钩子').click();
      await Promise.resolve();
    });
    await flush();

    expect(attributionStore.installHook).toHaveBeenCalledWith(101, 'fill');
  });

  it('未绑定仓库可调用目录选择并保存绑定', async () => {
    attributionStore.bindings = [
      {
        repoId: 101,
        path: '/tmp/order-api',
        hookInstalled: false,
        hookMode: 'fill',
        updatedAt: 1,
      },
    ];
    attributionStore.loadBindings.mockResolvedValue(attributionStore.bindings);
    await render();

    const pickButtons = [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
      (button) => button.textContent?.trim() === '选择目录',
    );
    expect(pickButtons.length).toBeGreaterThan(0);
    await act(async () => {
      pickButtons[0].click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMock.pickRepoDirectory).toHaveBeenCalled();
    expect(attributionStore.saveBinding).toHaveBeenCalledWith(102, '/tmp/order-web');
    expect(attributionStore.loadBindings).toHaveBeenCalledTimes(2);
  });

  it('默认扫描仓库为空时仍提供绑定本地仓库的入口', async () => {
    appStore.settings = { watchedRepos: [], allowWriteOps: false, hasPat: true };
    await render();

    expect(document.body.textContent).toContain('绑定新的本地仓库');
    expect(document.body.textContent).toContain('选择目录并绑定');
    expect(document.body.textContent).toContain('还没有默认扫描仓库');

    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="选择要绑定的云效仓库"]',
    );
    expect(select).not.toBeNull();
    // 入口列的是云效全量仓库，而不是空态下没有任何可选项
    expect(select!.textContent).toContain('core/trade/order-api');
    expect(select!.textContent).toContain('core/trade/order-web');
  });

  it('从独立入口选择仓库与目录后保存绑定', async () => {
    appStore.settings = { watchedRepos: [], allowWriteOps: false, hasPat: true };
    await render();

    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="选择要绑定的云效仓库"]',
    );
    expect(select).not.toBeNull();
    await pickOption(select!, '102');

    await act(async () => {
      findButton('选择目录并绑定').click();
      await Promise.resolve();
    });
    await flush();

    expect(apiMock.pickRepoDirectory).toHaveBeenCalled();
    expect(attributionStore.saveBinding).toHaveBeenCalledWith(102, '/tmp/order-web');
    expect(attributionStore.loadBindings).toHaveBeenCalled();
  });

  it('展示当前 Agent 工作项与提交命令', async () => {
    await render();

    expect(document.body.textContent).toContain('REQ-101');
    expect(document.body.textContent).toContain('父需求 REQ-100');
    expect(document.body.textContent).toContain('./scripts/agent-commit.sh -m');
    expect(document.body.textContent).toContain('.nervd/active-workitem.json');
  });
});