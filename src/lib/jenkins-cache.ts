import * as api from './api';
import type { JenkinsJobSummary, JenkinsJobParameter } from '../types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/** 默认缓存配置 */
export const JENKINS_CACHE_CONFIG = {
  /** 3 分钟新鲜期：在此时间内直接返回缓存，0ms 响应，零网络开销 */
  JOBS_TTL_MS: 3 * 60 * 1000,
  /** 15 分钟最大宽限期：在此时间内先返回陈旧缓存以保即时展示，同时后台静默向远端同步最新数据（SWR） */
  JOBS_STALE_MS: 15 * 60 * 1000,
  /** 参数缓存 5 分钟新鲜期 */
  PARAMS_TTL_MS: 5 * 60 * 1000,
};

// 内存单例缓存池
const jobsCache = new Map<string, CacheEntry<JenkinsJobSummary[]>>();
const paramsCache = new Map<string, CacheEntry<JenkinsJobParameter[]>>();

// 网络并发去重池（防止同一时刻重复发出多个相同连接请求）
const inFlightJobs = new Map<string, Promise<JenkinsJobSummary[]>>();
const inFlightParams = new Map<string, Promise<JenkinsJobParameter[]>>();

export interface FetchJobsOptions {
  /** 是否强制跳过缓存直接向远端拉取最新数据（如用户主动点击刷新按钮） */
  force?: boolean;
  /** 当命中了陈旧缓存（SWR）触发后台静默重验时，获取到远端最新数据后的回调 */
  onStaleUpdate?: (freshJobs: JenkinsJobSummary[]) => void;
}

/**
 * 获取指定 Jenkins 实例的 Job 列表（支持内存缓存、TTL、SWR 与并发去重）
 */
export async function getCachedJenkinsJobs(
  connectionId: string,
  options?: FetchJobsOptions,
): Promise<{ jobs: JenkinsJobSummary[]; fromCache: boolean; isStale: boolean }> {
  if (!connectionId) {
    return { jobs: [], fromCache: false, isStale: false };
  }

  const now = Date.now();
  const cached = jobsCache.get(connectionId);
  const isForce = Boolean(options?.force);

  // 1. 如果命中且处于新鲜期 (TTL 内)，且未要求强制刷新：瞬时返回
  if (!isForce && cached && now - cached.timestamp <= JENKINS_CACHE_CONFIG.JOBS_TTL_MS) {
    return { jobs: cached.data, fromCache: true, isStale: false };
  }

  // 2. 如果处于陈旧宽限期 (Stale 且未超期) 且未强制刷新：SWR（返回旧缓存 + 后台异步静默刷新）
  if (!isForce && cached && now - cached.timestamp <= JENKINS_CACHE_CONFIG.JOBS_STALE_MS) {
    // 后台静默重验
    if (!inFlightJobs.has(connectionId)) {
      const backgroundPromise = api.listJenkinsJobs(connectionId)
        .then((freshJobs) => {
          jobsCache.set(connectionId, { data: freshJobs, timestamp: Date.now() });
          options?.onStaleUpdate?.(freshJobs);
          return freshJobs;
        })
        .finally(() => {
          inFlightJobs.delete(connectionId);
        });
      inFlightJobs.set(connectionId, backgroundPromise);
    }
    return { jobs: cached.data, fromCache: true, isStale: true };
  }

  // 3. 无缓存、已彻底过期或用户强制刷新：发起网络请求（并发去重）
  let request = inFlightJobs.get(connectionId);
  if (!request || isForce) {
    request = api.listJenkinsJobs(connectionId)
      .then((items) => {
        jobsCache.set(connectionId, { data: items, timestamp: Date.now() });
        return items;
      })
      .finally(() => {
        inFlightJobs.delete(connectionId);
      });
    inFlightJobs.set(connectionId, request);
  }

  const result = await request;
  return { jobs: result, fromCache: false, isStale: false };
}

/**
 * 获取指定 Job 的参数定义（带 5 分钟内存缓存）
 */
export async function getCachedJenkinsJobParameters(
  connectionId: string,
  jobFullName: string,
  options?: { force?: boolean },
): Promise<JenkinsJobParameter[]> {
  if (!connectionId || !jobFullName) {
    return [];
  }

  const cacheKey = `${connectionId}:::${jobFullName}`;
  const now = Date.now();
  const cached = paramsCache.get(cacheKey);

  if (!options?.force && cached && now - cached.timestamp <= JENKINS_CACHE_CONFIG.PARAMS_TTL_MS) {
    return cached.data;
  }

  let request = inFlightParams.get(cacheKey);
  if (!request || options?.force) {
    request = api.getJenkinsJobParameters(connectionId, jobFullName)
      .then((params) => {
        paramsCache.set(cacheKey, { data: params, timestamp: Date.now() });
        return params;
      })
      .finally(() => {
        inFlightParams.delete(cacheKey);
      });
    inFlightParams.set(cacheKey, request);
  }

  return await request;
}

/**
 * 手动清除缓存（可针对指定实例或全局清空）
 */
export function invalidateJenkinsCache(connectionId?: string): void {
  if (connectionId) {
    jobsCache.delete(connectionId);
    for (const key of paramsCache.keys()) {
      if (key.startsWith(`${connectionId}:::`)) {
        paramsCache.delete(key);
      }
    }
  } else {
    jobsCache.clear();
    paramsCache.clear();
  }
}

/**
 * 检查指定连接的 Job 是否已在缓存中
 */
export function hasCachedJobs(connectionId: string): boolean {
  return jobsCache.has(connectionId);
}
