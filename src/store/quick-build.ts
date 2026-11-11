import { create } from 'zustand';
import * as api from '@/lib/api';
import { useApp } from './app';
import type { RepoSummary, Settings } from '@/types';
import { errorLog, humanizeError } from '@/lib/error-format';
import { statusMeta } from '@/components/StatusBadge';
import {
  getEstimateKey,
  getCachedEstimate,
  setCachedEstimate,
  extractSuccessDuration,
  fetchJobEstimate,
} from '@/lib/build-estimate';

export type BuildState = 'queued' | 'running' | 'success' | 'fail' | 'canceled' | 'unknown';

export interface BuildTriggerResult {
  targetKey: string;
  provider: 'flow' | 'jenkins';
  queueId?: string;
  runId?: string;
  submittedAt: number;
}

export interface QuickBuildTarget {
  id: string; // 唯一 key: `flow:${repoId}:${pipelineId}` 或 `jenkins:${repoId}:${connectionId}:${jobFullName}`
  targetKey?: string;
  type: 'flow' | 'jenkins';
  repoId: number;
  repoName: string;
  repoPathWithNamespace?: string;
  pipelineName: string;
  pipelineId?: number;
  connectionId?: string;
  connectionName?: string;
  jobFullName?: string;
  parameters?: Record<string, string>;
  environmentParameter?: string;
  branchParameter?: string;
  lastTriggeredAt?: number;
  triggerCount?: number;
  lastBuildState?: BuildState;
  estimatedDurationMs?: number;
  lastDurationMs?: number;
  isConfigured?: boolean;
  isStale?: boolean;
}

export interface TrackedBuild {
  id: string;
  target: QuickBuildTarget;
  state: BuildState;
  queueId?: string;
  runId?: string;
  parameters: Record<string, string>;
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  statusText?: string;
  error?: string;
  runNumber?: string | number;
  logUrl?: string;
  webUrl?: string;
  queueTimeout?: boolean;
  branch?: string;
  environment?: string;
  estimatedDurationMs?: number | null;
}

const MAX_HISTORY = 10;
const SENSITIVE_PARAM_REGEX = /token|password|secret|key|credential/i;
const QUEUE_TIMEOUT_MS = 45_000;

/** 过滤敏感参数，防止 Token/密码等落盘或在界面外泄 */
export function sanitizeParameters(parameters?: Record<string, string>): Record<string, string> {
  if (!parameters) return {};
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(parameters)) {
    if (!SENSITIVE_PARAM_REGEX.test(k)) {
      clean[k] = v;
    }
  }
  return clean;
}

/** 基于组织与空间隔离的 LocalStorage 键名 */
export function getHistoryStorageKey(orgId?: string | null, spaceId?: string | null): string {
  if (!orgId || !spaceId) {
    return 'nervd:quick-build-history:unscoped';
  }
  return `nervd:quick-build-history:${orgId}:${spaceId}`;
}

function loadStoredHistory(orgId?: string | null, spaceId?: string | null): QuickBuildTarget[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const effectiveOrgId = orgId ?? useApp.getState().settings?.organizationId;
    const effectiveSpaceId = spaceId ?? useApp.getState().settings?.defaultSpaceIdentifier;
    const key = getHistoryStorageKey(effectiveOrgId, effectiveSpaceId);
    let raw = window.localStorage.getItem(key);
    // 向后兼容未隔离的旧数据（仅当隔离键无数据时）
    if (!raw) {
      raw = window.localStorage.getItem('nervd:quick-build-history:unscoped');
    }
    if (!raw) {
      raw = window.localStorage.getItem('nervd:quick-build-history');
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof (item.targetKey || item.id) === 'string' && typeof item.repoId === 'number')
      .map((item) => ({
        ...item,
        id: item.targetKey || item.id,
        targetKey: item.targetKey || item.id,
        parameters: sanitizeParameters(item.parameters),
      }));
  } catch {
    return [];
  }
}

function persistHistory(history: QuickBuildTarget[], orgId?: string | null, spaceId?: string | null) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = getHistoryStorageKey(orgId, spaceId);
    const safeHistory = history.slice(0, MAX_HISTORY).map((item) => ({
      ...item,
      parameters: sanitizeParameters(item.parameters),
    }));
    window.localStorage.setItem(key, JSON.stringify(safeHistory));
  } catch {
    // 忽略存储超限异常
  }
}

interface QuickBuildState {
  history: QuickBuildTarget[];
  trackedBuilds: TrackedBuild[];
  triggeringIds: string[];
  /** 向后兼容的单字段 getter：返回当前正在触发的第一个目标 ID */
  triggeringId: string | null;

  isTriggering(targetKey: string): boolean;
  /** 根据组织/项目空间上下文刷新历史 */
  loadHistoryForContext(orgId?: string | null, spaceId?: string | null): void;
  /** 记录构建历史并持久化 */
  recordBuild(target: QuickBuildTarget, parameters?: Record<string, string>, state?: BuildState): void;
  /** 移除历史 */
  removeHistory(id: string): void;
  /** 清空历史 */
  clearHistory(): void;
  /** 移除一条跟踪记录 */
  dismissTrackedBuild(id: string): void;
  /** 更新指定构建任务的预估执行时长 (ms) */
  updateTrackedEstimatedDuration(id: string, estimatedDurationMs: number): void;
  /** 发起构建，返回触发结果与跟踪状态 */
  triggerQuickBuild(
    target: QuickBuildTarget,
    customParameters?: Record<string, string>,
  ): Promise<BuildTriggerResult | false>;
  /** 轮询当前所有活跃构建（排队与运行中） */
  pollTrackedBuilds(): Promise<void>;
}

let activePollTimer: ReturnType<typeof setInterval> | null = null;

export const useQuickBuild = create<QuickBuildState>((set, get) => ({
  history: loadStoredHistory(),
  trackedBuilds: [],
  triggeringIds: [],
  get triggeringId() {
    return get().triggeringIds[0] || null;
  },

  isTriggering(targetKey: string) {
    return get().triggeringIds.includes(targetKey);
  },

  loadHistoryForContext(orgId, spaceId) {
    const loaded = loadStoredHistory(orgId, spaceId);
    if (loaded.length > 0) {
      set({ history: loaded });
    }
  },

  recordBuild(target, parameters, state) {
    const current = get().history;
    const finalParams = sanitizeParameters(parameters || target.parameters);
    const key = target.targetKey || target.id;
    const existingIndex = current.findIndex((h) => (h.targetKey || h.id) === key);
    const existing = existingIndex >= 0 ? current[existingIndex] : null;

    const updated: QuickBuildTarget = {
      ...target,
      id: key,
      targetKey: key,
      parameters: finalParams,
      lastTriggeredAt: Date.now(),
      lastBuildState: state || existing?.lastBuildState,
      triggerCount: (existing?.triggerCount ?? 0) + 1,
    };

    const nextHistory = [
      updated,
      ...current.filter((h) => (h.targetKey || h.id) !== key),
    ].slice(0, MAX_HISTORY);

    const app = useApp.getState();
    persistHistory(nextHistory, app.settings?.organizationId, app.settings?.defaultSpaceIdentifier);
    set({ history: nextHistory });
  },

  removeHistory(id) {
    const nextHistory = get().history.filter((h) => (h.targetKey || h.id) !== id);
    const app = useApp.getState();
    persistHistory(nextHistory, app.settings?.organizationId, app.settings?.defaultSpaceIdentifier);
    set({ history: nextHistory });
  },

  clearHistory() {
    const app = useApp.getState();
    persistHistory([], app.settings?.organizationId, app.settings?.defaultSpaceIdentifier);
    set({ history: [] });
  },

  dismissTrackedBuild(id) {
    set({ trackedBuilds: get().trackedBuilds.filter((b) => b.id !== id) });
  },

  updateTrackedEstimatedDuration(id, estimatedDurationMs) {
    if (!id || typeof estimatedDurationMs !== 'number' || estimatedDurationMs <= 0) return;
    set((state) => ({
      trackedBuilds: state.trackedBuilds.map((b) =>
        b.id === id ? { ...b, estimatedDurationMs } : b,
      ),
    }));
  },

  async triggerQuickBuild(target, customParameters) {
    const app = useApp.getState();
    const allowWriteOps = app.settings?.allowWriteOps ?? false;

    if (!allowWriteOps) {
      app.setToast({
        text: '当前处于只读保护模式，无法发起构建。请前往「设置 → 安全策略」开启写操作。',
        kind: 'fail',
      });
      return false;
    }

    const key = target.targetKey || target.id;
    set((state) => ({
      triggeringIds: state.triggeringIds.includes(key)
        ? state.triggeringIds
        : [...state.triggeringIds, key],
      triggeringId: key,
    }));

    try {
      const effectiveParams = customParameters || target.parameters || {};
      const branchParamName = target.branchParameter || 'branch';
      const envParamName = target.environmentParameter || 'ENV';
      const branchVal = effectiveParams[branchParamName] || undefined;
      const envVal = effectiveParams[envParamName] || undefined;

      if (target.type === 'flow') {
        let triggerRes: any;
        if (target.pipelineId) {
          triggerRes = await api.startPipelineRun(target.pipelineId, effectiveParams);
        } else {
          triggerRes = await api.triggerRepoCi(target.repoId, effectiveParams);
        }

        const runId = triggerRes?.pipelineRunId || triggerRes?.runId ? String(triggerRes.pipelineRunId || triggerRes.runId) : undefined;
        const now = Date.now();
        const estimateKey = getEstimateKey(target);
        const initialEstimate = getCachedEstimate(estimateKey) ?? target.estimatedDurationMs ?? target.lastDurationMs ?? null;

        const tracked: TrackedBuild = {
          id: `flow-${target.pipelineId || target.repoId}-${now}`,
          target: { ...target, targetKey: key, id: key },
          state: 'running',
          runId,
          runNumber: runId,
          parameters: effectiveParams,
          submittedAt: now,
          startedAt: now,
          statusText: '已提交 · 云效 Flow 构建中',
          branch: branchVal,
          environment: envVal,
          estimatedDurationMs: initialEstimate,
        };

        set((state) => ({
          trackedBuilds: [tracked, ...state.trackedBuilds.filter((b) => b.target.id !== key || b.state !== 'queued')],
        }));

        if (!initialEstimate) {
          void fetchJobEstimate(target, runId).then((dur) => {
            if (dur) {
              get().updateTrackedEstimatedDuration(tracked.id, dur);
            }
          });
        }

        app.markRepoCiActive(90_000);
        app.setToast({
          text: `已触发 ${target.repoName} 的云效流水线`,
          kind: 'ok',
        });
        void app.loadRepoCi(target.repoId);
        get().recordBuild(target, effectiveParams, 'running');

        // 启动轮询
        ensurePolling(get);

        return {
          targetKey: key,
          provider: 'flow',
          runId,
          submittedAt: now,
        };
      }

      if (target.type === 'jenkins') {
        if (!target.connectionId || !target.jobFullName) {
          throw new Error('未配置有效的 Jenkins 实例或任务名称');
        }

        const res = await api.triggerJenkinsJob(
          target.repoId,
          target.connectionId,
          target.jobFullName,
          effectiveParams,
        );

        const queueId = res?.queueId;
        const now = Date.now();
        const estimateKey = getEstimateKey(target);
        const initialEstimate = getCachedEstimate(estimateKey) ?? target.estimatedDurationMs ?? target.lastDurationMs ?? null;

        // 拼接外部直达链接
        let webUrl: string | undefined;
        const conn = app.settings?.jenkinsConnections?.find((c) => c.id === target.connectionId);
        if (conn?.baseUrl && target.jobFullName) {
          const trimmed = conn.baseUrl.replace(/\/+$/, '');
          const parts = target.jobFullName.split('/').filter(Boolean).map(encodeURIComponent);
          webUrl = queueId
            ? `${trimmed}/queue/item/${queueId}/`
            : `${trimmed}/job/${parts.join('/job/')}/`;
        }

        const tracked: TrackedBuild = {
          id: `jenkins-${target.connectionId}-${target.jobFullName}-${now}`,
          target: { ...target, targetKey: key, id: key },
          state: 'queued',
          queueId,
          parameters: effectiveParams,
          submittedAt: now,
          statusText: '已提交 · 等待 Jenkins 执行器',
          webUrl,
          branch: branchVal,
          environment: envVal,
          estimatedDurationMs: initialEstimate,
        };

        set((state) => ({
          trackedBuilds: [tracked, ...state.trackedBuilds.filter((b) => b.target.id !== key || b.state !== 'queued')],
        }));

        if (!initialEstimate) {
          void fetchJobEstimate(target).then((dur) => {
            if (dur) {
              get().updateTrackedEstimatedDuration(tracked.id, dur);
            }
          });
        }

        app.markRepoCiActive(90_000);
        app.setToast({
          text: `已提交构建至 Jenkins 队列：${target.jobFullName}`,
          kind: 'ok',
        });
        void app.loadRepoCi(target.repoId);
        get().recordBuild(target, effectiveParams, 'queued');

        // 启动轮询
        ensurePolling(get);

        return {
          targetKey: key,
          provider: 'jenkins',
          queueId,
          submittedAt: now,
        };
      }

      return false;
    } catch (err) {
      errorLog('quick-build.trigger', err);
      app.setToast({
        text: `构建触发失败：${humanizeError(err, '请检查流水线或网络连接后重试')}`,
        kind: 'fail',
      });
      return false;
    } finally {
      set((state) => {
        const next = state.triggeringIds.filter((id) => id !== key);
        return {
          triggeringIds: next,
          triggeringId: next[0] || null,
        };
      });
    }
  },

  async pollTrackedBuilds() {
    const list = get().trackedBuilds;
    const active = list.filter((b) => b.state === 'queued' || b.state === 'running');
    if (active.length === 0) return;

    const now = Date.now();
    let updatedAny = false;
    const nextList = [...list];

    for (let i = 0; i < nextList.length; i++) {
      const item = nextList[i];
      if (item.state !== 'queued' && item.state !== 'running') continue;

      if (item.target.type === 'jenkins' && item.target.connectionId && item.target.jobFullName) {
        if (item.state === 'queued') {
          // 1. 排队超时检测
          if (now - item.submittedAt > QUEUE_TIMEOUT_MS && !item.queueTimeout) {
            nextList[i] = {
              ...item,
              queueTimeout: true,
              statusText: '排队超时 · 等待 Jenkins 空闲执行器',
            };
            updatedAny = true;
          }

          // 2. 检查队列项状态
          if (item.queueId) {
            try {
              const qInfo = await api.getJenkinsQueueItem(item.target.connectionId, item.queueId);
              if (qInfo.executableNumber) {
                const runId = String(qInfo.executableNumber);
                nextList[i] = {
                  ...item,
                  state: 'running',
                  runId,
                  runNumber: runId,
                  startedAt: now,
                  queueTimeout: false,
                  statusText: '正在构建',
                };
                if (!item.estimatedDurationMs) {
                  const targetRef = item.target;
                  const itemId = item.id;
                  void fetchJobEstimate(targetRef, runId).then((dur) => {
                    if (dur) {
                      get().updateTrackedEstimatedDuration(itemId, dur);
                    }
                  });
                }
                updatedAny = true;
                continue;
              } else if (qInfo.cancelled) {
                nextList[i] = {
                  ...item,
                  state: 'canceled',
                  completedAt: now,
                  statusText: '已在队列中取消',
                };
                updatedAny = true;
                continue;
              } else if (qInfo.leftQueue) {
                // 已离开队列，查询最新 runs 匹配
                const runs = await api.getJenkinsJobRuns(item.target.connectionId, item.target.jobFullName, 6);
                const prevDuration = extractSuccessDuration(runs);
                if (prevDuration) {
                  setCachedEstimate(getEstimateKey(item.target), prevDuration);
                }
                const latest = runs[0];
                if (latest) {
                  const tone = statusMeta(latest.status).tone;
                  const state: BuildState = tone === 'run' ? 'running' : tone === 'ok' ? 'success' : tone === 'fail' ? 'fail' : 'unknown';
                  const actualDuration = (typeof latest.durationMs === 'number' && latest.durationMs > 3000)
                    ? latest.durationMs
                    : (now - (latest.startTime || item.startedAt || item.submittedAt));
                  if (state === 'success' && actualDuration > 3000) {
                    setCachedEstimate(getEstimateKey(item.target), actualDuration);
                  }
                  nextList[i] = {
                    ...item,
                    state,
                    runId: latest.runId,
                    runNumber: latest.runId,
                    startedAt: latest.startTime || now,
                    completedAt: state !== 'running' ? now : undefined,
                    estimatedDurationMs: item.estimatedDurationMs || prevDuration || null,
                    statusText: state === 'running' ? '正在构建' : state === 'success' ? '构建成功' : '构建失败',
                  };
                  updatedAny = true;
                  continue;
                }
              }
            } catch {
              // 忽略轮询单次网络抖动
            }
          }
        } else if (item.state === 'running' && item.runId) {
          try {
            const runs = await api.getJenkinsJobRuns(item.target.connectionId, item.target.jobFullName, 6);
            const prevDuration = extractSuccessDuration(runs, item.runId);
            if (prevDuration) {
              setCachedEstimate(getEstimateKey(item.target), prevDuration);
              if (!nextList[i].estimatedDurationMs) {
                nextList[i] = {
                  ...nextList[i],
                  estimatedDurationMs: prevDuration,
                };
                updatedAny = true;
              }
            }
            const matched = runs.find((r) => r.runId === item.runId) || runs[0];
            if (matched) {
              const tone = statusMeta(matched.status).tone;
              if (tone !== 'run') {
                const state: BuildState = tone === 'ok' ? 'success' : tone === 'fail' ? 'fail' : 'canceled';
                const actualDuration = (typeof matched.durationMs === 'number' && matched.durationMs > 3000)
                  ? matched.durationMs
                  : (now - (item.startedAt || item.submittedAt));
                if (state === 'success' && actualDuration > 3000) {
                  setCachedEstimate(getEstimateKey(item.target), actualDuration);
                }
                nextList[i] = {
                  ...nextList[i],
                  state,
                  completedAt: now,
                  statusText: state === 'success' ? '构建成功' : state === 'fail' ? '构建失败' : '构建结束',
                };
                updatedAny = true;
              }
            }
          } catch {
            // 忽略
          }
        }
      } else if (item.target.type === 'flow' && item.target.pipelineId) {
        if (item.runId) {
          try {
            const detail: any = await api.getPipelineRun(item.target.pipelineId, Number(item.runId));
            const status = detail?.status || detail?.pipelineRun?.status;
            if (status) {
              const tone = statusMeta(status).tone;
              if (tone !== 'run') {
                const state: BuildState = tone === 'ok' ? 'success' : tone === 'fail' ? 'fail' : 'canceled';
                const actualDuration = now - (item.startedAt || item.submittedAt);
                if (state === 'success' && actualDuration > 3000) {
                  setCachedEstimate(getEstimateKey(item.target), actualDuration);
                }
                nextList[i] = {
                  ...nextList[i],
                  state,
                  completedAt: now,
                  statusText: state === 'success' ? '构建成功' : state === 'fail' ? '构建失败' : '构建结束',
                };
                updatedAny = true;
              }
            }
          } catch {
            // 忽略
          }
        }
      }
    }

    if (updatedAny) {
      set({ trackedBuilds: nextList });
    }
  },
}));

function ensurePolling(get: () => QuickBuildState) {
  if (activePollTimer) return;
  activePollTimer = setInterval(async () => {
    const active = get().trackedBuilds.filter((b) => b.state === 'queued' || b.state === 'running');
    if (active.length === 0) {
      if (activePollTimer) {
        clearInterval(activePollTimer);
        activePollTimer = null;
      }
      return;
    }
    await get().pollTrackedBuilds();
  }, 2500);
}

/**
 * 辅助选择器：从全局 AppState 提取所有已绑定 CI 的可用构建目标列表
 */
export function extractConfiguredBuildTargets(
  settings: Settings | null,
  repos: RepoSummary[],
): QuickBuildTarget[] {
  if (!settings || !settings.repoCiBindings) return [];

  const targets: QuickBuildTarget[] = [];
  const bindings = settings.repoCiBindings;
  const reposMap = new Map<number, RepoSummary>(repos.map((r) => [r.id, r]));
  const connectionsMap = new Map((settings.jenkinsConnections || []).map((c) => [c.id, c.name]));

  for (const [repoIdStr, binding] of Object.entries(bindings)) {
    const repoId = Number(repoIdStr);
    if (!repoId || isNaN(repoId)) continue;
    const repo = reposMap.get(repoId);
    const repoName = repo?.name || `仓库 #${repoId}`;
    const repoPathWithNamespace = repo?.pathWithNamespace;

    if (binding.provider === 'flow') {
      const targetKey = `flow:${repoId}:${binding.pipelineId}`;
      targets.push({
        id: targetKey,
        targetKey,
        type: 'flow',
        repoId,
        repoName,
        repoPathWithNamespace,
        pipelineId: binding.pipelineId,
        pipelineName: binding.pipelineName || '云效 Flow 流水线',
        branchParameter: (binding as any).branchParameter || 'branch',
        parameters: (binding as any).parameters,
        isConfigured: true,
      });
    } else if (binding.provider === 'jenkins') {
      const connName = connectionsMap.get(binding.connectionId) || 'Jenkins';
      const targetKey = `jenkins:${repoId}:${binding.connectionId}:${binding.jobFullName}`;
      targets.push({
        id: targetKey,
        targetKey,
        type: 'jenkins',
        repoId,
        repoName,
        repoPathWithNamespace,
        pipelineName: binding.jobFullName,
        connectionId: binding.connectionId,
        connectionName: connName,
        jobFullName: binding.jobFullName,
        parameters: binding.parameters,
        environmentParameter: binding.environmentParameter,
        branchParameter: binding.branchParameter,
        isConfigured: true,
      });
    }
  }

  return targets;
}

/**
 * 标注历史项是否过期/配置已变更（配置被删除或目标不可达）
 */
export function markHistoryStaleness(
  history: QuickBuildTarget[],
  configuredTargets: QuickBuildTarget[],
): QuickBuildTarget[] {
  const configuredMap = new Map(configuredTargets.map((t) => [t.targetKey || t.id, t]));
  return history.map((item) => {
    const key = item.targetKey || item.id;
    const configured = configuredMap.get(key);
    const isStale = !configured;
    return {
      ...item,
      targetKey: key,
      id: key,
      isConfigured: !isStale,
      isStale,
    };
  });
}
