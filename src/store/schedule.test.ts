import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScheduleStore } from './schedule';

vi.mock('@/lib/api', () => ({
  triggerJenkinsJob: vi.fn(),
  startPipelineRun: vi.fn(),
  compareBranches: vi.fn(),
  listMergeRequests: vi.fn(),
  createMergeRequest: vi.fn(),
  mergeMergeRequest: vi.fn(),
  createBranch: vi.fn(),
}));

describe('useScheduleStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useScheduleStore.setState({
      tasks: [],
      logs: [],
      globalPaused: false,
      selectedTaskId: null,
      logDrawerOpen: false,
      editorOpen: false,
      editingTask: null,
    });
  });

  it('creates task and calculates initial nextRunAt', () => {
    const task = useScheduleStore.getState().createTask({
      name: '每日构建',
      cron: '0 2 * * *',
      action: {
        type: 'sync_workitems',
      },
    });

    expect(task.id).toBeDefined();
    expect(task.name).toBe('每日构建');
    expect(task.cronLabel).toBe('每天凌晨 02:00');
    expect(task.enabled).toBe(true);
    expect(task.nextRunAt).toBeDefined();
    expect(useScheduleStore.getState().tasks).toHaveLength(1);
  });

  it('updates task and recalculates nextRunAt on cron change', () => {
    const task = useScheduleStore.getState().createTask({
      name: '原任务',
      cron: '0 2 * * *',
      action: { type: 'sync_workitems' },
    });

    useScheduleStore.getState().updateTask(task.id, {
      name: '更新后任务',
      cron: '*/30 * * * *',
    });

    const updated = useScheduleStore.getState().tasks.find((t) => t.id === task.id);
    expect(updated?.name).toBe('更新后任务');
    expect(updated?.cron).toBe('*/30 * * * *');
    expect(updated?.cronLabel).toBe('每 30 分钟');
  });

  it('toggles task enabled state', () => {
    const task = useScheduleStore.getState().createTask({
      name: '测试切换',
      cron: '0 2 * * *',
      action: { type: 'sync_workitems' },
      enabled: true,
    });

    useScheduleStore.getState().toggleTask(task.id);
    expect(useScheduleStore.getState().tasks[0].enabled).toBe(false);
    expect(useScheduleStore.getState().tasks[0].nextRunAt).toBeUndefined();

    useScheduleStore.getState().toggleTask(task.id);
    expect(useScheduleStore.getState().tasks[0].enabled).toBe(true);
    expect(useScheduleStore.getState().tasks[0].nextRunAt).toBeDefined();
  });

  it('deletes task and clears logs', () => {
    const task = useScheduleStore.getState().createTask({
      name: '待删除',
      cron: '0 2 * * *',
      action: { type: 'sync_workitems' },
    });

    useScheduleStore.getState().recordLog({
      taskId: task.id,
      taskName: task.name,
      actionType: 'sync_workitems',
      triggerMode: 'manual',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 120,
      status: 'success',
    });

    expect(useScheduleStore.getState().logs).toHaveLength(1);

    useScheduleStore.getState().clearLogs(task.id);
    expect(useScheduleStore.getState().logs).toHaveLength(0);

    useScheduleStore.getState().deleteTask(task.id);
    expect(useScheduleStore.getState().tasks).toHaveLength(0);
  });

  it('toggles globalPaused switch', () => {
    expect(useScheduleStore.getState().globalPaused).toBe(false);
    useScheduleStore.getState().toggleGlobalPaused();
    expect(useScheduleStore.getState().globalPaused).toBe(true);
    useScheduleStore.getState().toggleGlobalPaused();
    expect(useScheduleStore.getState().globalPaused).toBe(false);
  });
});
