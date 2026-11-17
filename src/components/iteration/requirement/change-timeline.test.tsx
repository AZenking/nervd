// ChangeTimeline：加载骨架 / 空态 / 日期分组 / 事件卡 / 加载更多 / 错误重试 / 同步。
// 采用真实 `useAttribution` store + mock attribution-api，覆盖组件与 store 的最小集成路径。
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkitemChange } from '@/types/attribution';
import { useAttribution } from '@/store/attribution';
import { useApp } from '@/store/app';
import { ChangeTimeline } from './change-timeline';

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

function daysAgo(days: number, hour = 12): number {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.getTime();
}

function change(
  id: string,
  overrides: Partial<WorkitemChange> = {},
): WorkitemChange {
  return {
    id,
    repoId: 1,
    repoName: 'trade-service',
    kind: 'commit',
    externalId: id.replace('commit:1:', ''),
    branch: 'feature/req-101',
    title: `提交 ${id}`,
    occurredAt: Date.now(),
    source: 'remote',
    pushed: true,
    backfilled: false,
    payload: { sha: id.replace('commit:1:', '') },
    relation: 'primary',
    confidence: 'explicit',
    identifier: 'REQ-101',
    workitemId: 'wi-1',
    ...overrides,
  };
}

const commitChange = change('commit:1:7a3f8b1', {
  occurredAt: daysAgo(0),
  title: 'feat: 支持变更时间线',
  payload: {
    sha: '7a3f8b1c0d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a',
    shortSha: '7a3f8b1',
    message: 'feat: 支持变更时间线',
    author: '林益生',
    additions: 42,
    deletions: 7,
    filesChanged: 3,
    files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
  },
});

const mrChange = change('mr:1:12', {
  kind: 'mr',
  externalId: '12',
  occurredAt: daysAgo(1),
  title: 'feat: 时间线联调',
  payload: {
    localId: 12,
    state: 'merged',
    sourceBranch: 'feature/req-101',
    targetBranch: 'master',
    author: '周若',
  },
});

const buildChange = change('build:flow:1:142', {
  kind: 'build',
  externalId: '142',
  occurredAt: daysAgo(10),
  title: '流水线构建',
  payload: {
    runId: '142',
    provider: 'flow',
    status: 'failed',
    durationMs: 83_000,
    stage: '构建',
  },
});

describe('ChangeTimeline', () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = async (ui: ReactNode) => {
    await act(async () => {
      root.render(ui);
    });
    await act(async () => {});
    await act(async () => {});
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
    useApp.setState({ toast: null, settings: null });
    apiMocks.listWorkitemChanges.mockResolvedValue({ items: [], nextBefore: undefined });
    apiMocks.listUnattributedChanges.mockResolvedValue({ items: [], nextBefore: undefined });
    apiMocks.getAttributionStatus.mockResolvedValue({ syncing: false, repos: [] });
    apiMocks.syncAttribution.mockResolvedValue({ startedAt: 1, finishedAt: 2, repos: [] });
    apiMocks.assignChangeWorkitem.mockResolvedValue(true);
    apiMocks.resolveWorkitemIdentifiers.mockResolvedValue([]);

    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
  });

  it('加载中渲染与事件卡同高的精准骨架', async () => {
    apiMocks.listWorkitemChanges.mockImplementation(() => new Promise(() => {}));
    await render(<ChangeTimeline workitemId="wi-1" identifier="REQ-101" />);

    expect(host.querySelector('[data-testid="change-timeline-skeleton"]')).not.toBeNull();
    expect(host.textContent).toContain('代码变更');
    expect(host.textContent).not.toContain('暂无代码变更');
  });

  it('空态展示统一 EmptyHint 文案', async () => {
    await render(<ChangeTimeline workitemId="wi-1" identifier="REQ-101" />);

    expect(host.textContent).toContain('暂无代码变更');
    expect(host.textContent).toContain('提交、MR、构建会自动汇总到这里');
    expect(apiMocks.listWorkitemChanges).toHaveBeenCalledWith(
      expect.objectContaining({ workitemId: 'wi-1', includeRollup: true }),
    );
  });

  it('按本地日期倒序分组并渲染 commit / MR / 构建三类事件卡', async () => {
    apiMocks.listWorkitemChanges.mockResolvedValue({
      items: [commitChange, mrChange, buildChange],
      nextBefore: null,
    });
    await render(<ChangeTimeline workitemId="wi-1" identifier="REQ-101" />);

    const headers = host.querySelectorAll('[data-testid="timeline-group-header"]');
    expect(headers).toHaveLength(3);
    expect(headers[0].textContent).toContain('今天');
    expect(headers[1].textContent).toContain('昨天');

    expect(host.querySelectorAll('[data-testid="change-event-card"][data-kind="commit"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-testid="change-event-card"][data-kind="mr"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-testid="change-event-card"][data-kind="build"]')).toHaveLength(1);

    const text = host.textContent ?? '';
    expect(text).toContain('7a3f8b1');
    expect(text).toContain('feat: 支持变更时间线');
    expect(text).toContain('林益生');
    expect(text).toContain('feature/req-101');
    expect(text).toContain('+42');
    expect(text).toContain('-7');
    expect(text).toContain('3 个文件');
    expect(text).toContain('!12');
    expect(text).toContain('已合入');
    expect(text).toContain('master');
    expect(text).toContain('#142');
    expect(text).toContain('失败');
    expect(text).toContain('1 分 23 秒');
    expect(text).toContain('显式归属');

    // 事件按 occurredAt 倒序：今天 → 昨天 → 更早
    expect(text.indexOf('7a3f8b1')).toBeLessThan(text.indexOf('!12'));
    expect(text.indexOf('!12')).toBeLessThan(text.indexOf('#142'));
  });

  it('父需求隐藏 rollup commit 明细，仅保留 rollup MR 里程碑', async () => {
    const rollupCommit = change('commit:1:child11', {
      relation: 'rollup',
      workitemId: 'wi-parent',
      occurredAt: daysAgo(0, 10),
      title: '子项提交：实现接口',
      payload: {
        sha: 'child11',
        shortSha: 'child11',
        message: '子项提交：实现接口',
        author: '子项作者',
      },
    });
    const rollupMr = change('mr:1:42', {
      kind: 'mr',
      relation: 'rollup',
      workitemId: 'wi-parent',
      externalId: '42',
      occurredAt: daysAgo(1, 10),
      title: '子项 MR 合入',
      payload: {
        localId: 42,
        state: 'merged',
        sourceBranch: 'feature/task-1',
        targetBranch: 'master',
        author: '子项作者',
      },
    });
    apiMocks.listWorkitemChanges.mockResolvedValue({
      items: [rollupCommit, rollupMr],
      nextBefore: null,
    });

    await render(<ChangeTimeline workitemId="wi-parent" identifier="REQ-101" />);

    // rollup commit 折叠为一行计数，不渲染提交明细卡片
    expect(host.textContent).toContain('子项另有 1 个提交已汇总');
    expect(host.textContent).not.toContain('子项提交：实现接口');
    expect(
      host.querySelectorAll('[data-testid="change-event-card"][data-kind="commit"]'),
    ).toHaveLength(0);

    // rollup MR 是父需求里程碑，保留渲染
    expect(
      host.querySelectorAll('[data-testid="change-event-card"][data-kind="mr"]'),
    ).toHaveLength(1);
    expect(host.textContent).toContain('!42');
    expect(host.textContent).toContain('已合入');
    expect(host.querySelectorAll('[data-testid="timeline-group-header"]')).toHaveLength(1);
  });

  it('有分页游标时展示「加载更多」并继续追加', async () => {
    const older = change('commit:1:9c2d4e6', {
      occurredAt: daysAgo(3),
      title: 'fix: 补分页',
      payload: { sha: '9c2d4e6', shortSha: '9c2d4e6', message: 'fix: 补分页' },
    });
    apiMocks.listWorkitemChanges
      .mockResolvedValueOnce({ items: [commitChange], nextBefore: 100 })
      .mockResolvedValueOnce({ items: [older], nextBefore: null });

    await render(<ChangeTimeline workitemId="wi-1" />);
    const more = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('加载更多'),
    );
    expect(more).toBeTruthy();
    expect(host.textContent).not.toContain('9c2d4e6');

    await act(async () => {
      more!.click();
    });
    await act(async () => {});
    await act(async () => {});

    expect(apiMocks.listWorkitemChanges).toHaveBeenLastCalledWith(
      expect.objectContaining({ workitemId: 'wi-1', before: 100 }),
    );
    expect(host.textContent).toContain('9c2d4e6');
    expect(
      Array.from(host.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('加载更多'),
      ),
    ).toBe(false);
  });

  it('错误态展示可读错误并可重试', async () => {
    apiMocks.listWorkitemChanges
      .mockRejectedValueOnce(new Error('网络异常'))
      .mockResolvedValueOnce({ items: [commitChange], nextBefore: null });

    await render(<ChangeTimeline workitemId="wi-1" />);
    expect(host.textContent).toContain('变更时间线加载失败');
    expect(host.textContent).toContain('网络异常');

    const retry = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('重试'),
    );
    expect(retry).toBeTruthy();
    await act(async () => {
      retry!.click();
    });
    await act(async () => {});
    await act(async () => {});

    expect(host.textContent).toContain('7a3f8b1');
    expect(host.querySelector('[data-testid="change-timeline-error"]')).toBeNull();
  });

  it('工具行展示最近同步时间，同步按钮触发 syncNow', async () => {
    apiMocks.getAttributionStatus.mockResolvedValue({
      lastSyncAt: Date.now(),
      syncing: false,
      repos: [],
    });
    await render(<ChangeTimeline workitemId="wi-1" />);
    expect(host.textContent).toContain('最近同步');

    const syncButton = host.querySelector('button[aria-label="立即同步代码变更"]') as HTMLButtonElement | null;
    expect(syncButton).not.toBeNull();
    await act(async () => {
      syncButton!.click();
    });
    await act(async () => {});
    expect(apiMocks.syncAttribution).toHaveBeenCalledTimes(1);
  });

});