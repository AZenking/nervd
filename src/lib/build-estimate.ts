import * as api from '@/lib/api';
import { ciStatusInfo } from '@/lib/ci';

export const ESTIMATE_STORAGE_KEY = 'nervd:build_estimate_cache';

// 内存单例缓存
const estimateMemoryCache = new Map<string, number>();

// 初始化：从 localStorage 恢复已保存的历史构建耗时预估
function initEstimateCache(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(ESTIMATE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && v > 3000) {
          estimateMemoryCache.set(k, v);
        }
      }
    }
  } catch {
    // 忽略解析异常
  }
}

initEstimateCache();

function persistEstimateCache(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const obj: Record<string, number> = {};
    for (const [k, v] of estimateMemoryCache.entries()) {
      obj[k] = v;
    }
    localStorage.setItem(ESTIMATE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // 忽略持久化异常
  }
}

export interface EstimateTarget {
  type?: 'jenkins' | 'flow';
  provider?: string;
  connectionId?: string;
  jobFullName?: string;
  pipelineId?: number;
  repoId?: number;
}

/**
 * 计算构建目标的预估时长唯一缓存键
 */
export function getEstimateKey(target?: EstimateTarget | null): string | null {
  if (!target) return null;
  const isJenkins = target.type === 'jenkins' || target.provider?.toLowerCase().includes('jenkins');
  if (isJenkins && target.connectionId && target.jobFullName) {
    return `jenkins:${target.connectionId}:${target.jobFullName}`;
  }
  if (!isJenkins && target.pipelineId) {
    return `flow:${target.pipelineId}`;
  }
  if (target.repoId) {
    return `repo:${target.repoId}`;
  }
  return null;
}

/**
 * 读取已缓存的历史基准耗时 (ms)
 */
export function getCachedEstimate(key?: string | null): number | null {
  if (!key) return null;
  const val = estimateMemoryCache.get(key);
  return typeof val === 'number' && val > 3000 ? val : null;
}

/**
 * 写入或更新历史基准耗时 (ms)，自动同步至 localStorage
 */
export function setCachedEstimate(key?: string | null, durationMs?: number | null): void {
  if (!key || typeof durationMs !== 'number' || durationMs < 3000) return;
  estimateMemoryCache.set(key, Math.round(durationMs));
  persistEstimateCache();
}

/**
 * 清空预估缓存（主要用于单元测试与调试）
 */
export function clearEstimateCache(): void {
  estimateMemoryCache.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ESTIMATE_STORAGE_KEY);
    }
  } catch {
    // 忽略
  }
}

/**
 * 从历史 runs 列表中检索上一条成功构建的时长 (ms) 作为进度估算基准
 */
export function extractSuccessDuration(
  runs?: Array<{
    status?: string | null;
    durationMs?: number | null;
    startTime?: number | null;
    endTime?: number | null;
    runId?: string | number | null;
    pipelineRunId?: string | number | null;
  }>,
  currentRunId?: string | number | null,
): number | null {
  if (!runs || !runs.length) return null;
  for (const r of runs) {
    if (!r) continue;
    const itemRunId = r.runId ?? r.pipelineRunId;
    if (currentRunId && itemRunId && String(itemRunId) === String(currentRunId)) {
      continue;
    }
    const info = ciStatusInfo(r.status);
    if (info.tone === 'run') continue;
    if (info.tone === 'ok') {
      if (typeof r.durationMs === 'number' && r.durationMs > 3000) {
        return r.durationMs;
      }
      if (typeof r.startTime === 'number' && typeof r.endTime === 'number' && r.endTime - r.startTime > 3000) {
        return r.endTime - r.startTime;
      }
    }
  }
  return null;
}

// 异步网络请求并发去重队列
const inFlightEstimates = new Map<string, Promise<number | null>>();

/**
 * 异步查询远端（Jenkins Job 运行历史或 Flow 流水线运行历史）的上一条成功构建耗时并写入缓存
 */
export async function fetchJobEstimate(
  target: EstimateTarget,
  currentRunId?: string | number | null,
): Promise<number | null> {
  const key = getEstimateKey(target);
  if (!key) return null;

  const cached = getCachedEstimate(key);
  if (cached) return cached;

  if (inFlightEstimates.has(key)) {
    return inFlightEstimates.get(key)!;
  }

  const promise = (async () => {
    try {
      const isJenkins = target.type === 'jenkins' || target.provider?.toLowerCase().includes('jenkins');
      if (isJenkins && target.connectionId && target.jobFullName) {
        const runs = await api.getJenkinsJobRuns(target.connectionId, target.jobFullName, 6);
        const duration = extractSuccessDuration(runs, currentRunId);
        if (duration) {
          setCachedEstimate(key, duration);
          return duration;
        }
      } else if (!isJenkins && target.pipelineId) {
        const runs = await api.listPipelineRuns(target.pipelineId, 6);
        const duration = extractSuccessDuration(runs, currentRunId);
        if (duration) {
          setCachedEstimate(key, duration);
          return duration;
        }
      }
    } catch {
      // 忽略单次网络异常
    }
    return null;
  })().finally(() => {
    inFlightEstimates.delete(key);
  });

  inFlightEstimates.set(key, promise);
  return promise;
}
