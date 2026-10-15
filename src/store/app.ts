// zustand 全局状态（契约 §5）
import { create } from 'zustand';
import * as api from '../lib/api';
import type { WorkitemRow, WorkitemChild } from '../lib/api';
import { workitemRepoIds } from '../lib/workitem-repos';
import type {
  BranchRuleTemplate, Category, ConnectionState, IterationSummary, PipelineRunSummary,
  RepoCiBinding, RepoCiSnapshot, RepoSummary, Settings, SettingsView, TraceResult,
} from '../types';
import { loadWorkitemTrace } from './workitem-trace';
import { useUi, visibleIterations } from './ui';

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

interface LogViewState {
  title: string;
  text: string;
  repoId?: number;
  runId?: string;
  nextOffset?: number;
  hasMore?: boolean;
  loading?: boolean;
  error?: string;
}

interface AppStore {
  settings: SettingsView | null;
  connection: ConnectionState;
  booting: boolean;

  category: Category;
  items: WorkitemRow[];
  nextToken: string | null;
  loadingList: boolean;

  /** 云效迭代列表（sprints OpenAPI）；空 = 不可用，UI 回退 PLACEHOLDER_ITERATIONS */
  iterations: IterationSummary[];
  loadingIterations: boolean;

  selectedId: string | null;
  detail: Record<string, unknown> | null;
  comments: unknown[];
  children: WorkitemChild[];
  childrenError: string | null;
  childrenDebug: string | null;
  loadingDetail: boolean;

  trace: TraceResult | null;
  traceLoading: boolean;

  repositories: RepoSummary[];
  repoCiByRepo: Record<number, { loading: boolean; snapshot: RepoCiSnapshot | null; error?: string }>;
  /** 最近一次 CI 快照成功刷新时间（失败不更新，避免错误信心） */
  ciRefreshedAt: number | null;

  pipelines: { pipelineId: number; pipelineName: string; status?: string }[];
  runsByPipeline: Record<number, PipelineRunSummary[]>;
  loadingPipelines: boolean;

  logView: LogViewState | null;
  toast: Toast | null;

  init(): Promise<void>;
  refreshConnection(): Promise<void>;
  setCategory(c: Category): Promise<void>;
  loadList(next?: boolean): Promise<void>;
  loadIterations(): Promise<void>;
  select(id: string): Promise<void>;
  loadTrace(): Promise<void>;
  loadRepos(): Promise<void>;
  saveBranchRuleTemplates(templates: BranchRuleTemplate[]): Promise<void>;
  saveWorkitemRepoBranchTemplate(workitemId: string, repoId: number, templateId: string | null): Promise<void>;
  saveRepoCiBinding(repoId: number, binding: RepoCiBinding | null): Promise<void>;
  loadChildren(workitemId: string): Promise<void>;
  loadRepoCi(repoId: number): Promise<void>;
  saveWorkitemRepos(workitemId: string, repoIds: number[] | null): Promise<void>;
  openRepoCiLogs(repoId: number, runId: string, title: string): Promise<void>;
  refreshRepoCiLogs(): Promise<void>;
  loadPipelines(): Promise<void>;
  loadRuns(pipelineId: number): Promise<void>;
  openLogs(pipelineId: number, runId: number, jobId: number, title: string): Promise<void>;
  closeLogs(): void;
  setToast(t: Toast | null): void;
  saveAll(s: Settings, pat?: string): Promise<void>;
  updateWorkitemStatusOptimistic(workitemId: string, newStatus: string, statusId?: string): Promise<boolean>;
  updateChildStatusOptimistic(workitemId: string, newStatus: string, statusId?: string): void;
}

const requests = { connection: 0, list: 0, detail: 0, trace: 0, pipelines: 0, logs: 0 };
const pipelineRunRequests = new Map<number, number>();
const repoCiRequests = new Map<number, number>();
const childrenRequests = new Map<string, number>();
const optimisticChildStatuses = new Map<string, { status: string; statusId?: string; updatedAt: number }>();
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

  iterations: [],
  loadingIterations: false,

  selectedId: null,
  detail: null,
  comments: [],
  children: [],
  childrenError: null,
  childrenDebug: null,
  loadingDetail: false,

  trace: null,
  traceLoading: false,

  repositories: [],
  repoCiByRepo: {},
  ciRefreshedAt: null,

  pipelines: [],
  runsByPipeline: {},
  loadingPipelines: false,

  logView: null,
  toast: null,

  async init() {
    try {
      const settings = await api.getSettings();
      set({ settings, booting: false });
      if (settings.hasPat && settings.organizationId) {
        await get().refreshConnection();
        await Promise.all([get().loadList(), get().loadRepos(), get().loadIterations()]);
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
      children: [],
      childrenError: null,
      childrenDebug: null,
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

  async loadIterations() {
    set({ loadingIterations: true });
    try {
      const iterations = await api.listIterations();
      set({ iterations, loadingIterations: false });
      // 真实列表到达后校正选中迭代：占位默认值或已失效的 key 回落到「进行中」迭代
      // （只在展示中的迭代里选：归档等不可见迭代不作为回落目标；直接改 key，不切视图——避免把停留在设置页的用户拽回迭代页）
      const key = useUi.getState().iterationKey;
      if (iterations.length && !iterations.some((it) => it.name === key)) {
        const visible = visibleIterations(iterations);
        const preferred =
          visible.find((it) => it.state === '进行中') ?? visible[0] ?? iterations[0];
        useUi.setState({ iterationKey: preferred.name });
      }
    } catch {
      // 静默：迭代壳回退占位数据（iterationsOrFallback），不阻塞工作项主流程
      set({ iterations: [], loadingIterations: false });
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

  async saveBranchRuleTemplates(templates) {
    const settings = await api.saveBranchRuleTemplates(templates);
    set({ settings });
  },

  async saveWorkitemRepoBranchTemplate(workitemId, repoId, templateId) {
    const settings = await api.saveWorkitemRepoBranchTemplate(workitemId, repoId, templateId);
    set({ settings });
  },

  async saveRepoCiBinding(repoId, binding) {
    const settings = await api.saveRepoCiBinding(repoId, binding);
    set({ settings });
  },

  async loadChildren(workitemId) {
    const requestId = (childrenRequests.get(workitemId) ?? 0) + 1;
    childrenRequests.set(workitemId, requestId);
    try {
      const result = await api.listWorkitemChildren(workitemId);
      if (childrenRequests.get(workitemId) !== requestId || get().selectedId !== workitemId) return;
      const now = Date.now();
      const mergedItems = result.items.map((item) => {
        const opt = optimisticChildStatuses.get(item.workitemId);
        // 如果 10 秒内有乐观状态变更，优先保留乐观状态，防御 ES 搜索索引延迟导致返回旧状态
        if (opt && now - opt.updatedAt < 10000) {
          return { ...item, status: opt.status, statusId: opt.statusId ?? item.statusId };
        }
        return item;
      });
      set({ children: mergedItems, childrenError: null, childrenDebug: result.rawSample ?? null });
    } catch (error) {
      if (childrenRequests.get(workitemId) !== requestId || get().selectedId !== workitemId) return;
      set({ children: [], childrenError: String(error), childrenDebug: null });
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
      children: [],
      childrenError: null,
      childrenDebug: null,
      trace: null,
      traceLoading: false,
      loadingDetail: true,
    });
    try {
      const [detail, commentsRaw, childrenRes] = await Promise.all([
        api.getWorkitem(id),
        api.listWorkitemComments(id).catch(() => ({})),
        api.listWorkitemChildren(id).then(
          (r) => ({ items: r.items, error: null as string | null, debug: r.rawSample ?? null }),
          (e: unknown) => ({ items: [] as api.WorkitemChild[], error: String(e), debug: null as string | null }),
        ),
      ]);
      if (!isCurrent()) return;

      const comments = arr(commentsRaw);
      set({
        detail,
        comments,
        children: childrenRes.items,
        childrenError: childrenRes.error,
        childrenDebug: childrenRes.debug,
      });
    } catch (e) {
      if (isCurrent()) get().setToast({ text: `详情加载失败：${String(e)}`, kind: 'fail' });
    } finally {
      if (isCurrent()) set({ loadingDetail: false });
    }
    const { items, detail, children } = get();
    const wi = (detail?.workitem ?? detail ?? {}) as Record<string, unknown>;
    const selected = items.find((item) => item.workitemId === id);
    const childItem = children.find((c) => c.workitemId === id);
    const category = (typeof wi.category === 'string' && wi.category)
      || selected?.category
      || childItem?.category
      || get().category;
    const reposForTrace = s
      ? workitemRepoIds((category as Category) || 'Req', id, s)
      : [];
    if (isCurrent() && reposForTrace.length > 0) void get().loadTrace();
  },

  async loadTrace() {
    const requestId = ++requests.trace;
    const { settings: s, selectedId, items, detail, children } = get();
    if (!s || !selectedId) {
      set({ trace: null, traceLoading: false });
      return;
    }
    const wi = (detail?.workitem ?? detail ?? {}) as Record<string, unknown>;
    const cur = items.find((i) => i.workitemId === selectedId)
      ?? items.find((i) => i.identifier === selectedId);
    const childItem = children.find((c) => c.workitemId === selectedId);
    const identifier = cur?.identifier
      || childItem?.identifier
      || (typeof wi.identifier === 'string' ? wi.identifier : '')
      || (typeof wi.serialNumber === 'string' ? wi.serialNumber : '')
      || '';
    if (!identifier) {
      set({ trace: null, traceLoading: false });
      return;
    }
    const isCurrent = () =>
      requestId === requests.trace && get().selectedId === selectedId;

    set({ traceLoading: true });
    try {
      const category = (typeof wi.category === 'string' && wi.category)
        || cur?.category
        || childItem?.category
        || get().category;
      const trace = await loadWorkitemTrace(selectedId, identifier, (category as Category) || 'Req', s);
      if (isCurrent()) {
        set({ trace });
        if (category === 'Req') {
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
        ciRefreshedAt: Date.now(),
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
    const requestId = ++requests.logs;
    const binding = get().settings?.repoCiBindings?.[String(repoId)];
    if (binding?.provider === 'jenkins') {
      set({ logView: { title, text: '', repoId, runId, nextOffset: 0, hasMore: true } });
      await get().refreshRepoCiLogs();
      return;
    }
    set({ logView: { title, text: '', loading: true } });
    try {
      const text = await api.getRepoCiLogs(repoId, runId);
      if (requestId === requests.logs) set({ logView: { title, text, loading: false } });
    } catch (e) {
      if (requestId === requests.logs) {
        set({ logView: { title, text: `日志加载失败：${String(e)}`, error: String(e), loading: false } });
      }
    }
  },

  async refreshRepoCiLogs() {
    const current = get().logView;
    if (!current?.repoId || !current.runId || !current.hasMore || current.loading) return;
    const requestId = requests.logs;
    set({ logView: { ...current, loading: true, error: undefined } });
    try {
      const chunk = await api.getRepoCiLogChunk(current.repoId, current.runId, current.nextOffset ?? 0);
      if (requestId !== requests.logs) return;
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
    } catch (e) {
      if (requestId !== requests.logs) return;
      const latest = get().logView;
      if (!latest || latest.repoId !== current.repoId || latest.runId !== current.runId) return;
      set({ logView: { ...latest, loading: false, error: String(e) } });
    }
  },

  async loadPipelines() {
    const requestId = ++requests.pipelines;
    set({ loadingPipelines: true });
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
    } finally {
      if (requestId === requests.pipelines) {
        set({ loadingPipelines: false });
      }
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
    set({ logView: { title, text: '加载中…', loading: true } });
    try {
      const text = await api.getJobLogs(pipelineId, runId, jobId);
      if (requestId === requests.logs) set({ logView: { title, text, loading: false } });
    } catch (e) {
      if (requestId === requests.logs) {
        set({ logView: { title, text: `日志加载失败：${String(e)}`, error: String(e), loading: false } });
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
            iterations: [],
            selectedId: null,
            detail: null,
            comments: [],
            children: [],
            childrenError: null,
            childrenDebug: null,
            loadingDetail: false,
            pipelines: [],
            runsByPipeline: {},
            loadingPipelines: false,
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
      void get().loadIterations();
      if (traceContextChanged && !dataContextChanged && get().selectedId) {
        void get().loadTrace();
      } else if (repoCiChanged && get().trace) {
        void Promise.all(get().trace!.repositories.map((repo) => get().loadRepoCi(repo.repoId)));
      }
    }
  },

  updateChildStatusOptimistic: (workitemId: string, newStatus: string, statusId?: string) => {
    optimisticChildStatuses.set(workitemId, { status: newStatus, statusId, updatedAt: Date.now() });
    set({
      children: get().children.map((c) =>
        c.workitemId === workitemId
          ? { ...c, status: newStatus, statusId: statusId ?? c.statusId }
          : c,
      ),
    });
  },

  updateWorkitemStatusOptimistic: async (workitemId: string, newStatus: string, statusId?: string): Promise<boolean> => {
    const prevItems = get().items;
    const prevDetail = get().detail;
    const prevChildren = get().children;
    const targetItem = prevItems.find((it) => it.workitemId === workitemId);
    const targetChild = prevChildren.find((c) => c.workitemId === workitemId);
    const oldStatus = targetItem?.status ?? targetChild?.status;
    if (oldStatus === newStatus) return true;

    // 记录乐观状态时间戳，防止 ES 索引延迟覆盖
    optimisticChildStatuses.set(workitemId, { status: newStatus, statusId, updatedAt: Date.now() });

    // 1. 乐观即时更新本地 UI (<50ms)
    set({
      items: prevItems.map((it) => (it.workitemId === workitemId ? { ...it, status: newStatus } : it)),
      children: prevChildren.map((c) =>
        c.workitemId === workitemId
          ? { ...c, status: newStatus, statusId: statusId ?? c.statusId }
          : c,
      ),
      detail:
        prevDetail && (prevDetail.workitemId === workitemId || prevDetail.id === workitemId)
          ? { ...prevDetail, status: newStatus, statusStageName: newStatus }
          : prevDetail,
    });

    // 2. 后台异步调用 API
    try {
      let targetStatusId = statusId;
      if (!targetStatusId) {
        try {
          const statuses = await api.getWorkitemWorkflowStatuses(workitemId);
          const match = statuses.find(
            (s) => s.name === newStatus || s.name.includes(newStatus) || newStatus.includes(s.name),
          );
          if (match) targetStatusId = match.id;
        } catch {
          // 忽略状态字典拉取失败，尝试直接传 statusId
        }
      }
      if (targetStatusId) {
        await api.updateWorkitem(workitemId, { statusId: targetStatusId });
      }
      get().setToast({ text: `${targetItem?.identifier || targetChild?.identifier || '工作项'} 状态已流转为「${newStatus}」`, kind: 'ok' });
      return true;
    } catch (err) {
      optimisticChildStatuses.delete(workitemId);
      // 3. 接口报错回滚
      set({ items: prevItems, detail: prevDetail, children: prevChildren });
      get().setToast({ text: `状态流转失败: ${String(err)}`, kind: 'fail' });
      return false;
    }
  },
}));
