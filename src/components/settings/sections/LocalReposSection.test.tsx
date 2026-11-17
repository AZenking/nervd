import { act } from 'react';
import type { ChangeEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalReposSection } from './LocalReposSection';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const attributionStore = vi.hoisted(() => ({
  bindings: [] as Array<Record<string, unknown>>,
  loadBindings: vi.fn(),
  saveBinding: vi.fn(),
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
// 这里退化成原生 select，只验证本地绑定入口的选择 → 绑定编排。
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

function findButton(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((element) =>
    element.textContent?.includes(text),
  );
  expect(button, `未找到按钮：${text}`).toBeTruthy();
  return button!;
}

describe('LocalReposSection 本地仓库与 Hook', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    attributionStore.bindings = [];
    appStore.settings = { watchedRepos: [101, 102], allowWriteOps: false, hasPat: true };
    appStore.repositories = [
      { id: 101, name: 'order-api', pathWithNamespace: 'core/trade/order-api' },
      { id: 102, name: 'order-web', pathWithNamespace: 'core/trade/order-web' },
    ];

    attributionStore.loadBindings.mockResolvedValue([]);
    attributionStore.saveBinding.mockResolvedValue({ repoId: 102, path: '/tmp/order-web' });
    attributionStore.installHook.mockResolvedValue({ installed: true, mode: 'fill' });
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
      root.render(<LocalReposSection />);
      await Promise.resolve();
    });
    await flush();
  };

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
});