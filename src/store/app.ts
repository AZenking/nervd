// zustand 全局状态（契约 §5）
import { create } from 'zustand';
import * as api from '../lib/api';
import type { WorkitemRow } from '../lib/api';
import { workitemRepoIds } from '../lib/workitem-repos';
import type {
  Category, ConnectionState, PipelineRunSummary, RepoCiSnapshot, RepoSummary,
  Settings, SettingsView, TraceResult,
} from '../types';
import { loadWorkitemTrace } from './workitem-trace';

// ---- 原始响应的宽松解析（云效字段大小写/嵌套不定，统一走防御式取值） ----
/** 根数组或 result/data 包装统一解包 */
const arr = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    for (const k of ['result', 'data', 'items']) {
      const x = (v as Record<string, unknown>)[k];
      if (Array.isArray(x)) return x;
    }
  }
  return [];
};

export interface Toast { text: string; kind: 'info' | 'ok' | 'fail' }

interface AppStore {
  settings: SettingsView | null;
  connection: ConnectionState;
  booting: boolean;

  category: Category;
  items: WorkitemRow[];
  nextToken: string | null;
  loadingList: boolean;

  selectedId: string | null;
  detail: Record<string, unknown> | null;
  comments: unknown[];
  loadingDetail: boolean;

  trace: TraceResult | null;
  traceLoading: boolean;

  repositories: RepoSummary[];
  repoCiByRepo: Record<number, { loading: boolean; snapshot: RepoCiSnapshot | null; error?: string }>;

  pipelines: { pipelineId: number; pipelineName: string; status?: string }[];
  runsByPipeline: Record<number, PipelineRunSummary[]>;

  logView: { title: string; text: string } | null;
  toast: Toast | null;

  init(): Promise<void>;
  refreshConnection(): Promise<void>;
  setCategory(c: Category): Promise<void>;
  loadList(next?: boolean): Promise<void>;
  select(id: string): Promise<void>;
  loadTrace(): Promise<void>;
  loadRepos(): Promise<void>;
  loadRepoCi(repoId: number): Promise<void>;
  saveWorkitemRepos(workitemId: string, repoIds: number[] | null): Promise<void>;
  openRepoCiLogs(repoId: number, runId: string, title: string): Promise<void>;
  loadPipelines(): Promise<void>;
  loadRuns(pipelineId: number): Promise<void>;
  openLogs(pipelineId: number, runId: number, jobId: number, title: string): Promise<void>;
  closeLogs(): void;
  setToast(t: Toast | null): void;
  saveAll(s: Settings, pat?: string): Promise<void>;
}

const requests = { connection: 0, list: 0, detail: 0, trace: 0, pipelines: 0, logs: 0 };
const pipelineRunRequests = new Map<number, number>();
const repoCiRequests = new Map<number, number>();
let pipelineRunRequestSequence = 0;
const nextPipelineRunRequest = (pipelineId: number) => {
  const requestId = ++pipelineRunRequestSequence;
  pipelineRunRequests.set(pipelineId, requestId);
  return requestId;
};

export const useApp = create<AppStore>((set, get) => ({
  settings: null,
  connection: 'unknown',
  booting: true,

  category: 'Req',
  items: [],
  nextToken: null,
  loadingList: false,

  selectedId: null,
  detail: null,
  comments: [],
  loadingDetail: false,

  trace: null,
  traceLoading: false,

  repositories: [],
  repoCiByRepo: {},

  pipelines: [],
  runsByPipeline: {},

  logView: null,
  toast: null,

  async init() {
    try {
      const settings = await api.getSettings();
      set({ settings, booting: false });
      if (settings.hasPat && settings.organizationId) {
        await get().refreshConnection();
        await Promise.all([get().loadList(), get().loadRepos()]);
        void get().loadPipelines();
      }
    } catch (e) {
      set({ booting: false, connection: 'fail' });
      get().setToast({ text: `初始化失败：${String(e)}`, kind: 'fail' });
    }
  },

  async refreshConnection() {
    const requestId = ++requests.connection;
    try {
      await api.checkConnection();
      if (requestId === requests.connection) set({ connection: 'ok' });
    } catch {
      if (requestId === requests.connection) set({ connection: 'fail' });
    }
  },

  async setCategory(c) {
    requests.detail += 1;
    requests.trace += 1;
    set({
      category: c,
      items: [],
      nextToken: null,
      selectedId: null,
      detail: null,
      comments: [],
      loadingDetail: false,
      trace: null,
      traceLoading: false,
    });
    await get().loadList();
  },

  async loadList(next = false) {
    const requestId = ++requests.list;
    const { settings, category, nextToken } = get();
    const spaceIdentifier = settings?.defaultSpaceIdentifier;
    if (!spaceIdentifier) {
      set({ loadingList: false });
      return;
    }
    if (next && !nextToken) {
      set({ loadingList: false });
      return;
    }

    const isCurrent = () =>
      requestId === requests.list &&
      get().category === category &&
      get().settings?.defaultSpaceIdentifier === spaceIdentifier;

    set({ loadingList: true });
    try {
      const page = await api.listWorkitems({
        category,
        spaceIdentifier,
        nextToken: next ? (nextToken ?? undefined) : undefined,
      });
      if (!isCurrent()) return;

      const mapped: WorkitemRow[] = page.items.map((it) => ({
        ...it,
        assignedTo: it.assignedTo || '—',
      }));
      set((st) => ({
        items: next ? [...st.items, ...mapped] : mapped,
        nextToken: page.nextToken,
      }));
    } catch (e) {
      if (isCurrent()) get().setToast({ text: `列表加载失败：${String(e)}`, kind: 'fail' });
    } finally {
      if (isCurrent()) set({ loadingList: false });
    }
  },

  async loadRepos() {
    try {
      const repositories = await api.listRepos();
      set({ repositories });
    } catch {
      /* 仓库名称缺失不阻塞工作项列表 */
    }
  },

  async select(id) {
    const requestId = ++requests.detail;
    requests.trace += 1;
    const s = get().settings;
    const isCurrent = () => requestId === requests.detail && get().selectedId === id;

    set({
      selectedId: id,
      detail: null,
      comments: [],
      trace: null,
      traceLoading: false,
      loadingDetail: true,
    });
    try {
      const [detail, commentsRaw] = await Promise.all([
        api.getWorkitem(id),
        api.listWorkitemComments(id).catch(() => ({})),
      ]);
      if (!isCurrent()) return;

      const comments = arr(commentsRaw);
      set({ detail, comments });
    } catch (e) {
      if (isCurrent()) get().setToast({ text: `详情加载失败：${String(e)}`, kind: 'fail' });
    } finally {
      if (isCurrent()) set({ loadingDetail: false });
    }
    const selected = get().items.find((item) => item.workitemId === id);
    const reposForTrace = s
      ? workitemRepoIds(selected?.category ?? get().category, id, s)
      : [];
    if (isCurrent() && reposForTrace.length > 0) void get().loadTrace();
  },

  async loadTrace() {
    const requestId = ++requests.trace;
    const { settings: s, selectedId, items } = get();
    if (!s || !selectedId) {
      set({ trace: null, traceLoading: false });
      return;
    }
    const cur = items.find((i) => i.workitemId === selectedId)
      ?? items.find((i) => i.identifier === selectedId);
    const identifier = cur?.identifier ?? '';
    if (!identifier) {
      set({ trace: null, traceLoading: false });
      return;
    }
    const isCurrent = () =>
      requestId === requests.trace && get().selectedId === selectedId;

    set({ traceLoading: true });
    try {
      const current = items.find((item) => item.workitemId === selectedId);
      const trace = await loadWorkitemTrace(selectedId, identifier, current?.category ?? get().category, s);
      if (isCurrent()) {
        set({ trace });
        if ((current?.category ?? get().category) === 'Req') {
          await Promise.all(trace.repositories.map((repo) => get().loadRepoCi(repo.repoId)));
        }
      }
    } catch (e) {
      if (isCurrent()) get().setToast({ text: `关联记录加载失败：${String(e)}`, kind: 'fail' });
    } finally {
      if (isCurrent()) set({ traceLoading: false });
    }
  },

  async loadRepoCi(repoId) {
    const requestId = (repoCiRequests.get(repoId) ?? 0) + 1;
    repoCiRequests.set(repoId, requestId);
    const binding = get().settings?.repoCiBindings?.[String(repoId)];
    if (!binding) {
      set((state) => ({
        repoCiByRepo: {
          ...state.repoCiByRepo,
          [repoId]: { loading: false, snapshot: null },
        },
      }));
      return;
    }
    set((state) => ({
      repoCiByRepo: {
        ...state.repoCiByRepo,
        [repoId]: { loading: true, snapshot: state.repoCiByRepo[repoId]?.snapshot ?? null },
      },
    }));
    try {
      const snapshot = await api.getRepoCiSnapshot(repoId, 5);
      if (repoCiRequests.get(repoId) !== requestId) return;
      set((state) => ({
        repoCiByRepo: { ...state.repoCiByRepo, [repoId]: { loading: false, snapshot } },
      }));
    } catch (e) {
      if (repoCiRequests.get(repoId) !== requestId) return;
      set((state) => ({
        repoCiByRepo: {
          ...state.repoCiByRepo,
          [repoId]: { loading: false, snapshot: null, error: String(e) },
        },
      }));
    }
  },

  async saveWorkitemRepos(workitemId, repoIds) {
    const settings = await api.saveWorkitemRepos(workitemId, repoIds);
    set({ settings });
    await get().loadTrace();
  },

  async openRepoCiLogs(repoId, runId, title) {
    set({ logView: { title, text: '加载中…' } });
    try {
      const text = await api.getRepoCiLogs(repoId, runId);
      set({ logView: { title, text } });
    } catch (e) {
      set({ logView: { title, text: `日志加载失败：${String(e)}` } });
    }
  },

  async loadPipelines() {
    const requestId = ++requests.pipelines;
    try {
      const pipelines = await api.listPipelines(20);
      if (requestId !== requests.pipelines) return;

      // 并行拉齐全部运行后一次性提交，避免逐条 set 造成 UI 连续刷新
      const entries = await Promise.all(
        pipelines.slice(0, 10).map(async (p) => {
          const runRequestId = nextPipelineRunRequest(p.pipelineId);
          const runs = await api.listPipelineRuns(p.pipelineId, 5).catch(() => []);
          return { pipelineId: p.pipelineId, runs, requestId: runRequestId };
        }),
      );
      if (requestId !== requests.pipelines) return;

      set((st) => {
        const runsByPipeline: Record<number, PipelineRunSummary[]> = {};
        for (const { pipelineId, runs, requestId: runRequestId } of entries) {
          runsByPipeline[pipelineId] =
            pipelineRunRequests.get(pipelineId) === runRequestId
              ? runs
              : st.runsByPipeline[pipelineId] ?? [];
        }
        return { pipelines, runsByPipeline };
      });
    } catch {
      /* 静默：流水线区失败不阻塞主流程 */
    }
  },

  async loadRuns(pipelineId) {
    const requestId = nextPipelineRunRequest(pipelineId);
    try {
      const runs = await api.listPipelineRuns(pipelineId, 5);
      if (pipelineRunRequests.get(pipelineId) === requestId) {
        set((st) => ({ runsByPipeline: { ...st.runsByPipeline, [pipelineId]: runs } }));
      }
    } catch {
      /* 同上 */
    }
  },

  async openLogs(pipelineId, runId, jobId, title) {
    const requestId = ++requests.logs;
    set({ logView: { title, text: '加载中…' } });
    try {
      const text = await api.getJobLogs(pipelineId, runId, jobId);
      if (requestId === requests.logs) set({ logView: { title, text } });
    } catch (e) {
      if (requestId === requests.logs) {
        set({ logView: { title, text: `日志加载失败：${String(e)}` } });
      }
    }
  },

  closeLogs() {
    requests.logs += 1;
    set({ logView: null });
  },

  setToast(t) {
    set({ toast: t });
    if (t) setTimeout(() => set((st) => (st.toast === t ? { toast: null } : {})), 4000);
  },

  async saveAll(s, pat) {
    if (pat) await api.savePat(pat);
    const settings = await api.saveSettings(s);

    const previous = get().settings;
    const previousWatchedRepos = previous?.watchedRepos ?? [];
    const nextWatchedRepos = settings.watchedRepos ?? [];
    const watchedReposChanged =
      previousWatchedRepos.length !== nextWatchedRepos.length ||
      nextWatchedRepos.some((repoId, index) => repoId !== previousWatchedRepos[index]);
    const dataContextChanged =
      !!pat ||
      previous?.organizationId !== settings.organizationId ||
      previous?.defaultSpaceIdentifier !== settings.defaultSpaceIdentifier;
    const traceContextChanged =
      dataContextChanged ||
      previous?.linkPattern !== settings.linkPattern ||
      watchedReposChanged ||
      JSON.stringify(previous?.workitemRepos ?? {}) !== JSON.stringify(settings.workitemRepos ?? {});
    const repoCiChanged =
      JSON.stringify(previous?.repoCiBindings ?? {}) !== JSON.stringify(settings.repoCiBindings ?? {}) ||
      JSON.stringify(previous?.jenkinsConnections ?? []) !== JSON.stringify(settings.jenkinsConnections ?? []);

  if (dataContextChanged) {
    requests.list += 1;
    requests.detail += 1;
    requests.pipelines += 1;
    requests.logs += 1;
    pipelineRunRequests.clear();
    }
    if (traceContextChanged) requests.trace += 1;

    set({
      settings,
      ...(dataContextChanged
        ? {
            connection: 'unknown' as const,
            items: [],
            nextToken: null,
            loadingList: false,
            selectedId: null,
            detail: null,
            comments: [],
          loadingDetail: false,
          pipelines: [],
          runsByPipeline: {},
          logView: null,
        }
        : {}),
      ...(traceContextChanged ? { trace: null, traceLoading: false } : {}),
      ...(repoCiChanged ? { repoCiByRepo: {} } : {}),
    });

    await get().refreshConnection();
    if (settings.hasPat && settings.organizationId && settings.defaultSpaceIdentifier) {
      await get().loadList();
      await get().loadRepos();
      void get().loadPipelines();
      if (traceContextChanged && !dataContextChanged && get().selectedId) {
        void get().loadTrace();
      } else if (repoCiChanged && get().trace) {
        void Promise.all(get().trace!.repositories.map((repo) => get().loadRepoCi(repo.repoId)));
      }
    }
  },
}));
