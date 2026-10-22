import * as api from '../../lib/api';
import { visibleIterations, useUi } from '../ui';
import type { AppRuntime } from './runtime';
import type { AppSliceCreator, IterationsSlice } from './types';

export function createIterationsSlice(_runtime: AppRuntime): AppSliceCreator<IterationsSlice> {
  return (set, get) => ({
    iterations: [],
    loadingIterations: false,

    async loadIterations() {
      set({ loadingIterations: true });
      try {
        const iterations = await api.listIterations();
        const previous = get().iterations;
        const isSame =
          previous.length === iterations.length &&
          previous.every(
            (item, index) =>
              item.id === iterations[index].id &&
              item.name === iterations[index].name &&
              item.state === iterations[index].state &&
              item.startDate === iterations[index].startDate &&
              item.endDate === iterations[index].endDate,
          );
        set({
          ...(isSame ? {} : { iterations }),
          loadingIterations: false,
          iterationsFetchedAt: Date.now(),
        });

        const key = useUi.getState().iterationKey;
        if (iterations.length && !iterations.some((item) => item.name === key)) {
          const visible = visibleIterations(iterations);
          const preferred = visible.find((item) => item.state === '进行中') ?? visible[0] ?? iterations[0];
          useUi.setState({ iterationKey: preferred.name });
        }
      } catch {
        // 迭代列表不可用时由 UI 使用占位迭代，不阻塞工作项主流程。
        set({ iterations: [], loadingIterations: false });
      }
    },
  });
}
