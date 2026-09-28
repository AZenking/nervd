// zustand 全局状态（契约 §5）
import { create } from 'zustand';
import * as api from '../lib/api';
import { matchesWorkitem } from '../lib/link';
import type {
  BranchInfo, Category, CommitSummary, ConnectionState, MrSummary,
  PipelineRunSummary, Settings, SettingsView, TraceResult, WorkitemSummary,
} from '../types';

// ---- 原始响应的宽松解析（云效字段大小写/嵌套不定，统一走防御式取值） ----
const pick = (o: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), o);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

export interface Toast { text: string; kind: 'info' | 'ok' | 'fail' }

interface AppStore {
  settings: SettingsView | null;
  connection: ConnectionState;
  booting: boolean;

  category: Category;
  items: WorkitemSummary[];
  nextToken: string | null;
  loadingList: boolean;

  selectedId: string | null;
  detail: Record<string, unknown> | null;
  comments: unknown[];
  loadingDetail: boolean;

  trace: TraceResult | null;
  traceLoading: boolean;

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
  loadPipelines(): Promise<void>;
  loadRuns(pipelineId: number): Promise<void>;
  openLogs(pipelineId: number, runId: number, jobId: number, title: string): Promise<void>;
  closeLogs(): void;
  setToast(t: Toast | null): void;
  saveAll(s: Settings, pat?: string): Promise<void>;
}

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
        await get().loadList();
        void get().loadPipelines();
      }
    } catch (e) {
      set({ booting: false, connection: 'fail' });
      get().setToast({ text: `初始化失败：${String(e)}`, kind: 'fail' });
    }
  },

  async refreshConnection() {
    try {
      await api.checkConnection();
      set({ connection: 'ok' });
    } catch {
      set({ connection: 'fail' });
    }
  },

  async setCategory(c) {
    set({ category: c, items: [], nextToken: null, selectedId: null, detail: null, trace: null });
    await get().loadList();
  },

  async loadList(next = false) {
    const s = get().settings;
    if (!s?.defaultSpaceIdentifier) return;
    set({ loadingList: true });
    try {
      const page = await api.listWorkitems({
        category: get().category,
        spaceIdentifier: s.defaultSpaceIdentifier,
        nextToken: next ? (get().nextToken ?? undefined) : undefined,
      });
      const mapped: WorkitemSummary[] = page.items.map((it) => ({
        ...it,
        assignedTo: it.assignedTo || '—',
      }));
      set((st) => ({
        items: next ? [...st.items, ...mapped] : mapped,
        nextToken: page.nextToken,
      }));
    } catch (e) {
      get().setToast({ text: `列表加载失败：${String(e)}`, kind: 'fail' });
    } finally {
      set({ loadingList: false });
    }
  },

  async select(id) {
    set({ selectedId: id, detail: null, comments: [], trace: null, loadingDetail: true });
    const s = get().settings;
    try {
      const [detail, commentsRaw] = await Promise.all([
        api.getWorkitem(id),
        api.listWorkitemComments(id).catch(() => ({})),
      ]);
      const comments = (pick(commentsRaw, 'commentList', 'result') as unknown[]) ?? [];
      set({ detail, comments: Array.isArray(comments) ? comments : [] });
    } catch (e) {
      get().setToast({ text: `详情加载失败：${String(e)}`, kind: 'fail' });
    } finally {
      set({ loadingDetail: false });
    }
    if (s?.watchedRepos?.length) void get().loadTrace();
  },

  async loadTrace() {
    const { settings: s, selectedId, items } = get();
    if (!s || !selectedId) return;
    const cur = items.find((i) => i.workitemId === selectedId)
      ?? items.find((i) => i.identifier === selectedId);
    const identifier = cur?.identifier ?? '';
    if (!identifier) return;
    set({ traceLoading: true });
    const branches: BranchInfo[] = [];
    const commits: CommitSummary[] = [];
    const mrs: MrSummary[] = [];
    await Promise.all(
      (s.watchedRepos ?? []).map(async (repoId) => {
        const [br, cm, mr] = await Promise.all([
          api.listBranches(repoId).catch(() => null),
          api.listRepositoryCommits(repoId).catch(() => null),
          api.listMergeRequests(repoId).catch(() => null),
        ]);
        const pattern = s.linkPattern;
        for (const b of ((pick(br, 'result', 'result') as unknown[]) ?? [])) {
          const name = str(pick(b, 'name'));
          if (name && matchesWorkitem(identifier, name, pattern)) {
            branches.push({ name, commit: pick(b, 'commit') as BranchInfo['commit'] });
          }
        }
        for (const c of ((pick(cm, 'result') as unknown[]) ?? [])) {
          const msg = str(pick(c, 'message')) || str(pick(c, 'title'));
          if (msg && matchesWorkitem(identifier, msg, pattern)) {
            commits.push({
              sha: str(pick(c, 'sha')) || str(pick(c, 'id')),
              message: msg,
              authorName: str(pick(c, 'authorName')) || str(pick(c, 'author', 'name')),
              committedDate: str(pick(c, 'committedDate')),
            });
          }
        }
        for (const m of ((pick(mr, 'result') as unknown[]) ?? [])) {
          const title = str(pick(m, 'title'));
          if (title && matchesWorkitem(identifier, title, pattern)) {
            mrs.push({
              localId: Number(pick(m, 'localId') ?? pick(m, 'local_id') ?? 0),
              title,
              state: str(pick(m, 'state')) || str(pick(m, 'status')),
              sourceBranch: str(pick(m, 'sourceBranch')) || str(pick(m, 'src_branch')),
              targetBranch: str(pick(m, 'targetBranch')) || str(pick(m, 'target_branch')),
              author: pick(m, 'author') as MrSummary['author'],
              createdAt: str(pick(m, 'createdAt')),
            });
          }
        }
      }),
    );
    set({ trace: { workitemId: selectedId, branches, commits, mergeRequests: mrs, runs: [], scannedAt: Date.now() }, traceLoading: false });
  },

  async loadPipelines() {
    try {
      const pipelines = await api.listPipelines(20);
      set({ pipelines });
      for (const p of pipelines.slice(0, 10)) void get().loadRuns(p.pipelineId);
    } catch {
      /* 静默：流水线区失败不阻塞主流程 */
    }
  },

  async loadRuns(pipelineId) {
    try {
      const runs = await api.listPipelineRuns(pipelineId, 5);
      set((st) => ({ runsByPipeline: { ...st.runsByPipeline, [pipelineId]: runs } }));
    } catch {
      /* 同上 */
    }
  },

  async openLogs(pipelineId, runId, jobId, title) {
    set({ logView: { title, text: '加载中…' } });
    try {
      const text = await api.getJobLogs(pipelineId, runId, jobId);
      set({ logView: { title, text } });
    } catch (e) {
      set({ logView: { title, text: `日志加载失败：${String(e)}` } });
    }
  },

  closeLogs() {
    set({ logView: null });
  },

  setToast(t) {
    set({ toast: t });
    if (t) setTimeout(() => set((st) => (st.toast === t ? { toast: null } : {})), 4000);
  },

  async saveAll(s, pat) {
    if (pat) await api.savePat(pat);
    const settings = await api.saveSettings(s);
    set({ settings });
    await get().refreshConnection();
    if (settings.hasPat && settings.organizationId && settings.defaultSpaceIdentifier) {
      await get().loadList();
      void get().loadPipelines();
    }
  },
}));
