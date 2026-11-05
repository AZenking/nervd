import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentMergeChangesPreview } from './RecentMergeChangesPreview';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import * as api from '@/lib/api';
import type { ScheduledTask } from '@/types/schedule';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
  }
});

vi.mock('@/lib/api', () => ({
  compareBranches: vi.fn(),
}));

describe('RecentMergeChangesPreview（定时任务分支合并变更点极简预览）', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  const baseTask: ScheduledTask = {
    id: 'task-merge-1',
    name: '每日分支同步',
    enabled: true,
    cron: '0 2 * * *',
    cronLabel: '每天 02:00',
    runCount: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-05T02:00:00Z',
    action: {
      type: 'branch_merge',
      repoId: 101,
      sourceBranch: 'dev',
      targetBranch: 'master',
      strategy: 'cautious',
    },
    notifyOnSuccess: false,
    notifyOnFailure: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useApp.setState({
      items: [
        {
          workitemId: 'w-101',
          identifier: 'REQ-101',
          subject: '多租户单点登录',
          category: 'Req',
          assignedTo: 'Alice',
          status: 'In Progress',
          updatedAt: '2026-11-02T00:00:00Z',
        },
      ],
      settings: {
        hasPat: true,
        organizationId: 'org-test',
        defaultSpaceIdentifier: 'space-test',
        linkPattern: '(?:REQ|BUG)[-_]?(\\d+)',
        watchedRepos: [],
        allowWriteOps: true,
        workitemRepos: {},
        branchRuleTemplates: [],
        workitemRepoBranchTemplates: {},
        jenkinsConnections: [],
        repoCiBindings: {},
      },
    });
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
    document.body.textContent = '';
  });

  const renderComponent = (task: ScheduledTask) => {
    act(() => {
      root?.render(<RecentMergeChangesPreview task={task} />);
    });
  };

  it('renders null if task action is not branch_merge', () => {
    const pipelineTask: ScheduledTask = {
      ...baseTask,
      action: { type: 'pipeline', pipelineId: 123 },
    };
    renderComponent(pipelineTask);
    expect(container?.firstChild).toBeNull();
  });

  it('renders unexecuted empty state when lastMergeChanges is undefined', () => {
    renderComponent(baseTask);
    const body = document.body.textContent ?? '';
    expect(body).toContain('尚未执行合并');
    expect(body).toContain('探测待合入变更');
  });

  it('renders recent merged changes compactly with commits, shortId, author, and workitems', () => {
    const taskWithChanges: ScheduledTask = {
      ...baseTask,
      lastMergeChanges: {
        commitsCount: 3,
        diffsCount: 5,
        targetBranch: 'master',
        sourceBranch: 'dev',
        strategy: 'cautious',
        syncedAt: '2026-11-05T02:00:00Z',
        status: 'merged',
        commits: [
          {
            id: '7a3f8b190abcdef123456789',
            shortId: '7a3f8b1',
            title: 'feat: 支持 REQ-101 单点登录',
            authorName: 'Alice',
            workitems: ['101'],
          },
          {
            id: 'c829e12000000000000000000',
            shortId: 'c829e12',
            title: 'fix: 修复订单展示问题',
            authorName: 'Bob',
          },
          {
            id: 'd999999000000000000000000',
            shortId: 'd999999',
            title: 'docs: 更新 README',
            authorName: 'Charlie',
          },
        ],
      },
    };

    renderComponent(taskWithChanges);
    const body = document.body.textContent ?? '';

    // 状态标识与变动文件统计
    expect(body).toContain('最近合入:');
    expect(body).toContain('7a3f8b1');
    expect(body).toContain('feat: 支持 REQ-101 单点登录');
    expect(body).toContain('Alice');
    expect(body).toContain('5 个文件变动');

    // 折叠提示 +2 条
    expect(body).toContain('+2 条');

    // 点击展开按钮
    const expandBtn = [...document.body.querySelectorAll('button')].find((el) =>
      el.textContent?.includes('+2 条'),
    );
    expect(expandBtn).toBeTruthy();

    act(() => {
      expandBtn?.click();
    });

    const updatedBody = document.body.textContent ?? '';
    expect(updatedBody).toContain('d999999');
    expect(updatedBody).toContain('docs: 更新 README');
    expect(updatedBody).toContain('收起');
  });

  it('navigates to workitem when clicking workitem badge', () => {
    const openWorkitemSpy = vi.spyOn(useUi.getState(), 'openWorkitem');
    const taskWithChanges: ScheduledTask = {
      ...baseTask,
      lastMergeChanges: {
        commitsCount: 1,
        targetBranch: 'master',
        sourceBranch: 'dev',
        strategy: 'cautious',
        syncedAt: '2026-11-05T02:00:00Z',
        status: 'merged',
        commits: [
          {
            id: '7a3f8b1',
            shortId: '7a3f8b1',
            title: 'feat: REQ-101',
            workitems: ['REQ-101'],
          },
        ],
      },
    };

    renderComponent(taskWithChanges);
    const badge = document.body.querySelector<HTMLButtonElement>('button[title="查看或复制需求 REQ-101"]');
    expect(badge).toBeTruthy();

    act(() => {
      badge?.click();
    });

    expect(openWorkitemSpy).toHaveBeenCalledWith(
      'w-101',
      expect.objectContaining({
        workitemId: 'w-101',
        identifier: 'REQ-101',
        subject: '多租户单点登录',
      }),
    );
  });

  it('renders up_to_date status when branches are clean', () => {
    const taskUpToDate: ScheduledTask = {
      ...baseTask,
      lastMergeChanges: {
        commitsCount: 0,
        targetBranch: 'master',
        sourceBranch: 'dev',
        strategy: 'cautious',
        syncedAt: '2026-11-05T02:00:00Z',
        status: 'up_to_date',
        commits: [],
      },
    };

    renderComponent(taskUpToDate);
    const body = document.body.textContent ?? '';
    expect(body).toContain('目标分支已对齐，无待合入改动');
  });

  it('probes pending changes on demand via compareBranches', async () => {
    vi.mocked(api.compareBranches).mockResolvedValueOnce({
      result: {
        commits: [
          {
            id: 'e111222',
            message: 'feat: 新开发的待合入功能',
            authorName: 'David',
          },
        ],
        diffs: [{ newPath: 'new.ts' }],
      },
    });

    renderComponent(baseTask);
    const probeBtn = [...document.body.querySelectorAll('button')].find((el) =>
      el.textContent?.includes('探测待合入变更'),
    );
    expect(probeBtn).toBeTruthy();

    await act(async () => {
      probeBtn?.click();
    });

    const body = document.body.textContent ?? '';
    expect(body).toContain('最新探测 (1):');
    expect(body).toContain('feat: 新开发的待合入功能');
    expect(body).toContain('e111222');
  });
});
