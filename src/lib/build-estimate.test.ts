import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import {
  clearEstimateCache,
  extractSuccessDuration,
  fetchJobEstimate,
  getCachedEstimate,
  getEstimateKey,
  setCachedEstimate,
} from './build-estimate';

vi.mock('@/lib/api', () => ({
  getJenkinsJobRuns: vi.fn(),
  listPipelineRuns: vi.fn(),
}));

describe('build-estimate 模块', () => {
  beforeEach(() => {
    clearEstimateCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearEstimateCache();
  });

  it('getEstimateKey 生成各平台规范键名', () => {
    expect(
      getEstimateKey({
        type: 'jenkins',
        connectionId: 'conn-1',
        jobFullName: 'frontend-app',
      }),
    ).toBe('jenkins:conn-1:frontend-app');

    expect(
      getEstimateKey({
        type: 'flow',
        pipelineId: 998,
      }),
    ).toBe('flow:998');

    expect(
      getEstimateKey({
        repoId: 101,
      }),
    ).toBe('repo:101');

    expect(getEstimateKey(null)).toBeNull();
  });

  it('setCachedEstimate 与 getCachedEstimate 缓存读写与过滤', () => {
    const key = 'jenkins:conn-1:frontend-app';
    expect(getCachedEstimate(key)).toBeNull();

    // 过短时长 (< 3000ms) 视为无效噪点，不予缓存
    setCachedEstimate(key, 1500);
    expect(getCachedEstimate(key)).toBeNull();

    // 正常历史时长 (如 75 秒) 成功缓存
    setCachedEstimate(key, 75000);
    expect(getCachedEstimate(key)).toBe(75000);
  });

  it('extractSuccessDuration 优先从有效成功记录提取时长', () => {
    const runs = [
      { runId: '118', status: 'RUNNING', startTime: 1000 },
      { runId: '117', status: 'SUCCESS', durationMs: 65000 },
      { runId: '116', status: 'FAIL', durationMs: 40000 },
      { runId: '115', status: 'SUCCESS', durationMs: 80000 },
    ];

    // 跳过当前正在运行的 118，命中上一条成功记录 117
    const duration = extractSuccessDuration(runs, '118');
    expect(duration).toBe(65000);
  });

  it('extractSuccessDuration 兼容缺少 durationMs 但有 startTime/endTime 的情况', () => {
    const runs = [
      {
        runId: '201',
        status: 'SUCCESS',
        startTime: 10000,
        endTime: 75000,
      },
    ];

    expect(extractSuccessDuration(runs)).toBe(65000);
  });

  it('fetchJobEstimate 远端拉取 Jenkins 运行历史并自动写入缓存', async () => {
    const target = {
      type: 'jenkins' as const,
      connectionId: 'conn-1',
      jobFullName: 'foton-financial-view-sst-fed-isd',
    };

    vi.mocked(api.getJenkinsJobRuns).mockResolvedValueOnce([
      { runId: '118', status: 'RUNNING', startTime: 1000 },
      { runId: '117', status: 'SUCCESS', durationMs: 85000 },
    ] as any);

    const estimated = await fetchJobEstimate(target, '118');
    expect(estimated).toBe(85000);
    expect(api.getJenkinsJobRuns).toHaveBeenCalledWith('conn-1', 'foton-financial-view-sst-fed-isd', 6);

    // 再次读取时直接命中缓存，不发起重复网络请求
    const secondCall = await fetchJobEstimate(target);
    expect(secondCall).toBe(85000);
    expect(api.getJenkinsJobRuns).toHaveBeenCalledTimes(1);
  });
});
