import * as api from '../../lib/api';
import type { PipelineRunSummary } from '../../types';
import type { AppRuntime } from './runtime';
import { nextPipelineRunRequest } from './runtime';
import type { AppSliceCreator, PipelinesSlice } from './types';

export function createPipelinesSlice(runtime: AppRuntime): AppSliceCreator<PipelinesSlice> {
  return (set, get) => ({
    pipelines: [],
    runsByPipeline: {},
    loadingPipelines: false,

    async loadPipelines() {
      const requestId = ++runtime.requests.pipelines;
      set({ loadingPipelines: true });
      try {
        const pipelines = await api.listPipelines(20);
        if (requestId !== runtime.requests.pipelines) return;
        const entries = await Promise.all(
          pipelines.slice(0, 10).map(async (pipeline) => {
            const runRequestId = nextPipelineRunRequest(runtime, pipeline.pipelineId);
            const runs = await api.listPipelineRuns(pipeline.pipelineId, 5).catch(() => []);
            return { pipelineId: pipeline.pipelineId, runs, requestId: runRequestId };
          }),
        );
        if (requestId !== runtime.requests.pipelines) return;
        const runsByPipeline: Record<number, PipelineRunSummary[]> = {};
        for (const entry of entries) {
          runsByPipeline[entry.pipelineId] =
            runtime.pipelineRunRequests.get(entry.pipelineId) === entry.requestId
              ? entry.runs
              : get().runsByPipeline[entry.pipelineId] ?? [];
        }
        set({ pipelines, runsByPipeline });
      } catch {
        // 流水线区失败不阻塞工作项主流程。
      } finally {
        if (requestId === runtime.requests.pipelines) set({ loadingPipelines: false });
      }
    },

    async loadRuns(pipelineId: number) {
      const requestId = nextPipelineRunRequest(runtime, pipelineId);
      try {
        const runs = await api.listPipelineRuns(pipelineId, 5);
        if (runtime.pipelineRunRequests.get(pipelineId) === requestId) {
          set((state) => ({ runsByPipeline: { ...state.runsByPipeline, [pipelineId]: runs } }));
        }
      } catch {
        // 保留已有运行记录，等待下一次主动刷新。
      }
    },
  });
}
