import * as api from '../../lib/api';
import type { AppRuntime } from './runtime';
import type { AppSliceCreator, LogsSlice } from './types';

export function createLogsSlice(runtime: AppRuntime): AppSliceCreator<LogsSlice> {
  return (set, get) => ({
    logView: null,

    async openRepoCiLogs(repoId, runId, title) {
      const requestId = ++runtime.requests.logs;
      const binding = get().settings?.repoCiBindings?.[String(repoId)];
      const base = { title, text: '', repoId, runId };

      void api.getRepoCiStages(repoId, runId).then((stages) => {
        const current = get().logView;
        if (current?.repoId === repoId && current.runId === runId && stages.length > 0) {
          set({ logView: { ...current, stages } });
        }
      }).catch(() => undefined);

      if (binding?.provider === 'jenkins') {
        set({ logView: { ...base, nextOffset: 0, hasMore: true } });
        await get().refreshRepoCiLogs();
        return;
      }

      set({ logView: { ...base, loading: true } });
      try {
        const text = await api.getRepoCiLogs(repoId, runId);
        if (requestId === runtime.requests.logs) set({ logView: { ...base, text, loading: false } });
      } catch (error) {
        if (requestId === runtime.requests.logs) {
          const message = String(error);
          set({ logView: { ...base, text: `日志加载失败：${message}`, error: message, loading: false } });
        }
      }
    },

    async refreshRepoCiLogs() {
      const current = get().logView;
      if (!current?.repoId || !current.runId || !current.hasMore || current.loading) return;
      const requestId = runtime.requests.logs;
      set({ logView: { ...current, loading: true, error: undefined } });
      try {
        const chunk = await api.getRepoCiLogChunk(current.repoId, current.runId, current.nextOffset ?? 0);
        if (requestId !== runtime.requests.logs) return;
        const latest = get().logView;
        if (!latest || latest.repoId !== current.repoId || latest.runId !== current.runId) return;
        const truncated = chunk.nextOffset < (latest.nextOffset ?? 0);
        set({
          logView: {
            ...latest,
            text: truncated ? chunk.text : latest.text + chunk.text,
            nextOffset: chunk.nextOffset,
            hasMore: chunk.hasMore,
            loading: false,
          },
        });
        if (!chunk.hasMore || !latest.stages?.length) {
          void api.getRepoCiStages(current.repoId, current.runId).then((stages) => {
            const view = get().logView;
            if (view && view.repoId === current.repoId && view.runId === current.runId && stages.length > 0) {
              set({ logView: { ...view, stages } });
            }
          }).catch(() => undefined);
        }
      } catch (error) {
        if (requestId !== runtime.requests.logs) return;
        const latest = get().logView;
        if (!latest || latest.repoId !== current.repoId || latest.runId !== current.runId) return;
        set({ logView: { ...latest, loading: false, error: String(error) } });
      }
    },

    async openLogs(pipelineId, runId, jobId, title) {
      const requestId = ++runtime.requests.logs;
      set({ logView: { title, text: '加载中…', pipelineId, runId: String(runId), loading: true } });
      try {
        const text = await api.getJobLogs(pipelineId, runId, jobId);
        if (requestId === runtime.requests.logs) {
          set({ logView: { title, text, pipelineId, runId: String(runId), jobId, loading: false } });
        }
      } catch (error) {
        if (requestId === runtime.requests.logs) {
          const message = String(error);
          set({
            logView: {
              title,
              text: `日志加载失败：${message}`,
              pipelineId,
              runId: String(runId),
              jobId,
              error: message,
              loading: false,
            },
          });
        }
      }
    },

    closeLogs() {
      runtime.requests.logs += 1;
      set({ logView: null });
    },
  });
}
