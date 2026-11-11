import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPrevSuccessDurationMs, useActiveBuildItems, type ActiveBuildItem } from './quick-build-active-table';
import { useQuickBuild } from '@/store/quick-build';
import { clearEstimateCache, setCachedEstimate } from '@/lib/build-estimate';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('findPrevSuccessDurationMs', () => {
  it('正确从历史运行记录提取上一条 SUCCESS 记录的时长', () => {
    const runs = [
      { runId: '102', status: 'RUNNING', startTime: 1000 },
      { runId: '101', status: 'SUCCESS', startTime: 500, durationMs: 45_000 },
      { runId: '100', status: 'SUCCESS', startTime: 100, durationMs: 30_000 },
    ];

    expect(findPrevSuccessDurationMs(runs, '102')).toBe(45_000);
  });

  it('支持 FINISH / PASSED / ok 等多种成功枚举，并忽略正在运行的记录', () => {
    const runs = [
      { pipelineRunId: 202, status: 'BUILDING', startTime: 2000 },
      { pipelineRunId: 201, status: 'PASSED', startTime: 1000, endTime: 61_000 },
    ];

    expect(findPrevSuccessDurationMs(runs)).toBe(60_000);
  });

  it('跳过当前正在执行的 currentRunId 即使该记录已被写入列表', () => {
    const runs = [
      { runId: '50', status: 'SUCCESS', startTime: 2000, durationMs: 99_000 },
      { runId: '49', status: 'SUCCESS', startTime: 1000, durationMs: 35_000 },
    ];

    // 当 50 是当前正在查看或刚刚完成的构建时，历史基准应回退至 49
    expect(findPrevSuccessDurationMs(runs, '50')).toBe(35_000);
  });

  it('无任何成功历史时安全返回 null', () => {
    const runs = [
      { runId: '10', status: 'FAIL', durationMs: 12_000 },
      { runId: '9', status: 'CANCELED', durationMs: 8_000 },
    ];

    expect(findPrevSuccessDurationMs(runs)).toBeNull();
  });
});

describe('useActiveBuildItems 预估时长命中', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clearEstimateCache();
    useQuickBuild.setState({ trackedBuilds: [] });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
    clearEstimateCache();
    useQuickBuild.setState({ trackedBuilds: [] });
  });

  it('命中 estimateCache 时，活跃任务自动带上 estimatedDurationMs', async () => {
    const connId = 'conn-1';
    const jobName = 'foton-financial-view-sst-fed-isd';
    // 模拟写入先前构建的成功耗时 (72s)
    setCachedEstimate(`jenkins:${connId}:${jobName}`, 72000);

    useQuickBuild.setState({
      trackedBuilds: [
        {
          id: 'test-1',
          state: 'running',
          runId: '118',
          submittedAt: Date.now() - 6000,
          startedAt: Date.now() - 6000,
          parameters: {},
          target: {
            id: `jenkins:10:${connId}:${jobName}`,
            type: 'jenkins',
            repoId: 10,
            repoName: 'financial-view',
            pipelineName: jobName,
            connectionId: connId,
            jobFullName: jobName,
          },
        },
      ],
    });

    let captured: ActiveBuildItem[] = [];
    function TestConsumer() {
      captured = useActiveBuildItems();
      return null;
    }

    await act(async () => {
      root.render(<TestConsumer />);
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].runId).toBe('118');
    // 自动命中并附带预估耗时 72000ms
    expect(captured[0].estimatedDurationMs).toBe(72000);
  });
});
