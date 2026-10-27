// 定时任务状态机与本地持久化存储
import { create } from 'zustand';
import { describeCron, getNextRunTime } from '@/lib/cron';
import type {
  BranchMergeExecutionResult,
} from '@/lib/branch-merge-runner';
import { executeBranchMerge } from '@/lib/branch-merge-runner';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import type {
  ScheduleAction,
  ScheduleExecutionLog,
  ScheduledTask,
} from '@/types/schedule';

const TASKS_STORAGE_KEY = 'nervd_scheduled_tasks';
const LOGS_STORAGE_KEY = 'nervd_scheduled_logs';
const PAUSED_STORAGE_KEY = 'nervd_scheduled_paused';
const MAX_LOGS_COUNT = 200;

function loadStoredTasks(): ScheduledTask[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list;
  } catch {
    return [];
  }
}

function loadStoredLogs(): ScheduleExecutionLog[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list;
  } catch {
    return [];
  }
}

function loadStoredPaused(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(PAUSED_STORAGE_KEY) === 'true';
}

function saveTasks(tasks: ScheduledTask[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}

function saveLogs(logs: ScheduleExecutionLog[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS_COUNT)));
}

function savePaused(paused: boolean) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PAUSED_STORAGE_KEY, paused ? 'true' : 'false');
}

export interface ScheduleStore {
  tasks: ScheduledTask[];
  logs: ScheduleExecutionLog[];
  globalPaused: boolean;
  selectedTaskId: string | null;
  logDrawerOpen: boolean;
  editorOpen: boolean;
  editingTask: ScheduledTask | null;

  createTask(data: {
    name: string;
    description?: string;
    cron: string;
    cronLabel?: string;
    action: ScheduleAction;
    notifyOnSuccess?: boolean;
    notifyOnFailure?: boolean;
    enabled?: boolean;
  }): ScheduledTask;
  addTask(data: {
    name: string;
    description?: string;
    cron: string;
    cronLabel?: string;
    action: ScheduleAction;
    notifyOnSuccess?: boolean;
    notifyOnFailure?: boolean;
    enabled?: boolean;
  }): ScheduledTask;

  updateTask(
    id: string,
    data: Partial<{
      name: string;
      description?: string;
      cron: string;
      cronLabel?: string;
      action: ScheduleAction;
      notifyOnSuccess: boolean;
      notifyOnFailure: boolean;
      enabled: boolean;
    }>,
  ): void;

  deleteTask(id: string): void;
  toggleTask(id: string, enabled?: boolean): void;
  toggleGlobalPaused(): void;
  setGlobalPaused(paused: boolean): void;

  recordLog(log: Omit<ScheduleExecutionLog, 'id'>): ScheduleExecutionLog;
  clearLogs(taskId?: string): void;

  openEditor(task?: ScheduledTask): void;
  closeEditor(): void;
  openLogDrawer(taskId?: string | null): void;
  closeLogDrawer(): void;

  executeTaskNow(id: string): Promise<void>;
}

export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  tasks: loadStoredTasks(),
  logs: loadStoredLogs(),
  globalPaused: loadStoredPaused(),
  selectedTaskId: null,
  logDrawerOpen: false,
  editorOpen: false,
  editingTask: null,

  createTask: (data) => {
    const nowIso = new Date().toISOString();
    const nextRun = getNextRunTime(data.cron);
    const cronLabel = describeCron(data.cron);

    const newTask: ScheduledTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: data.name.trim(),
      description: data.description?.trim(),
      cron: data.cron.trim(),
      cronLabel,
      action: data.action,
      enabled: data.enabled ?? true,
      notifyOnSuccess: data.notifyOnSuccess ?? false,
      notifyOnFailure: data.notifyOnFailure ?? true,
      createdAt: nowIso,
      updatedAt: nowIso,
      nextRunAt: nextRun ? nextRun.toISOString() : undefined,
      runCount: 0,
      lastStatus: 'idle',
    };

    const nextTasks = [newTask, ...get().tasks];
    saveTasks(nextTasks);
    set({ tasks: nextTasks });
    return newTask;
  },

  addTask: (data) => get().createTask(data),

  updateTask: (id, data) => {
    const nowIso = new Date().toISOString();
    const nextTasks = get().tasks.map((t) => {
      if (t.id !== id) return t;

      const nextCron = data.cron ? data.cron.trim() : t.cron;
      const nextRun = getNextRunTime(nextCron);
      const cronLabel = describeCron(nextCron);

      return {
        ...t,
        ...data,
        name: data.name ? data.name.trim() : t.name,
        description: data.description !== undefined ? data.description?.trim() : t.description,
        cron: nextCron,
        cronLabel,
        updatedAt: nowIso,
        nextRunAt: nextRun ? nextRun.toISOString() : t.nextRunAt,
      };
    });

    saveTasks(nextTasks);
    set({ tasks: nextTasks });
  },

  deleteTask: (id) => {
    const nextTasks = get().tasks.filter((t) => t.id !== id);
    saveTasks(nextTasks);
    set({ tasks: nextTasks });
  },

  toggleTask: (id, enabled) => {
    const nextTasks = get().tasks.map((t) => {
      if (t.id !== id) return t;
      const nextEnabled = enabled !== undefined ? enabled : !t.enabled;
      const nextRun = nextEnabled ? getNextRunTime(t.cron) : null;
      return {
        ...t,
        enabled: nextEnabled,
        nextRunAt: nextRun ? nextRun.toISOString() : undefined,
        updatedAt: new Date().toISOString(),
      };
    });
    saveTasks(nextTasks);
    set({ tasks: nextTasks });
  },

  toggleGlobalPaused: () => {
    const nextPaused = !get().globalPaused;
    savePaused(nextPaused);
    set({ globalPaused: nextPaused });
  },

  setGlobalPaused: (paused: boolean) => {
    savePaused(paused);
    set({ globalPaused: paused });
  },

  recordLog: (logInput) => {
    const log: ScheduleExecutionLog = {
      ...logInput,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };

    const nextLogs = [log, ...get().logs].slice(0, MAX_LOGS_COUNT);
    saveLogs(nextLogs);
    set({ logs: nextLogs });
    return log;
  },

  clearLogs: (taskId) => {
    const nextLogs = taskId ? get().logs.filter((l) => l.taskId !== taskId) : [];
    saveLogs(nextLogs);
    set({ logs: nextLogs });
  },

  openEditor: (task) => set({ editorOpen: true, editingTask: task ?? null }),
  closeEditor: () => set({ editorOpen: false, editingTask: null }),
  openLogDrawer: (taskId) => set({ logDrawerOpen: true, selectedTaskId: taskId ?? null }),
  closeLogDrawer: () => set({ logDrawerOpen: false }),

  executeTaskNow: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;

    // 标记为运行中
    const startIso = new Date().toISOString();
    const startTime = Date.now();

    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, lastStatus: 'running' } : t)),
    }));

    let status: 'success' | 'failed' = 'success';
    let details: string | undefined;
    let errorMessage: string | undefined;
    let mergeResult: ScheduleExecutionLog['mergeResult'];

    try {
      const act = task.action;
      switch (act.type) {
        case 'jenkins': {
          const params = act.parameters ?? {};
          await api.triggerJenkinsJob(0, act.connectionId, act.jobFullName, params);
          details = `已触发 Jenkins 构建: ${act.jobFullName}`;
          break;
        }
        case 'pipeline': {
          await api.startPipelineRun(act.pipelineId);
          details = `已触发云效流水线运行: ID #${act.pipelineId}`;
          break;
        }
        case 'sync_workitems': {
          await useApp.getState().revalidateIfStale(0);
          await useApp.getState().loadIterations();
          details = '已同步云效迭代与当前工作项状态';
          break;
        }
        case 'scan_branches': {
          // 刷新仓库列表与比较落差
          await useApp.getState().loadRepos();
          details = '已刷新云效仓库与集成分支扫描';
          break;
        }
        case 'branch_merge': {
          const res: BranchMergeExecutionResult = await executeBranchMerge(act);
          status = res.success ? 'success' : 'failed';
          details = res.message + (res.details ? ` (${res.details})` : '');
          if (!res.success) {
            errorMessage = res.message;
          }
          mergeResult = {
            strategy: res.strategy,
            sourceBranch: res.sourceBranch,
            targetBranch: res.targetBranch,
            conflictDetected: res.conflictDetected,
            conflictResolved: res.conflictResolved,
            shadowBranch: res.shadowBranch,
            mrId: res.mrId,
          };
          break;
        }
        default: {
          throw new Error(`未知的动作类型: ${(act as any)?.type}`);
        }
      }
    } catch (err: unknown) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - startTime;
    const finishedIso = new Date().toISOString();
    const nextRun = getNextRunTime(task.cron);

    // 记录日志
    get().recordLog({
      taskId: task.id,
      taskName: task.name,
      actionType: task.action.type,
      triggerMode: 'manual',
      startedAt: startIso,
      finishedAt: finishedIso,
      durationMs,
      status,
      details,
      error: errorMessage,
      mergeResult,
    });

    // 更新任务运行统计
    const nextTasks = get().tasks.map((t) => {
      if (t.id !== id) return t;
      return {
        ...t,
        lastRunAt: finishedIso,
        lastStatus: status,
        lastDurationMs: durationMs,
        lastError: errorMessage,
        nextRunAt: nextRun ? nextRun.toISOString() : t.nextRunAt,
        runCount: t.runCount + 1,
        updatedAt: finishedIso,
      };
    });

    saveTasks(nextTasks);
    set({ tasks: nextTasks });
  },
}));
