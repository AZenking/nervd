import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runTaskNow } from './use-schedule-runner';
import { useScheduleStore } from '@/store/schedule';
import { useApp } from '@/store/app';
import { toast } from '@/components/ui/toast';
import type { ScheduledTask } from '@/types/schedule';

vi.mock('@/lib/api', () => ({
  triggerJenkinsJob: vi.fn(),
  startPipelineRun: vi.fn(),
  getWorkitems: vi.fn().mockResolvedValue([]),
  compareBranches: vi.fn(),
  listMergeRequests: vi.fn(),
  createMergeRequest: vi.fn(),
  mergeMergeRequest: vi.fn(),
  createBranch: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    add: vi.fn(),
  },
}));

describe('useScheduleRunner -> runTaskNow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApp.setState({
      settings: {
        allowWriteOps: true,
      } as any,
    });
    useScheduleStore.setState({
      tasks: [],
      logs: [],
    });
  });

  it('does NOT trigger toast notification when scheduled task executes successfully', async () => {
    const task: ScheduledTask = {
      id: 'task-success',
      name: '同步工作项',
      enabled: true,
      cron: '0 2 * * *',
      action: {
        type: 'sync_workitems',
      },
      notifyOnSuccess: true,
      notifyOnFailure: true,
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useScheduleStore.setState({ tasks: [task] });

    await runTaskNow(task, 'scheduled');

    // Toast 不应在成功时触发
    expect(toast.add).not.toHaveBeenCalled();

    // 日志中记录应为成功
    const logs = useScheduleStore.getState().logs;
    expect(logs[0]?.status).toBe('success');
  });

  it('triggers error toast notification when scheduled task fails and notifyOnFailure is enabled', async () => {
    const task: ScheduledTask = {
      id: 'task-fail',
      name: 'Jenkins 触发任务',
      enabled: true,
      cron: '0 2 * * *',
      action: {
        type: 'jenkins',
        connectionId: 'conn-1',
        jobFullName: 'job-1',
      },
      notifyOnSuccess: true,
      notifyOnFailure: true,
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useScheduleStore.setState({ tasks: [task] });

    const api = await import('@/lib/api');
    vi.mocked(api.triggerJenkinsJob).mockRejectedValueOnce(new Error('Jenkins 连接超时'));

    await runTaskNow(task, 'scheduled');

    // Toast 应当在失败时弹出错误提示
    expect(toast.add).toHaveBeenCalledTimes(1);
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: expect.stringContaining('执行失败'),
      }),
    );

    const logs = useScheduleStore.getState().logs;
    expect(logs[0]?.status).toBe('failed');
  });
});
