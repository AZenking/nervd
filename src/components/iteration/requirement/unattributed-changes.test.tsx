// UnattributedChanges：待归属列表限额 / 编号解析指派成功 / 解析失败提示。
// 采用真实 `useAttribution` store + mock attribution-api，验证「指派后条目从列表消失」。
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkitemChange } from '@/types/attribution';
import { useAttribution } from '@/store/attribution';
import { useApp } from '@/store/app';
import { UnattributedChanges } from './unattributed-changes';

const apiMocks = vi.hoisted(() => ({
  syncAttribution: vi.fn(),
  getAttributionStatus: vi.fn(),
  listWorkitemChanges: vi.fn(),
  listUnattributedChanges: vi.fn(),
  assignChangeWorkitem: vi.fn(),
  resolveWorkitemIdentifiers: vi.fn(),
}));

vi.mock('@/lib/attribution-api', () => apiMocks);

const ATTRIBUTION_INITIAL = {
  timelineByWorkitem: {},
  loadingTimeline: {},
  timelineError: {},
  timelineNextBefore: {},
  timelineIncludeRollup: {},
  unassigned: [],
  unassignedLoading: false,
  status: null,
  policy: null,
  bindings: [],
  activeWorkitems: {},
  syncing: false,
};

function change(
  id: string,
  overrides: Partial<WorkitemChange> = {},
): WorkitemChange {
  return {
    id,
    repoId: 7,
    repoName: 'trade-service',
    kind: 'commit',
    externalId: id,
    branch: 'feature/req-101',
    title: `提交 ${id}`,
    occurredAt: Date.now() - 60_000,
    source: 'remote',
    pushed: true,
    backfilled: false,
    payload: { sha: id, shortSha: id.slice(0, 7) },
    relation: 'primary',
    confidence: 'explicit',
    identifier: 'UNKNOWN',
    ...overrides,
  };
}

function buttonByText(scope: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(scope.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === text,
  ) as HTMLButtonElement | undefined;
}

describe('UnattributedChanges', () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = async (ui: ReactNode) => {
    await act(async () => {
      root.render(ui);
    });
    await act(async () => {});
  };

  const openAssignDialog = async (index = 0) => {
    const rows = host.querySelectorAll('[data-testid="unattributed-row"]');
    const row = rows[index] as HTMLElement | undefined;
    expect(row).toBeTruthy();
    const button = buttonByText(row!, '指派');
    expect(button).toBeTruthy();
    await act(async () => {
      button!.click();
    });
    await act(async () => {});
    await act(async () => {});
    return document.querySelector<HTMLInputElement>('input#attribution-assign-input');
  };

  beforeAll(() => {
    if (typeof globalThis.ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }
    if (typeof Element.prototype.getAnimations === 'undefined') {
      Element.prototype.getAnimations = () => [];
    }
  });

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    useAttribution.setState(ATTRIBUTION_INITIAL, false);
    useApp.setState({ toast: null, settings: null, items: [] });
    apiMocks.assignChangeWorkitem.mockResolvedValue(true);
    apiMocks.resolveWorkitemIdentifiers.mockResolvedValue([]);
    apiMocks.listWorkitemChanges.mockResolvedValue({ items: [], nextBefore: null });
    apiMocks.listUnattributedChanges.mockResolvedValue({ items: [], nextBefore: null });
    apiMocks.getAttributionStatus.mockResolvedValue({ syncing: false, repos: [] });
    apiMocks.syncAttribution.mockResolvedValue({ startedAt: 1, finishedAt: 2, repos: [] });

    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    document.querySelectorAll('.modal__backdrop').forEach((node) => node.remove());
  });

  it('默认只展示前 5 条并给出剩余计数', async () => {
    const items = Array.from({ length: 6 }, (_, index) =>
      change(`commit:7:${index}${'abcdef'.slice(0, 6)}`, {
        title: `待归属提交 ${index}`,
        externalId: `${index}abcdef`,
        payload: { sha: `${index}abcdef`, shortSha: `${index}abc` },
      }),
    );
    useAttribution.setState({ unassigned: items });
    await render(<UnattributedChanges />);

    expect(host.textContent).toContain('待归属变更 (6)');
    expect(host.querySelectorAll('[data-testid="unattributed-row"]')).toHaveLength(5);
    expect(host.textContent).toContain('还有 1 条待归属变更未展示');
    expect(host.textContent).toContain('trade-service');
    expect(host.textContent).toContain('待归属提交 0');
  });

  it('输入编号解析成功后调用 assign，条目从列表消失', async () => {
    const first = change('commit:7:aaa111', {
      title: '修复时间线空态',
      externalId: 'aaa111',
      payload: { sha: 'aaa111', shortSha: 'aaa111' },
    });
    const second = change('commit:7:bbb222', {
      title: '另一个待归属提交',
      externalId: 'bbb222',
      payload: { sha: 'bbb222', shortSha: 'bbb222' },
    });
    useAttribution.setState({ unassigned: [first, second] });
    apiMocks.resolveWorkitemIdentifiers.mockResolvedValue([
      { identifier: 'TASK-202', workitemId: 'wi-202', category: 'Task' },
    ]);

    await render(<UnattributedChanges />);
    expect(host.textContent).toContain('待归属变更 (2)');

    const input = await openAssignDialog(0);
    expect(input).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, 'TASK-202');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const confirm = buttonByText(document, '确认指派');
    expect(confirm).toBeTruthy();
    await act(async () => {
      confirm!.click();
    });
    await act(async () => {});
    await act(async () => {});

    expect(apiMocks.resolveWorkitemIdentifiers).toHaveBeenCalledWith({ identifiers: ['TASK-202'] });
    expect(apiMocks.assignChangeWorkitem).toHaveBeenCalledWith({
      eventId: first.id,
      workitemId: 'wi-202',
      relation: 'primary',
    });

    expect(useAttribution.getState().unassigned.map((item) => item.id)).toEqual([second.id]);
    expect(host.textContent).not.toContain('修复时间线空态');
    expect(host.textContent).toContain('待归属变更 (1)');
    expect(document.querySelector('input#attribution-assign-input')).toBeNull();
  });

  it('编号解析不到工作项时在弹窗内给出中文提示且不调用 assign', async () => {
    useAttribution.setState({ unassigned: [change('commit:7:ccc333')] });
    apiMocks.resolveWorkitemIdentifiers.mockResolvedValue([
      { identifier: 'TASK-999', error: '工作项不存在' },
    ]);

    await render(<UnattributedChanges />);
    const input = await openAssignDialog(0);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, 'TASK-999');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const confirm = buttonByText(document, '确认指派');
    await act(async () => {
      confirm!.click();
    });
    await act(async () => {});
    await act(async () => {});

    expect(document.body.textContent).toContain('未找到该工作项：工作项不存在');
    expect(apiMocks.assignChangeWorkitem).not.toHaveBeenCalled();
    expect(host.textContent).toContain('待归属变更 (1)');
  });

  it('空队列不渲染任何内容', async () => {
    await render(<UnattributedChanges />);
    expect(host.querySelector('[data-testid="unattributed-changes"]')).toBeNull();
    expect(host.textContent).toBe('');
  });
});