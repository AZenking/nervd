import * as api from '../../lib/api';
import { errorLog } from '../../lib/error-format';
import type { Category } from '../../types';
import { loadWorkitemTrace } from '../workitem-trace';
import type { AppRuntime } from './runtime';
import { detailRecords } from './helpers';
import type { AppSliceCreator, RefreshResult, TraceSlice } from './types';

function firstString(detail: Record<string, unknown> | null, keys: string[]): string {
  if (!detail) return '';
  for (const record of detailRecords(detail)) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value) return value;
    }
  }
  return '';
}

export function createTraceSlice(runtime: AppRuntime): AppSliceCreator<TraceSlice> {
  return (set, get) => ({
    trace: null,
    traceLoading: false,
    repositories: [],
    repoRefreshVersion: {},

    async loadRepos() {
      try {
        const repositories = await api.listRepos();
        set({ repositories });
      } catch {
        // 仓库名称缺失不阻塞工作项列表。
      }
    },

    async saveBranchRuleTemplates(templates) {
      const settings = await api.saveBranchRuleTemplates(templates);
      set({ settings });
    },

    async saveWorkitemRepoBranchTemplate(workitemId, repoId, templateId) {
      const settings = await api.saveWorkitemRepoBranchTemplate(workitemId, repoId, templateId);
      set({ settings });
      if (get().selectedId === workitemId) void get().refreshRepoTrace(repoId);
    },

    async saveWorkitemRepos(workitemId, repoIds) {
      const settings = await api.saveWorkitemRepos(workitemId, repoIds);
      set({ settings });
      await get().loadTrace();
    },

    async loadTrace(): Promise<RefreshResult> {
      const requestId = ++runtime.requests.trace;
      const { settings, selectedId, items, detail, children } = get();
      if (!settings || !selectedId) {
        set({ trace: null, traceLoading: false });
        return { status: 'fail', errors: ['没有可用的工作项或连接设置'] };
      }
      const selected = items.find((item) => item.workitemId === selectedId)
        ?? items.find((item) => item.identifier === selectedId);
      const child = children.find((item) => item.workitemId === selectedId);
      const identifier = selected?.identifier
        || child?.identifier
        || firstString(detail, ['identifier', 'serialNumber'])
        || '';
      if (!identifier) {
        set({ trace: null, traceLoading: false });
        return { status: 'fail', errors: ['当前工作项缺少可追溯编号'] };
      }
      const isCurrent = () => requestId === runtime.requests.trace && get().selectedId === selectedId;
      set({ traceLoading: true });
      try {
        const category = (firstString(detail, ['category']) || selected?.category || child?.category || get().category) as Category;
        const trace = await loadWorkitemTrace(selectedId, identifier, category, settings);
        if (!isCurrent()) return { status: 'fail', errors: ['追溯请求已失效'] };
        set({ trace });
        if (category === 'Req') {
          await Promise.all(trace.repositories.map((repo) => get().loadRepoCi(repo.repoId)));
        }
        return { status: 'success', errors: [] };
      } catch (error) {
        if (isCurrent()) get().setToast({ text: `关联记录加载失败：${String(error)}`, kind: 'fail' });
        return { status: 'fail', errors: [String(error)] };
      } finally {
        if (isCurrent()) set({ traceLoading: false });
      }
    },

    async refreshRepoTrace(repoId: number): Promise<RefreshResult> {
      set((state) => ({
        repoRefreshVersion: {
          ...state.repoRefreshVersion,
          [repoId]: (state.repoRefreshVersion[repoId] ?? 0) + 1,
        },
      }));
      const previous = get().trace;
      try {
        const result = await get().loadTrace();
        if (result.status === 'fail') return result;
        const current = get().trace;
        if (!current) return { status: 'partial', errors: ['当前工作项没有可用追溯数据'] };
        const repository = current.repositories.find((item) => item.repoId === repoId);
        if (!repository) return { status: 'partial', errors: [`仓库 ${repoId} 未出现在当前追溯结果中`] };
        return { status: 'success', errors: [] };
      } catch (error) {
        // loadTrace 内部会转成 toast；这里仍返回机器可判断的失败结果。
        errorLog('app.refreshRepoTrace', error);
        if (previous) set({ trace: previous });
        return { status: 'fail', errors: [String(error)] };
      }
    },
  });
}
