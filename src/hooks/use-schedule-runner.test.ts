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

describe('useScheduleRunner -> 构建类日志语义', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApp.setState({
      settings: {
        allowWriteOps: true,
      } as any,
    });
    useScheduleStore.setState({ tasks: [], logs: [] });
  });

  it('jenkins / pipeline 成功日志区分「触发提交成功」与「最终构建成功」', async () => {
    const jenkinsTask: ScheduledTask = {
      id: 'task-jenkins',
      name: 'Jenkins 构建',
      enabled: true,
      cron: '0 2 * * *',
      action: { type: 'jenkins', connectionId: 'conn-1', jobFullName: 'job-1' },
      notifyOnSuccess: false,
      notifyOnFailure: true,
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const pipelineTask: ScheduledTask = {
      ...jenkinsTask,
      id: 'task-pipeline',
      name: '云效流水线',
      action: { type: 'pipeline', pipelineId: 42 },
    };

    const api = await import('@/lib/api');
    vi.mocked(api.triggerJenkinsJob).mockResolvedValueOnce(undefined as any);
    vi.mocked(api.startPipelineRun).mockResolvedValueOnce(undefined as any);

    await runTaskNow(jenkinsTask, 'scheduled');
    await runTaskNow(pipelineTask, 'scheduled');

    const [pipelineLog, jenkinsLog] = useScheduleStore.getState().logs;
    expect(jenkinsLog.status).toBe('success');
    expect(jenkinsLog.details).toContain('触发提交成功');
    expect(jenkinsLog.details).toContain('最终构建成功');
    expect(jenkinsLog.details).toContain('未轮询终态');
    // 触发成功不得被表述为「构建成功」
    expect(jenkinsLog.details).not.toContain('构建成功；');

    expect(pipelineLog.actionType).toBe('pipeline');
    expect(pipelineLog.status).toBe('success');
    expect(pipelineLog.details).toContain('触发提交成功');
    expect(pipelineLog.details).toContain('最终构建成功');
    expect(pipelineLog.details).toContain('未轮询终态');
  });

  it('同步类任务日志语义不变（不出现触发提交/构建终态说明）', async () => {
    const syncTask: ScheduledTask = {
      id: 'task-sync',
      name: '同步工作项',
      enabled: true,
      cron: '0 2 * * *',
      action: { type: 'sync_workitems' },
      notifyOnSuccess: false,
      notifyOnFailure: true,
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await runTaskNow(syncTask, 'scheduled');

    const [log] = useScheduleStore.getState().logs;
    expect(log.status).toBe('success');
    expect(log.details).toContain('已按计划同步云效迭代与当前工作项');
    expect(log.details).not.toContain('触发提交成功');
    expect(log.details).not.toContain('最终构建成功');
  });
});
