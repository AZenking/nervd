import { describe, expect, it } from 'vitest';
import type { PipelineSummary } from '@/types';
import { matchPipelineForRepo } from './pipeline-match';

describe('matchPipelineForRepo', () => {
  const mockPipelines: PipelineSummary[] = [
    { pipelineId: 101, pipelineName: 'trade-service-build' },
    { pipelineId: 102, pipelineName: 'nervd' },
    { pipelineId: 103, pipelineName: 'deploy-payment-center' },
    { pipelineId: 104, pipelineName: 'user-center-api-prod' },
    { pipelineId: 105, pipelineName: 'common-utils' },
  ];

  it('空输入或空流水线列表返回 null', () => {
    expect(matchPipelineForRepo('', mockPipelines).bestMatch).toBeNull();
    expect(matchPipelineForRepo('trade-service', []).bestMatch).toBeNull();
  });

  it('名称完全相同时获得满分 100 匹配', () => {
    const res = matchPipelineForRepo('nervd', mockPipelines);
    expect(res.bestMatch?.pipelineId).toBe(102);
    expect(res.score).toBe(100);
    expect(res.reason).toContain('完全一致');
  });

  it('处理带命名空间的仓库路径，命中前缀/标识', () => {
    const res = matchPipelineForRepo('aliyun/trade-service', mockPipelines);
    expect(res.bestMatch?.pipelineId).toBe(101);
    expect(res.score).toBe(85);
    expect(res.reason).toContain('trade-service');
  });

  it('包含仓库名时获得 75 分', () => {
    const res = matchPipelineForRepo('payment-center', mockPipelines);
    expect(res.bestMatch?.pipelineId).toBe(103);
    expect(res.score).toBeGreaterThanOrEqual(75);
  });

  it('完全不相关的仓库不给误匹配', () => {
    const res = matchPipelineForRepo('unrelated-alpha-project', mockPipelines);
    expect(res.bestMatch).toBeNull();
    expect(res.score).toBeLessThan(60);
  });
});
