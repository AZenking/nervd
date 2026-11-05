import * as api from '../../lib/api';
import type { AppRuntime } from './runtime';
import type { AppSliceCreator, LogsSlice } from './types';

export function createLogsSlice(runtime: AppRuntime): AppSliceCreator<LogsSlice> {
  return (set, get) => ({
    logView: null,

    async openRepoCiLogs(repoId, runId, title) {
      const requestId = ++runtime.requests.logs;
      const binding = get().settings?.repoCiBindings?.[String(repoId)];
      const base = {
        title,
        text: '',
        repoId,
        runId,
        connectionId: binding?.provider === 'jenkins' ? binding.connectionId : undefined,
        jobFullName: binding?.provider === 'jenkins' ? binding.jobFullName : undefined,
      };

      const stagesPromise = binding?.provider === 'jenkins'
        ? api.getJenkinsJobStages(binding.connectionId, binding.jobFullName, runId)
        : api.getRepoCiStages(repoId, runId);

      void stagesPromise.then((stages) => {
        const current = get().logView;
        if (current?.runId === runId && stages.length > 0) {
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

    async openTargetJenkinsLogs(connectionId, jobFullName, runId, title, repoId) {
      const base = {
        title,
        text: '',
        runId,
        repoId,
        connectionId,
        jobFullName,
        nextOffset: 0,
        hasMore: true,
      };

      void api.getJenkinsJobStages(connectionId, jobFullName, runId).then((stages) => {
        const current = get().logView;
        if (current?.runId === runId && current.connectionId === connectionId && stages.length > 0) {
          set({ logView: { ...current, stages } });
        }
      }).catch(() => undefined);

      set({ logView: base });
      await get().refreshRepoCiLogs();
    },

    async refreshRepoCiLogs() {
      const current = get().logView;
      if (!current?.runId || !current.hasMore || current.loading) return;
      const requestId = runtime.requests.logs;
      set({ logView: { ...current, loading: true, error: undefined } });
      try {
        const chunk = current.connectionId && current.jobFullName
          ? await api.getJenkinsJobLogChunk(current.connectionId, current.jobFullName, current.runId, current.nextOffset ?? 0)
          : current.repoId
          ? await api.getRepoCiLogChunk(current.repoId, current.runId, current.nextOffset ?? 0)
          : null;

        if (!chunk || requestId !== runtime.requests.logs) return;
        const latest = get().logView;
        if (!latest || latest.runId !== current.runId) return;
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
          const stagesPromise = current.connectionId && current.jobFullName
            ? api.getJenkinsJobStages(current.connectionId, current.jobFullName, current.runId)
            : current.repoId
            ? api.getRepoCiStages(current.repoId, current.runId)
            : null;

          if (stagesPromise) {
            void stagesPromise.then((stages) => {
              const view = get().logView;
              if (view && view.runId === current.runId && stages.length > 0) {
                set({ logView: { ...view, stages } });
              }
            }).catch(() => undefined);
          }
        }
      } catch (error) {
        if (requestId !== runtime.requests.logs) return;
        const latest = get().logView;
        if (!latest || latest.runId !== current.runId) return;
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
