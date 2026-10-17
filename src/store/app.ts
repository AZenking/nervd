// zustand 全局状态（契约 §5）
import { create } from 'zustand';
import * as api from '../lib/api';
import type { WorkitemRow, WorkitemChild, CurrentYunxiaoUser } from '../lib/api';
import { workitemRepoIds } from '../lib/workitem-repos';
import {
  type WorkitemHighlightSettings,
  loadHighlightSettings,
  saveHighlightSettings,
} from '../lib/workitem-highlight';
import { errorLog } from '../lib/error-format';
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

  currentUser: CurrentYunxiaoUser | null;
  loadingCurrentUser: boolean;
  workitemHighlight: WorkitemHighlightSettings;

  /** 最近一次工作项列表加载时间戳 */
  listFetchedAt: number | null;
  /** 最近一次迭代列表加载时间戳 */
  iterationsFetchedAt: number | null;
  /** 最近一次选中工作项详情加载时间戳 */
  detailFetchedAt: number | null;
  /** CI 活跃态保持时间戳截止点（ms） */
  ciActiveUntil: number;

  init(): Promise<void>;
  loadSettings(): Promise<SettingsView | null>;
  refreshConnection(): Promise<void>;
  loadCurrentUser(): Promise<void>;
  setWorkitemHighlight(patch: Partial<WorkitemHighlightSettings>): void;
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
  updateWorkitemDescriptionOptimistic(workitemId: string, newDescription: string): Promise<boolean>;
  updateWorkitemAssigneeOptimistic(workitemId: string, newAssigneeId: string, newAssigneeName: string): Promise<boolean>;
  updateChildStatusOptimistic(workitemId: string, newStatus: string, statusId?: string): void;
  addOptimisticChild(parentWorkitemId: string, childOrChildren: WorkitemChild | WorkitemChild[]): void;
  reloadComments(id?: string): Promise<void>;
  markRepoCiActive(durationMs?: number): void;
  refreshAllRepoCi(): Promise<void>;
  reloadCurrentDetail(): Promise<void>;
  revalidateIfStale(maxAgeMs?: number): Promise<void>;
}

const requests = { connection: 0, list: 0, detail: 0, trace: 0, pipelines: 0, logs: 0 };
const pipelineRunRequests = new Map<number, number>();
const repoCiRequests = new Map<number, number>();
const childrenRequests = new Map<string, number>();
const optimisticChildStatuses = new Map<string, { status: string; statusId?: string; updatedAt: number }>();
const optimisticCreatedChildren = new Map<string, { parentId: string; item: WorkitemChild; createdAt: number }>();

function mergeChildrenWithOptimistic(
  workitemId: string,
  serverItems: WorkitemChild[],
): WorkitemChild[] {
  const now = Date.now();
  // 1. 保留乐观状态变更（15秒内）
  const mergedServerItems = serverItems.map((item) => {
    const opt = optimisticChildStatuses.get(item.workitemId);
    if (opt && now - opt.updatedAt < 15000) {
      return { ...item, status: opt.status, statusId: opt.statusId ?? item.statusId };
    }
    return item;
  });

  const existingIds = new Set(mergedServerItems.map((c) => c.workitemId));
  const pendingOptimistic: WorkitemChild[] = [];

  // 2. 检查最近创建的乐观子项（30秒内），防 ES 索引延迟覆盖
  for (const [childId, record] of optimisticCreatedChildren.entries()) {
    if (now - record.createdAt > 30000) {
      optimisticCreatedChildren.delete(childId);
    } else if (record.parentId === workitemId) {
      if (existingIds.has(childId)) {
        // ES 已经收录，清除临时乐观记录
        optimisticCreatedChildren.delete(childId);
      } else {
        // ES 尚未收录，保留在列表前端并结合可能发生的乐观状态
        const opt = optimisticChildStatuses.get(childId);
        if (opt && now - opt.updatedAt < 15000) {
          pendingOptimistic.push({ ...record.item, status: opt.status, statusId: opt.statusId ?? record.item.statusId });
        } else {
          pendingOptimistic.push(record.item);
        }
      }
    }
  }

  return [...pendingOptimistic, ...mergedServerItems];
}

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

  currentUser: null,
  loadingCurrentUser: false,
  workitemHighlight: loadHighlightSettings(),

  listFetchedAt: null,
  iterationsFetchedAt: null,
  detailFetchedAt: null,
  ciActiveUntil: 0,

  async init() {
    try {
      const settings = await api.getSettings();
      set({ settings, booting: false });
      if (settings.hasPat) {
        void get().loadCurrentUser();
      }
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

  async loadSettings() {
    try {
      const settings = await api.getSettings();
      set({ settings });
      return settings;
    } catch (e) {
      errorLog('app.loadSettings', e);
      return null;
    }
  },

  async refreshConnection() {
    const requestId = ++requests.connection;
    try {
      await api.checkConnection();
      if (requestId === requests.connection) set({ connection: 'ok' });
      void get().loadCurrentUser();
    } catch {
      if (requestId === requests.connection) set({ connection: 'fail' });
    }
  },

  async loadCurrentUser() {
    const { settings } = get();
    if (!settings?.hasPat) {
      set({ currentUser: null });
      return;
    }
    set({ loadingCurrentUser: true });
    try {
      const user = await api.getCurrentUser();
      set({ currentUser: user });
    } catch (e) {
      errorLog('app.loadCurrentUser', e);
    } finally {
      set({ loadingCurrentUser: false });
    }
  },

  setWorkitemHighlight(patch) {
    const next = { ...get().workitemHighlight, ...patch };
    saveHighlightSettings(next);
    set({ workitemHighlight: next });
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
      listFetchedAt: null,
      detailFetchedAt: null,
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
        listFetchedAt: Date.now(),
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
      set({ iterations, loadingIterations: false, iterationsFetchedAt: Date.now() });
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
      const finalItems = mergeChildrenWithOptimistic(workitemId, result.items);
      set({ children: finalItems, childrenError: null, childrenDebug: result.rawSample ?? null });

      // 如果依然有未被 ES 索引收录的乐观子项，在后台安排一次延迟对齐重试（2 秒后）
      const hasUnindexed = Array.from(optimisticCreatedChildren.values()).some(
        (r) => r.parentId === workitemId && Date.now() - r.createdAt < 30000,
      );
      if (hasUnindexed) {
        setTimeout(() => {
          if (childrenRequests.get(workitemId) === requestId && get().selectedId === workitemId) {
            void get().loadChildren(workitemId);
          }
        }, 2000);
      }
    } catch (error) {
      if (childrenRequests.get(workitemId) !== requestId || get().selectedId !== workitemId) return;
      const fallbackItems = mergeChildrenWithOptimistic(workitemId, []);
      set({ children: fallbackItems, childrenError: String(error), childrenDebug: null });
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
      const finalChildren = mergeChildrenWithOptimistic(id, childrenRes.items);
      set({
        detail,
        comments,
        children: finalChildren,
        childrenError: childrenRes.error,
        childrenDebug: childrenRes.debug,
        detailFetchedAt: Date.now(),
      });
    } catch (e) {
      if (isCurrent()) get().setToast({ text: `详情加载失败：${String(e)}`, kind: 'fail' });
    } finally {
      if (get().selectedId === id) set({ loadingDetail: false });
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

  async reloadComments(id?: string) {
    const targetId = id ?? get().selectedId;
    if (!targetId) return;
    try {
      const raw = await api.listWorkitemComments(targetId);
      set({ comments: arr(raw) });
    } catch {
      // 忽略评论刷新错误
    }
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
    const createdRecord = optimisticCreatedChildren.get(workitemId);
    if (createdRecord) {
      createdRecord.item.status = newStatus;
      if (statusId) createdRecord.item.statusId = statusId;
    }
    set({
      children: get().children.map((c) =>
        c.workitemId === workitemId
          ? { ...c, status: newStatus, statusId: statusId ?? c.statusId }
          : c,
      ),
    });
  },

  addOptimisticChild: (parentWorkitemId: string, childOrChildren: WorkitemChild | WorkitemChild[]) => {
    const childrenList = Array.isArray(childOrChildren) ? childOrChildren : [childOrChildren];
    const now = Date.now();
    for (const c of childrenList) {
      optimisticCreatedChildren.set(c.workitemId, {
        parentId: parentWorkitemId,
        item: c,
        createdAt: now,
      });
    }
    if (get().selectedId === parentWorkitemId) {
      const currentChildren = get().children;
      const currentIds = new Set(currentChildren.map((c) => c.workitemId));
      const toAdd = childrenList.filter((c) => !currentIds.has(c.workitemId));
      if (toAdd.length > 0) {
        set({ children: [...toAdd, ...currentChildren] });
      }
    }
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
      } else {
        throw new Error(`无法找到目标状态「${newStatus}」对应的工作流状态 ID`);
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

  updateWorkitemDescriptionOptimistic: async (workitemId: string, newDescription: string): Promise<boolean> => {
    const prevItems = get().items;
    const prevDetail = get().detail;
    const prevChildren = get().children;

    // 1. 乐观即时更新本地 UI (<50ms)，保持原 detail 其它属性完好，避免触发骨架屏大刷新
    if (prevDetail) {
      const wi = (prevDetail.workitem ?? prevDetail) as Record<string, unknown>;
      const isTarget =
        prevDetail.workitemId === workitemId ||
        prevDetail.id === workitemId ||
        wi.workitemId === workitemId ||
        wi.id === workitemId;

      const nextDetail = isTarget
        ? {
            ...prevDetail,
            description: newDescription,
            content: newDescription,
            ...(prevDetail.workitem
              ? {
                  workitem: {
                    ...(prevDetail.workitem as Record<string, unknown>),
                    description: newDescription,
                    content: newDescription,
                  },
                }
              : {}),
          }
        : prevDetail;

      set({
        detail: nextDetail,
        items: prevItems.map((it) =>
          it.workitemId === workitemId ? { ...it, description: newDescription } : it,
        ),
        children: prevChildren.map((c) =>
          c.workitemId === workitemId ? { ...c, description: newDescription } : c,
        ),
      });
    }

    // 2. 后台异步调用 API
    try {
      await api.updateWorkitem(workitemId, {
        description: newDescription,
        formatType: 'RICHTEXT',
      });
      return true;
    } catch (err) {
      // 3. 接口报错回滚
      set({ items: prevItems, detail: prevDetail, children: prevChildren });
      get().setToast({ text: `描述保存失败: ${String(err)}`, kind: 'fail' });
      return false;
    }
  },

  updateWorkitemAssigneeOptimistic: async (
    workitemId: string,
    newAssigneeId: string,
    newAssigneeName: string,
  ): Promise<boolean> => {
    const prevItems = get().items;
    const prevDetail = get().detail;
    const prevChildren = get().children;
    const targetItem = prevItems.find((it) => it.workitemId === workitemId);
    const targetChild = prevChildren.find((c) => c.workitemId === workitemId);
    const oldAssignee = targetItem?.assignedTo ?? targetChild?.assignedTo;
    if (oldAssignee === newAssigneeName) return true;

    // 1. 同步更新乐观创建记录（如果在最近创建列表中）
    const optCreated = optimisticCreatedChildren.get(workitemId);
    if (optCreated) {
      optCreated.item.assignedTo = newAssigneeName;
    }

    // 2. 乐观即时更新本地 UI (<50ms)
    let nextDetail = prevDetail;
    if (prevDetail) {
      const wi = (prevDetail.workitem ?? prevDetail) as Record<string, unknown>;
      const isTarget =
        prevDetail.workitemId === workitemId ||
        prevDetail.id === workitemId ||
        wi.workitemId === workitemId ||
        wi.id === workitemId;

      if (isTarget) {
        const nextAssignedTo =
          typeof prevDetail.assignedTo === 'object' && prevDetail.assignedTo !== null
            ? { ...(prevDetail.assignedTo as Record<string, unknown>), id: newAssigneeId, name: newAssigneeName }
            : newAssigneeName;

        const nextWiAssignedTo =
          wi && typeof wi.assignedTo === 'object' && wi.assignedTo !== null
            ? { ...(wi.assignedTo as Record<string, unknown>), id: newAssigneeId, name: newAssigneeName }
            : newAssigneeName;

        nextDetail = {
          ...prevDetail,
          assignedTo: nextAssignedTo,
          ...(prevDetail.workitem
            ? {
                workitem: {
                  ...(prevDetail.workitem as Record<string, unknown>),
                  assignedTo: nextWiAssignedTo,
                },
              }
            : {}),
        };
      }
    }

    set({
      items: prevItems.map((it) =>
        it.workitemId === workitemId
          ? { ...it, assignedTo: newAssigneeName, assignedToId: newAssigneeId }
          : it,
      ),
      children: prevChildren.map((c) =>
        c.workitemId === workitemId
          ? { ...c, assignedTo: newAssigneeName }
          : c,
      ),
      detail: nextDetail,
    });

    // 3. 后台异步调用 API
    try {
      await api.updateWorkitem(workitemId, { assignedTo: newAssigneeId });
      const identifier = targetItem?.identifier || targetChild?.identifier || '工作项';
      get().setToast({ text: `${identifier} 负责人已变更为「${newAssigneeName}」`, kind: 'ok' });
      return true;
    } catch (err) {
      // 4. 报错回滚
      if (optCreated) {
        optCreated.item.assignedTo = oldAssignee;
      }
      set({ items: prevItems, detail: prevDetail, children: prevChildren });
      get().setToast({ text: `负责人修改失败: ${String(err)}`, kind: 'fail' });
      return false;
    }
  },

  markRepoCiActive(durationMs = 90_000) {
    const until = Date.now() + durationMs;
    set((s) => ({ ciActiveUntil: Math.max(s.ciActiveUntil, until) }));
  },

  async refreshAllRepoCi() {
    const { settings, repositories, repoCiByRepo, loadRepoCi } = get();
    if (!settings?.repoCiBindings) return;
    const targetIds: number[] = [];
    for (const repo of repositories) {
      if (settings.repoCiBindings[String(repo.id)] && !repoCiByRepo[repo.id]?.loading) {
        targetIds.push(repo.id);
      }
    }
    await Promise.all(targetIds.map((id) => loadRepoCi(id)));
  },

  async reloadCurrentDetail() {
    const id = get().selectedId;
    if (!id) return;
    const requestId = ++requests.detail;
    const isCurrent = () => requestId === requests.detail && get().selectedId === id;
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
      const finalChildren = mergeChildrenWithOptimistic(id, childrenRes.items);
      set({
        detail,
        comments,
        children: finalChildren,
        childrenError: childrenRes.error,
        childrenDebug: childrenRes.debug,
        detailFetchedAt: Date.now(),
      });
      void get().loadTrace();
    } catch (e) {
      errorLog('app.reloadCurrentDetail', e);
    }
  },

  async revalidateIfStale(maxAgeMs = 120_000) {
    const {
      booting, connection, settings,
      listFetchedAt, iterationsFetchedAt, detailFetchedAt,
      loadingList, loadingIterations, selectedId,
    } = get();
    if (booting || connection !== 'ok' || !settings?.organizationId || !settings?.defaultSpaceIdentifier) return;
    const now = Date.now();
    const tasks: Promise<void>[] = [];
    if (!loadingList && (!listFetchedAt || now - listFetchedAt > maxAgeMs)) {
      tasks.push(get().loadList(false));
    }
    if (!loadingIterations && (!iterationsFetchedAt || now - iterationsFetchedAt > maxAgeMs)) {
      tasks.push(get().loadIterations());
    }
    if (selectedId && (!detailFetchedAt || now - detailFetchedAt > maxAgeMs)) {
      tasks.push(get().reloadCurrentDetail());
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  },
}));
