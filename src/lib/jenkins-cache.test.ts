import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './api';
import {
  getCachedJenkinsJobs,
  getCachedJenkinsJobParameters,
  invalidateJenkinsCache,
  hasCachedJobs,
} from './jenkins-cache';
import type { JenkinsJobSummary, JenkinsJobParameter } from '../types';

vi.mock('./api', () => ({
  listJenkinsJobs: vi.fn(),
  getJenkinsJobParameters: vi.fn(),
}));

const MOCK_JOBS: JenkinsJobSummary[] = [
  { name: 'job-1', fullName: 'folder/job-1' },
  { name: 'job-2', fullName: 'folder/job-2' },
];

const MOCK_PARAMS: JenkinsJobParameter[] = [
  { name: 'BRANCH', type: 'StringParameterDefinition', defaultValue: 'master', choices: [] },
];

describe('jenkins-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateJenkinsCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('第一次请求应调用 api.listJenkinsJobs 并写入缓存', async () => {
    vi.mocked(api.listJenkinsJobs).mockResolvedValueOnce(MOCK_JOBS);

    const result = await getCachedJenkinsJobs('conn-1');

    expect(api.listJenkinsJobs).toHaveBeenCalledTimes(1);
    expect(result.jobs).toEqual(MOCK_JOBS);
    expect(result.fromCache).toBe(false);
    expect(hasCachedJobs('conn-1')).toBe(true);
  });

  it('在 TTL (3分钟) 内重复请求应直接走缓存，不发网络请求', async () => {
    vi.mocked(api.listJenkinsJobs).mockResolvedValueOnce(MOCK_JOBS);

    // 第一次
    await getCachedJenkinsJobs('conn-1');
    expect(api.listJenkinsJobs).toHaveBeenCalledTimes(1);

    // 1 分钟后再次请求
    vi.advanceTimersByTime(60 * 1000);
    const result2 = await getCachedJenkinsJobs('conn-1');

    expect(api.listJenkinsJobs).toHaveBeenCalledTimes(1); // 依然只有 1 次
    expect(result2.fromCache).toBe(true);
    expect(result2.isStale).toBe(false);
    expect(result2.jobs).toEqual(MOCK_JOBS);
  });

  it('在 Stale 宽限期 (3~15分钟) 内应返回旧数据并在后台触发静默更新 (SWR)', async () => {
    vi.mocked(api.listJenkinsJobs).mockResolvedValueOnce(MOCK_JOBS);
    await getCachedJenkinsJobs('conn-1');

    // 4 分钟后（超过 TTL 但未满 15 分钟）
    vi.advanceTimersByTime(4 * 60 * 1000);

    const freshJobs: JenkinsJobSummary[] = [
      ...MOCK_JOBS,
      { name: 'job-new', fullName: 'folder/job-new' },
    ];
    vi.mocked(api.listJenkinsJobs).mockResolvedValueOnce(freshJobs);

    const onStaleUpdate = vi.fn();
    const result = await getCachedJenkinsJobs('conn-1', { onStaleUpdate });

    // 立即返回旧缓存
    expect(result.fromCache).toBe(true);
    expect(result.isStale).toBe(true);
    expect(result.jobs).toEqual(MOCK_JOBS);

    // 等待后台微任务与 Promise 完成
    await vi.runAllTimersAsync();

    expect(api.listJenkinsJobs).toHaveBeenCalledTimes(2);
    expect(onStaleUpdate).toHaveBeenCalledWith(freshJobs);
  });

  it('force=true 强制刷新应直接调用 API 覆写缓存', async () => {
    vi.mocked(api.listJenkinsJobs).mockResolvedValueOnce(MOCK_JOBS);
    await getCachedJenkinsJobs('conn-1');

    const updatedJobs = [{ name: 'job-updated', fullName: 'job-updated' }];
    vi.mocked(api.listJenkinsJobs).mockResolvedValueOnce(updatedJobs);

    const result = await getCachedJenkinsJobs('conn-1', { force: true });

    expect(api.listJenkinsJobs).toHaveBeenCalledTimes(2);
    expect(result.fromCache).toBe(false);
    expect(result.jobs).toEqual(updatedJobs);
  });

  it('并发请求同一连接应合并去重只发一次请求', async () => {
    let resolveFn: (items: JenkinsJobSummary[]) => void;
    const pendingPromise = new Promise<JenkinsJobSummary[]>((resolve) => {
      resolveFn = resolve;
    });
    vi.mocked(api.listJenkinsJobs).mockReturnValueOnce(pendingPromise);

    // 两个并发调用
    const p1 = getCachedJenkinsJobs('conn-parallel');
    const p2 = getCachedJenkinsJobs('conn-parallel');

    expect(api.listJenkinsJobs).toHaveBeenCalledTimes(1);

    resolveFn!(MOCK_JOBS);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.jobs).toEqual(MOCK_JOBS);
    expect(r2.jobs).toEqual(MOCK_JOBS);
  });

  it('Job 参数应支持缓存', async () => {
    vi.mocked(api.getJenkinsJobParameters).mockResolvedValueOnce(MOCK_PARAMS);

    const p1 = await getCachedJenkinsJobParameters('conn-1', 'job-a');
    expect(p1).toEqual(MOCK_PARAMS);
    expect(api.getJenkinsJobParameters).toHaveBeenCalledTimes(1);

    // 第二次获取同一 Job 的参数，直接走缓存
    const p2 = await getCachedJenkinsJobParameters('conn-1', 'job-a');
    expect(p2).toEqual(MOCK_PARAMS);
    expect(api.getJenkinsJobParameters).toHaveBeenCalledTimes(1);

    // 获取不同 Job 参数，发起新请求
    vi.mocked(api.getJenkinsJobParameters).mockResolvedValueOnce([]);
    const p3 = await getCachedJenkinsJobParameters('conn-1', 'job-b');
    expect(p3).toEqual([]);
    expect(api.getJenkinsJobParameters).toHaveBeenCalledTimes(2);
  });
});
