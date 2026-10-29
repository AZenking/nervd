// 全局常驻定时任务调度执行器（挂载于 Shell 顶层，10 秒心跳自愈）
import { useEffect, useRef } from 'react';
import * as api from '@/lib/api';
import { getNextRunTime } from '@/lib/cron';
import { executeBranchMerge } from '@/lib/branch-merge-runner';
import { useApp } from '@/store/app';
import { useScheduleStore } from '@/store/schedule';
import { toast } from '@/components/ui/toast';
import type { ScheduledTask, ScheduleExecutionLog } from '@/types/schedule';

const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * 跨平台桌面通知派发
 */
export async function sendSystemNotification(title: string, body: string) {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      );
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === 'granted';
      }
      if (granted) {
        sendNotification({ title, body });
        return;
      }
    }
  } catch {
    // 降级使用 Web Notification
  }

  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification(title, { body });
        }
      }
    }
  } catch {
    // 静默忽略
  }
}

/**
 * 执行单一调度任务核心逻辑（供定时器与手动点击立即执行复用）
 */
export async function runTaskNow(
  task: ScheduledTask,
  triggerMode: 'scheduled' | 'manual' = 'manual',
) {
  const allowWrite = useApp.getState().settings?.allowWriteOps ?? false;
  const isWriteOp =
    task.action.type === 'jenkins' ||
    task.action.type === 'pipeline' ||
    task.action.type === 'branch_merge';

  const startTime = Date.now();
  const startIso = new Date().toISOString();

  // 只读安全防线校验
  if (isWriteOp && !allowWrite) {
    const errorMsg = '写操作已拦截：客户端处于只读保护模式，请在「系统设置 → 安全」中开启允许写操作。';
    const finishedIso = new Date().toISOString();
    useScheduleStore.getState().recordLog({
      taskId: task.id,
      taskName: task.name,
      actionType: task.action.type,
      triggerMode,
      startedAt: startIso,
      finishedAt: finishedIso,
      durationMs: 0,
      status: 'failed',
      error: errorMsg,
    });
    useScheduleStore.setState((st) => ({
      tasks: st.tasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              lastRunAt: finishedIso,
              lastStatus: 'failed',
              lastDurationMs: 0,
              lastError: errorMsg,
            }
          : t,
      ),
    }));
    toast.add({
      title: `任务 [${task.name}] 拦截`,
      description: errorMsg,
      type: 'warning',
    });
    return;
  }

  // 先置状态为 running
  useScheduleStore.setState((st) => ({
    tasks: st.tasks.map((t) => (t.id === task.id ? { ...t, lastStatus: 'running' } : t)),
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
        details = `已按计划触发 Jenkins 构建: ${act.jobFullName}`;
        break;
      }
      case 'pipeline': {
        await api.startPipelineRun(act.pipelineId);
        details = `已按计划触发云效流水线: ID #${act.pipelineId}`;
        break;
      }
      case 'sync_workitems': {
        await useApp.getState().revalidateIfStale(0);
        await useApp.getState().loadIterations();
        details = '已按计划同步云效迭代与当前工作项';
        break;
      }
      case 'scan_branches': {
        await useApp.getState().loadRepos();
        details = '已按计划刷新仓库与集成分支扫描';
        break;
      }
      case 'branch_merge': {
        const res = await executeBranchMerge(act);
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
      default:
        break;
    }
  } catch (err: unknown) {
    status = 'failed';
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - startTime;
  const finishedIso = new Date().toISOString();
  const nextRun = getNextRunTime(task.cron);

  // 记录日志
  useScheduleStore.getState().recordLog({
    taskId: task.id,
    taskName: task.name,
    actionType: task.action.type,
    triggerMode,
    startedAt: startIso,
    finishedAt: finishedIso,
    durationMs,
    status,
    details,
    error: errorMessage,
    mergeResult,
  });

  // 更新任务元信息
  useScheduleStore.setState((st) => ({
    tasks: st.tasks.map((t) => {
      if (t.id !== task.id) return t;
      return {
        ...t,
        lastRunAt: finishedIso,
        lastStatus: status,
        lastDurationMs: durationMs,
        lastError: errorMessage,
        nextRunAt: nextRun ? nextRun.toISOString() : undefined,
        runCount: t.runCount + 1,
        updatedAt: finishedIso,
      };
    }),
  }));

  // 桌面通知与前台 Toast（执行成功不弹 Toast，仅在失败时向用户弹窗告警）
  const shouldNotify =
    (status === 'success' && task.notifyOnSuccess) ||
    (status === 'failed' && task.notifyOnFailure);

  if (shouldNotify) {
    const notifTitle = `nervd · 定时任务 [${task.name}] ${status === 'success' ? '执行成功' : '执行失败'}`;
    const notifBody = (errorMessage || details || '任务运行完毕').slice(0, 120);

    void sendSystemNotification(notifTitle, notifBody);

    // 定时任务执行成功无需前台 Toast 干扰，仅在失败时提醒
    if (status === 'failed') {
      toast.add({
        title: notifTitle,
        description: notifBody,
        type: 'error',
      });
    }
  }
}

export function useScheduleRunner() {
  const isRunningRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      // 避免重入与并发争用
      if (isRunningRef.current) return;

      const { tasks, globalPaused } = useScheduleStore.getState();
      if (globalPaused) return;

      const now = new Date();
      // 找出当前应当执行的任务（enabled 且当前时间到达或超过 nextRunAt）
      const dueTasks = tasks.filter((t) => {
        if (!t.enabled) return false;
        if (!t.nextRunAt) return false;
        return new Date(t.nextRunAt).getTime() <= now.getTime();
      });

      if (!dueTasks.length) return;

      isRunningRef.current = true;
      try {
        for (const task of dueTasks) {
          await runTaskNow(task, 'scheduled');
        }
      } finally {
        isRunningRef.current = false;
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);
}
