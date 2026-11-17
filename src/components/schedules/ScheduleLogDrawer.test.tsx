import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleLogDrawer } from './ScheduleLogDrawer';
import type { ScheduleExecutionLog } from '@/types/schedule';

const scheduleState = vi.hoisted(() => ({
  tasks: [] as unknown[],
  logs: [] as unknown[],
  clearLogs: vi.fn(),
}));

vi.mock('@/store/schedule', () => ({
  useScheduleStore: (selector: (state: typeof scheduleState) => unknown) => selector(scheduleState),
}));

// ActionTypeTag 来自 SchedulesView（会拉起整页视图依赖），这里只验证日志抽屉本身
vi.mock('./SchedulesView', async () => {
  const { createElement } = await import('react');
  return {
    ActionTypeTag: (props: { type: string }) =>
      createElement('span', { 'data-testid': 'action-type-tag' }, props.type),
  };
});

function makeLog(partial: Partial<ScheduleExecutionLog>): ScheduleExecutionLog {
  return {
    id: 'log-1',
    taskId: 'task-1',
    taskName: '定时任务',
    actionType: 'jenkins',
    triggerMode: 'scheduled',
    startedAt: '2026-11-12T10:00:00+08:00',
    finishedAt: '2026-11-12T10:00:02+08:00',
    durationMs: 2000,
    status: 'success',
    ...partial,
  } as ScheduleExecutionLog;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  }
  if (typeof Element.prototype.getAnimations === 'undefined') {
    Element.prototype.getAnimations = () => [];
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

async function render() {
  await act(async () => {
    root.render(<ScheduleLogDrawer taskId={null} open onOpenChange={() => {}} />);
  });
}

describe('ScheduleLogDrawer 构建类成功日志语义', () => {
  it('jenkins / pipeline 成功日志标注「触发提交成功」并说明最终构建成功未确认', async () => {
    scheduleState.logs = [
      makeLog({
        id: 'log-jenkins',
        taskId: 'task-jenkins',
        taskName: 'Jenkins 构建',
        actionType: 'jenkins',
        details: '触发提交成功：已提交 Jenkins 构建触发 job-1；最终构建成功需在 Jenkins 查看（未轮询终态，不代表构建成功）',
      }),
      makeLog({
        id: 'log-pipeline',
        taskId: 'task-pipeline',
        taskName: '云效流水线',
        actionType: 'pipeline',
        details: '触发提交成功：已提交云效流水线运行触发 ID #42；最终构建成功需在云效 Flow 查看（未轮询终态，不代表构建成功）',
      }),
      makeLog({
        id: 'log-merge',
        taskId: 'task-merge',
        taskName: '分支合并',
        actionType: 'branch_merge',
        details: '已合并 release/1.0 → master',
      }),
      makeLog({
        id: 'log-sync',
        taskId: 'task-sync',
        taskName: '同步工作项',
        actionType: 'sync_workitems',
        details: '已按计划同步云效迭代与当前工作项',
      }),
    ];

    await render();

    // 仅构建类成功日志带「触发提交成功」标识与未确认说明
    expect(document.querySelectorAll('[data-testid="build-trigger-success-chip"]').length).toBe(2);
    expect(document.querySelectorAll('[data-testid="build-trigger-unconfirmed-hint"]').length).toBe(2);
    const text = document.body.textContent ?? '';
    expect(text).toContain('触发提交成功');
    expect(text).toContain('最终构建成功未确认');
    expect(text).toContain('请在 Jenkins / 云效 Flow 中查看实际构建结果');
  });

  it('分支合并 / 同步类成功日志语义不变，不出现构建触发标识', async () => {
    scheduleState.logs = [
      makeLog({
        id: 'log-merge',
        taskId: 'task-merge',
        taskName: '分支合并',
        actionType: 'branch_merge',
        details: '已合并 release/1.0 → master',
      }),
      makeLog({
        id: 'log-sync',
        taskId: 'task-sync',
        taskName: '同步工作项',
        actionType: 'sync_workitems',
        details: '已按计划同步云效迭代与当前工作项',
      }),
    ];

    await render();

    expect(document.querySelector('[data-testid="build-trigger-success-chip"]')).toBeNull();
    expect(document.querySelector('[data-testid="build-trigger-unconfirmed-hint"]')).toBeNull();
    expect(document.body.textContent).toContain('已合并 release/1.0 → master');
  });

  it('构建类失败日志不显示触发成功标识', async () => {
    scheduleState.logs = [
      makeLog({
        id: 'log-fail',
        taskId: 'task-fail',
        taskName: 'Jenkins 构建',
        actionType: 'jenkins',
        status: 'failed',
        details: undefined,
        error: 'Jenkins 连接超时',
      }),
    ];

    await render();

    expect(document.querySelector('[data-testid="build-trigger-success-chip"]')).toBeNull();
    expect(document.querySelector('[data-testid="build-trigger-unconfirmed-hint"]')).toBeNull();
    expect(document.body.textContent).toContain('Jenkins 连接超时');
  });
});