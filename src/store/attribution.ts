// 变更归属状态（Zustand）。
//
// 与 `useApp` 解耦：本 store 只服务 attribution 视图与回写，UI 状态（选中/展开）
// 仍由组件自身维护。所有失败都会落到中文可读 toast + 对应 error 字段，不吞错。
import { create } from 'zustand';
import * as attributionApi from '@/lib/attribution-api';
import { useApp } from './app';
import { errorLog } from '@/lib/error-format';
import { describeAttributionError } from '@/lib/attribution-format';
import type {
  ActiveWorkitem,
  ActivityPolicy,
  AttributionRelation,
  AttributionStatus,
  HookMode,
  HookStatus,
  LocalRepoBinding,
  LocalRepoInfo,
  SyncReport,
  WorkitemChange,
} from '@/types/attribution';

const PAGE_SIZE = 50;

export interface AttributionRequestOptions {
  /** 后台轮询使用：失败只进 console，不弹 toast。 */
  silent?: boolean;
  /** 手动同步：强制重新解析编号（忽略 1 小时负缓存）。 */
  force?: boolean;
  /** 手动同步：忽略游标回填最近窗口，让已索引事件重新计算归属。 */
  full?: boolean;
}

function toastFail(text: string, options?: AttributionRequestOptions): void {
  errorLog('attribution', text);
  if (options?.silent) return;
  useApp.getState().setToast({ kind: 'fail', text });
}

function toastOk(text: string, options?: AttributionRequestOptions): void {
  if (options?.silent) return;
  useApp.getState().setToast({ kind: 'ok', text });
}

/** 同一 eventId 只保留一条（后到的覆盖先到的），并按发生时间倒序。 */
export function mergeTimeline(
  existing: WorkitemChange[],
  incoming: WorkitemChange[],
): WorkitemChange[] {
  const byId = new Map<string, WorkitemChange>();
  for (const item of existing) byId.set(item.id, item);
  for (const item of incoming) {
    const previous = byId.get(item.id);
    byId.set(item.id, previous ? { ...previous, ...item } : item);
  }
  return [...byId.values()].sort((a, b) => b.occurredAt - a.occurredAt);
}

export interface AttributionState {
  timelineByWorkitem: Record<string, WorkitemChange[]>;
  loadingTimeline: Record<string, boolean>;
  timelineError: Record<string, string | null>;
  /** 分页游标：undefined=尚未加载，null=没有更多。 */
  timelineNextBefore: Record<string, number | null | undefined>;
  timelineIncludeRollup: Record<string, boolean>;

  unassigned: WorkitemChange[];
  unassignedLoading: boolean;
  status: AttributionStatus | null;
  policy: ActivityPolicy | null;
  bindings: LocalRepoBinding[];
  /** 活动工作项按仓库记录：repoId -> 该目录 `.nervd/active-workitem.json` 的内容 */
  activeWorkitems: Record<number, ActiveWorkitem>;
  syncing: boolean;

  loadTimeline(workitemId: string, includeRollup?: boolean): Promise<WorkitemChange[] | null>;
  loadMore(workitemId: string, includeRollup?: boolean): Promise<WorkitemChange[] | null>;
  loadUnassigned(options?: AttributionRequestOptions): Promise<WorkitemChange[] | null>;
  assign(input: {
    eventId: string;
    workitemId: string;
    relation?: AttributionRelation;
  }): Promise<boolean>;
  refreshStatus(options?: AttributionRequestOptions): Promise<AttributionStatus | null>;
  syncNow(options?: AttributionRequestOptions): Promise<SyncReport | null>;
  loadPolicy(options?: AttributionRequestOptions): Promise<ActivityPolicy | null>;
  savePolicy(policy: ActivityPolicy, options?: AttributionRequestOptions): Promise<ActivityPolicy | null>;
  loadBindings(options?: AttributionRequestOptions): Promise<LocalRepoBinding[] | null>;
  saveBinding(repoId: number, path: string, options?: AttributionRequestOptions): Promise<LocalRepoBinding | null>;
  deleteBinding(repoId: number, options?: AttributionRequestOptions): Promise<boolean>;
  loadActive(repoId?: number, options?: AttributionRequestOptions): Promise<ActiveWorkitem | null>;
  loadActiveWorkitems(options?: AttributionRequestOptions): Promise<Record<number, ActiveWorkitem> | null>;
  setActive(input: {
    repoId: number;
    workitemId?: string;
    parentWorkitemId?: string;
  }, options?: AttributionRequestOptions): Promise<boolean>;
  installHook(repoId: number, mode?: HookMode, options?: AttributionRequestOptions): Promise<HookStatus | null>;
  uninstallHook(repoId: number, options?: AttributionRequestOptions): Promise<HookStatus | null>;
  inspect(path: string, options?: AttributionRequestOptions): Promise<LocalRepoInfo | null>;
}

export const useAttribution = create<AttributionState>()((set, get) => ({
  timelineByWorkitem: {},
  loadingTimeline: {},
  timelineError: {},
  timelineNextBefore: {},
  timelineIncludeRollup: {},
  unassigned: [],
  unassignedLoading: false,
  status: null,
  policy: null,
  bindings: [],
  activeWorkitems: {},
  syncing: false,

  async loadTimeline(workitemId, includeRollup) {
    if (!workitemId) return null;
    const rollup = includeRollup ?? get().timelineIncludeRollup[workitemId] ?? true;
    set((state) => ({
      loadingTimeline: { ...state.loadingTimeline, [workitemId]: true },
      timelineError: { ...state.timelineError, [workitemId]: null },
      timelineIncludeRollup: { ...state.timelineIncludeRollup, [workitemId]: rollup },
    }));

    try {
      const page = await attributionApi.listWorkitemChanges({
        workitemId,
        limit: PAGE_SIZE,
        includeRollup: rollup,
      });
      set((state) => ({
        timelineByWorkitem: {
          ...state.timelineByWorkitem,
          [workitemId]: mergeTimeline(state.timelineByWorkitem[workitemId] ?? [], page.items ?? []),
        },
        timelineNextBefore: {
          ...state.timelineNextBefore,
          [workitemId]: page.nextBefore ?? null,
        },
        loadingTimeline: { ...state.loadingTimeline, [workitemId]: false },
      }));
      return get().timelineByWorkitem[workitemId] ?? [];
    } catch (error) {
      const text = `变更时间线加载失败：${describeAttributionError(error, '请检查网络后重试')}`;
      set((state) => ({
        timelineError: { ...state.timelineError, [workitemId]: text },
        loadingTimeline: { ...state.loadingTimeline, [workitemId]: false },
      }));
      toastFail(text);
      return null;
    }
  },

  async loadMore(workitemId, includeRollup) {
    if (!workitemId) return null;
    if (get().loadingTimeline[workitemId]) return null;
    const before = get().timelineNextBefore[workitemId];
    if (before === null) return get().timelineByWorkitem[workitemId] ?? [];

    const rollup = includeRollup ?? get().timelineIncludeRollup[workitemId] ?? true;
    set((state) => ({
      loadingTimeline: { ...state.loadingTimeline, [workitemId]: true },
      timelineError: { ...state.timelineError, [workitemId]: null },
    }));

    try {
      const page = await attributionApi.listWorkitemChanges({
        workitemId,
        limit: PAGE_SIZE,
        before,
        includeRollup: rollup,
      });
      set((state) => ({
        timelineByWorkitem: {
          ...state.timelineByWorkitem,
          [workitemId]: mergeTimeline(state.timelineByWorkitem[workitemId] ?? [], page.items ?? []),
        },
        timelineNextBefore: {
          ...state.timelineNextBefore,
          [workitemId]: page.nextBefore ?? null,
        },
        loadingTimeline: { ...state.loadingTimeline, [workitemId]: false },
      }));
      return get().timelineByWorkitem[workitemId] ?? [];
    } catch (error) {
      const text = `更多变更加载失败：${describeAttributionError(error, '请稍后重试')}`;
      set((state) => ({
        timelineError: { ...state.timelineError, [workitemId]: text },
        loadingTimeline: { ...state.loadingTimeline, [workitemId]: false },
      }));
      toastFail(text);
      return null;
    }
  },

  async loadUnassigned(options) {
    set({ unassignedLoading: true });
    try {
      const page = await attributionApi.listUnattributedChanges({ limit: PAGE_SIZE });
      set({ unassigned: mergeTimeline([], page.items ?? []), unassignedLoading: false });
      return get().unassigned;
    } catch (error) {
      const text = `待归属变更加载失败：${describeAttributionError(error, '请检查网络后重试')}`;
      set({ unassignedLoading: false });
      toastFail(text, options);
      return null;
    }
  },

  async assign(input) {
    try {
      const ok = await attributionApi.assignChangeWorkitem({
        eventId: input.eventId,
        workitemId: input.workitemId,
        relation: input.relation,
      });
      if (!ok) throw new Error('后端未确认归属结果');

      set((state) => {
        const timelineByWorkitem: Record<string, WorkitemChange[]> = {};
        for (const [workitemId, items] of Object.entries(state.timelineByWorkitem)) {
          timelineByWorkitem[workitemId] = items.map((item) =>
            item.id === input.eventId
              ? {
                  ...item,
                  workitemId: input.workitemId,
                  relation: input.relation ?? item.relation,
                  confidence: 'manual',
                }
              : item,
          );
        }
        const assigned = state.unassigned.find((item) => item.id === input.eventId);
        if (assigned) {
          const next: WorkitemChange = {
            ...assigned,
            workitemId: input.workitemId,
            relation: input.relation ?? assigned.relation,
            confidence: 'manual',
          };
          timelineByWorkitem[input.workitemId] = mergeTimeline(
            timelineByWorkitem[input.workitemId] ?? state.timelineByWorkitem[input.workitemId] ?? [],
            [next],
          );
        }
        return {
          timelineByWorkitem,
          unassigned: state.unassigned.filter((item) => item.id !== input.eventId),
        };
      });
      toastOk(`已归属到 ${input.workitemId}`);
      return true;
    } catch (error) {
      toastFail(`变更归属失败：${describeAttributionError(error, '请稍后重试')}`);
      return false;
    }
  },

  async refreshStatus(options) {
    try {
      const status = await attributionApi.getAttributionStatus();
      set({ status, syncing: status.syncing });
      return status;
    } catch (error) {
      const text = `变更归属状态读取失败：${describeAttributionError(error, '请稍后重试')}`;
      toastFail(text, options);
      return null;
    }
  },

  async syncNow(options) {
    if (get().syncing) return null;
    set({ syncing: true });
    try {
      const report = await attributionApi.syncAttribution({
        force: options?.force,
        full: options?.full,
      });
      const finishedAt = report.finishedAt || Date.now();
      set((state) => ({
        syncing: false,
        status: state.status
          ? { ...state.status, syncing: false, lastSyncAt: finishedAt }
          : { lastSyncAt: finishedAt, syncing: false, repos: [] },
      }));
      const failed = report.repos.filter((repo) => !repo.ok).length;
      const commits = report.repos.reduce((sum, repo) => sum + (repo.commits ?? 0), 0);
      toastOk(
        `变更同步完成：${report.repos.length} 个仓库 / ${commits} 条提交${failed ? `（${failed} 个仓库失败）` : ''}`,
        options,
      );
      // 后台同步由 hook 自行刷新待归属队列，避免重复请求。
      if (!options?.silent) void get().loadUnassigned({ silent: true });
      return report;
    } catch (error) {
      set({ syncing: false });
      toastFail(`变更同步失败：${describeAttributionError(error, '请检查网络后重试')}`, options);
      return null;
    }
  },

  async loadPolicy(options) {
    try {
      const policy = await attributionApi.getActivityPolicy();
      set({ policy });
      return policy;
    } catch (error) {
      toastFail(`回写策略读取失败：${describeAttributionError(error, '请稍后重试')}`, options);
      return null;
    }
  },

  async savePolicy(policy, options) {
    try {
      const saved = await attributionApi.saveActivityPolicy({ policy });
      set({ policy: saved });
      toastOk('回写策略已保存', options);
      return saved;
    } catch (error) {
      toastFail(`回写策略保存失败：${describeAttributionError(error, '请稍后重试')}`, options);
      return null;
    }
  },

  async loadBindings(options) {
    try {
      const bindings = await attributionApi.listLocalRepoBindings();
      set({ bindings });
      return bindings;
    } catch (error) {
      toastFail(`本地仓库绑定读取失败：${describeAttributionError(error, '请稍后重试')}`, options);
      return null;
    }
  },

  async saveBinding(repoId, path, options) {
    try {
      const binding = await attributionApi.saveLocalRepoBinding({ repoId, path });
      set((state) => ({
        bindings: [...state.bindings.filter((item) => item.repoId !== repoId), binding],
      }));
      toastOk('本地仓库绑定已保存', options);
      return binding;
    } catch (error) {
      toastFail(`本地仓库绑定保存失败：${describeAttributionError(error, '请检查路径后重试')}`, options);
      return null;
    }
  },

  async deleteBinding(repoId, options) {
    try {
      const ok = await attributionApi.deleteLocalRepoBinding({ repoId });
      if (!ok) throw new Error('后端未确认删除结果');
      set((state) => ({ bindings: state.bindings.filter((item) => item.repoId !== repoId) }));
      toastOk('本地仓库绑定已移除', options);
      return true;
    } catch (error) {
      toastFail(`本地仓库绑定移除失败：${describeAttributionError(error, '请稍后重试')}`, options);
      return false;
    }
  },

  async loadActive(repoId, options) {
    if (repoId == null) {
      await get().loadActiveWorkitems(options);
      return Object.values(get().activeWorkitems).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    }
    try {
      const active = await attributionApi.getActiveWorkitem({ repoId });
      set((state) => {
        const next = { ...state.activeWorkitems };
        if (active) next[repoId] = active;
        else delete next[repoId];
        return { activeWorkitems: next };
      });
      return active;
    } catch (error) {
      toastFail(`当前工作项读取失败：${describeAttributionError(error, '请稍后重试')}`, options);
      return null;
    }
  },

  async loadActiveWorkitems(options) {
    try {
      const items = await attributionApi.listActiveWorkitems();
      const activeWorkitems = Object.fromEntries(items.map((item) => [item.repoId, item]));
      set({ activeWorkitems });
      return activeWorkitems;
    } catch (error) {
      toastFail(`当前工作项读取失败：${describeAttributionError(error, '请稍后重试')}`, options);
      return null;
    }
  },

  async setActive(input, options) {
    try {
      const ok = await attributionApi.setActiveWorkitem(input);
      if (!ok) throw new Error('后端未确认当前工作项');
      // 重新汇总所有仓库的活动状态（按仓库记录，避免只看被写入的那个）
      await get().loadActiveWorkitems({ silent: true });
      toastOk('当前工作项已切换', options);
      return true;
    } catch (error) {
      toastFail(`当前工作项切换失败：${describeAttributionError(error, '请稍后重试')}`, options);
      return false;
    }
  },

  async installHook(repoId, mode, options) {
    try {
      const hook = await attributionApi.installCommitMsgHook({ repoId, mode });
      patchBindingHook(set, repoId, hook);
      toastOk('Git commit-msg 钩子已安装', options);
      return hook;
    } catch (error) {
      toastFail(`Git 钩子安装失败：${describeAttributionError(error, '请确认仓库路径后重试')}`, options);
      return null;
    }
  },

  async uninstallHook(repoId, options) {
    try {
      const hook = await attributionApi.uninstallCommitMsgHook({ repoId });
      patchBindingHook(set, repoId, hook);
      toastOk('Git commit-msg 钩子已卸载', options);
      return hook;
    } catch (error) {
      toastFail(`Git 钩子卸载失败：${describeAttributionError(error, '请稍后重试')}`, options);
      return null;
    }
  },

  async inspect(path, options) {
    if (!path.trim()) {
      toastFail('请先选择本地仓库目录', options);
      return null;
    }
    try {
      return await attributionApi.inspectLocalRepo({ path });
    } catch (error) {
      toastFail(`本地仓库探测失败：${describeAttributionError(error, '请确认目录是 Git 仓库')}`, options);
      return null;
    }
  },
}));

/** 钩子安装/卸载后同步本地 bindings 里的 hook 状态；未绑定的仓库不凭空插入。 */
function patchBindingHook(
  set: (updater: (state: AttributionState) => Partial<AttributionState>) => void,
  repoId: number,
  hook: HookStatus,
): void {
  set((state) => ({
    bindings: state.bindings.map((binding) =>
      binding.repoId === repoId
        ? { ...binding, hookInstalled: hook.installed, hookMode: hook.mode }
        : binding,
    ),
  }));
}