// 设置编辑单会话：所有设置区共享同一份草稿，
// 消除双表单并发编辑互相覆盖的数据丢失风险；dirty 状态配合 ui store 的导航守卫使用。
import { create } from 'zustand';
import * as api from '../lib/api';
import type { JenkinsConnection, RepoCiBinding, Settings, SettingsView } from '../types';
// 注意：app ↔ ui ↔ settings-draft 存在模块环，但相互引用均发生在动作执行期（运行时），
// 模块初始化期无交叉引用，ESM 下安全。
import { useApp } from './app';

/** 与已保存 settings 可比对的形态（剥离视图字段，保证属性顺序一致） */
export const normalize = (s: SettingsView | null | undefined): Settings | null => {
  if (!s) return null;
  return {
    organizationId: s.organizationId || '',
    defaultSpaceIdentifier: s.defaultSpaceIdentifier || '',
    linkPattern: s.linkPattern || '',
    watchedRepos: s.watchedRepos ?? [],
    allowWriteOps: Boolean(s.allowWriteOps),
    workitemRepos: s.workitemRepos ?? {},
    branchRuleTemplates: s.branchRuleTemplates ?? [],
    workitemRepoBranchTemplates: s.workitemRepoBranchTemplates ?? {},
    jenkinsConnections: (s.jenkinsConnections ?? []).map(({ hasToken: _hasToken, ...connection }) => ({
      id: connection.id,
      name: connection.name,
      baseUrl: connection.baseUrl,
      username: connection.username,
    })),
    repoCiBindings: s.repoCiBindings ?? {},
  };
};

const EMPTY_SETTINGS: Settings = {
  organizationId: '',
  defaultSpaceIdentifier: '',
  linkPattern: '(?:REQ|BUG|TASK)[-_]?(\\d+)',
  watchedRepos: [],
  allowWriteOps: false,
  workitemRepos: {},
  branchRuleTemplates: [],
  workitemRepoBranchTemplates: {},
  jenkinsConnections: [],
  repoCiBindings: {},
};

export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map(
    (k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k]),
  );
  return '{' + pairs.join(',') + '}';
}

export const sameSettings = (a: Settings | null, b: Settings | null) =>
  a === b || (a != null && b != null && canonicalJson(a) === canonicalJson(b));

/** 保存前校验：返回字段级错误（键：字段名 / 自定义键） */
export function validateSettings(s: Settings): Record<string, string> {
  const errors: Record<string, string> = {};
  const space = s.defaultSpaceIdentifier.trim();
  if (space && !/^[0-9a-f]{16,}$/i.test(space)) {
    errors.space = '项目空间需从下拉选择（值为 16 位以上的项目 ID），当前填写内容像是项目名称';
  }
  for (const connection of s.jenkinsConnections) {
    if (!connection.name.trim() || !connection.baseUrl.trim() || !connection.username.trim()) {
      errors[`jenkins-${connection.id}`] = 'Jenkins 实例需要填写名称、地址和用户名';
    } else if (!/^https?:\/\//i.test(connection.baseUrl.trim())) {
      errors[`jenkins-${connection.id}`] = 'Jenkins 地址必须以 http:// 或 https:// 开头';
    }
  }
  for (const [repoId, binding] of Object.entries(s.repoCiBindings)) {
    if (binding.provider === 'flow' && (binding.pipelineId <= 0 || !binding.pipelineName.trim())) {
      errors[`repo-${repoId}`] = `仓库 #${repoId} 的云效流水线尚未选定`;
    }
    if (binding.provider === 'jenkins' &&
        (!s.jenkinsConnections.some((c) => c.id === binding.connectionId) || !binding.jobFullName.trim())) {
      errors[`repo-${repoId}`] = `仓库 #${repoId} 的 Jenkins 实例或 Job 全路径尚未填写`;
    }
  }
  return errors;
}

export type AutoSaveStatus = 'saved' | 'saving' | 'error' | 'unsaved';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlightPromise: Promise<boolean> | null = null;
let pendingSaveRerun = false;

const clearDebounce = () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
};

interface SettingsDraftStore {
  /** 编辑中的草稿；null = 尚未开始编辑 */
  draft: Settings | null;
  /** 草稿基线（最近一次同步的已保存值），isDirty 与之比较 */
  baseline: Settings | null;
  /** 输入中的个人访问令牌 / Jenkins Token（留空 = 保持不变） */
  pat: string;
  jenkinsTokens: Record<string, string>;
  saving: boolean;
  autoSaveStatus: AutoSaveStatus;
  fieldErrors: Record<string, string>;
  /** 最近一次成功保存的时间戳 */
  lastSavedAt: number | null;
  /** dirty 时被导航守卫拦截的目标视图（由 ui store 写入，Shell 弹确认） */
  pendingView: string | null;

  isDirty(): boolean;
  /** 检查当前是否存在阻断保存的校验错误 */
  hasBlockingErrors(): boolean;
  /** 进入任一设置页时调用：无未保存修改则从已保存 settings 重建草稿，有则保留 */
  beginEdit(saved: SettingsView | null): void;
  /** 保存成功后：以已保存 settings 覆盖草稿并清空输入中的令牌 */
  syncFromSaved(saved: SettingsView | null): void;
  /** 保存成功后：仅更新 baseline 与重排期，支持快照比对保护用户在保存网络期输入的新 Token */
  _applyBaseline(
    saved: SettingsView | null,
    snapshot?: {
      pat: string;
      jenkinsTokens: Record<string, string>;
      draft: Settings | null;
    },
  ): void;
  update(patch: Partial<Settings>, immediateSave?: boolean): void;
  setPat(pat: string): void;
  setJenkinsToken(id: string, token: string): void;
  addJenkins(): void;
  updateJenkins(id: string, patch: Partial<JenkinsConnection>, immediateSave?: boolean): void;
  removeJenkins(id: string): void;
  setRepoBinding(repoId: number, binding: RepoCiBinding | null, immediateSave?: boolean): void;
  setFieldError(key: string, message: string | null): void;
  setPendingView(view: string | null): void;
  scheduleAutoSave(delayMs?: number): void;
  flushAutoSave(): Promise<boolean>;
  save(options?: { silent?: boolean }): Promise<boolean>;
  retrySave(): Promise<boolean>;
  discard(): void;
}

export const useSettingsDraft = create<SettingsDraftStore>((set, get) => ({
  draft: null,
  baseline: null,
  pat: '',
  jenkinsTokens: {},
  saving: false,
  autoSaveStatus: 'saved',
  fieldErrors: {},
  lastSavedAt: null,
  pendingView: null,

  isDirty() {
    const { draft, baseline, pat, jenkinsTokens } = get();
    if (!draft) return false;
    if (pat.trim() || Object.values(jenkinsTokens).some((t) => t.trim())) return true;
    return !sameSettings(draft, baseline);
  },

  hasBlockingErrors() {
    const { draft } = get();
    if (!draft) return false;
    const errors = validateSettings(draft);
    return Object.keys(errors).length > 0;
  },

  beginEdit(saved) {
    if (get().isDirty()) return; // 有未保存修改：跨入口继续编辑，保留草稿
    clearDebounce();
    const next = normalize(saved) ?? { ...EMPTY_SETTINGS };
    set({ draft: next, baseline: next, fieldErrors: {}, autoSaveStatus: 'saved' });
  },

  syncFromSaved(saved) {
    clearDebounce();
    const next = normalize(saved) ?? { ...EMPTY_SETTINGS };
    set({
      draft: next,
      baseline: next,
      pat: '',
      jenkinsTokens: {},
      fieldErrors: {},
      pendingView: null,
      autoSaveStatus: 'saved',
      lastSavedAt: Date.now(),
    });
  },

  _applyBaseline(saved, snapshot) {
    const next = normalize(saved) ?? { ...EMPTY_SETTINGS };
    const current = get();

    // 增量清理 PAT：只有当前 pat 和快照一致时才清空；若保存期间有新输入，保留用户输入
    const nextPat = snapshot && current.pat !== snapshot.pat ? current.pat : '';

    // 增量清理 Jenkins Tokens：只有当前 token 和快照一致时才清理；若保存期间用户编辑了，保留新值
    const nextJenkinsTokens = { ...current.jenkinsTokens };
    if (snapshot) {
      for (const [id, tokenVal] of Object.entries(snapshot.jenkinsTokens)) {
        if (nextJenkinsTokens[id] === tokenVal) {
          delete nextJenkinsTokens[id];
        }
      }
    } else {
      for (const id of Object.keys(nextJenkinsTokens)) {
        delete nextJenkinsTokens[id];
      }
    }

    set({
      baseline: next,
      pat: nextPat,
      jenkinsTokens: nextJenkinsTokens,
      fieldErrors: {},
      pendingView: null,
      lastSavedAt: Date.now(),
    });

    // 若 draft 与新 baseline 仍有差异（保存期间用户继续输入），重新排期自动保存
    const hasMoreChanges =
      !sameSettings(get().draft, next) ||
      Boolean(nextPat.trim()) ||
      Object.values(nextJenkinsTokens).some((t) => t.trim());

    if (hasMoreChanges) {
      get().scheduleAutoSave();
    } else {
      set({ autoSaveStatus: 'saved', draft: next });
    }
  },

  scheduleAutoSave(delayMs = 800) {
    clearDebounce();
    set({ autoSaveStatus: 'unsaved' });
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void get().save({ silent: true });
    }, delayMs);
  },

  async flushAutoSave() {
    clearDebounce();
    return await get().save({ silent: true });
  },

  update(patch, immediateSave = false) {
    set((st) => ({ draft: st.draft ? { ...st.draft, ...patch } : { ...{ ...EMPTY_SETTINGS }, ...patch } }));
    if (immediateSave) {
      void get().save({ silent: true });
    } else {
      get().scheduleAutoSave();
    }
  },
  setPat(pat) {
    set({ pat });
    get().scheduleAutoSave();
  },
  setJenkinsToken(id, token) {
    set((st) => ({ jenkinsTokens: { ...st.jenkinsTokens, [id]: token } }));
    get().scheduleAutoSave();
  },
  addJenkins() {
    const id = crypto.randomUUID().replace(/-/g, '');
    set((st) => ({
      draft: st.draft
        ? { ...st.draft, jenkinsConnections: [...st.draft.jenkinsConnections, { id, name: '', baseUrl: '', username: '' }] }
        : st.draft,
      autoSaveStatus: 'unsaved',
    }));
  },
  updateJenkins(id, patch, immediateSave = false) {
    set((st) => ({
      draft: st.draft
        ? { ...st.draft, jenkinsConnections: st.draft.jenkinsConnections.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
        : st.draft,
    }));
    if (immediateSave) {
      void get().save({ silent: true });
    } else {
      get().scheduleAutoSave();
    }
  },
  removeJenkins(id) {
    set((st) => {
      if (!st.draft) return {};
      const repoCiBindings = { ...st.draft.repoCiBindings };
      for (const [repoId, binding] of Object.entries(repoCiBindings)) {
        if (binding.provider === 'jenkins' && binding.connectionId === id) delete repoCiBindings[repoId];
      }
      const jenkinsTokens = { ...st.jenkinsTokens };
      delete jenkinsTokens[id];
      return {
        draft: {
          ...st.draft,
          jenkinsConnections: st.draft.jenkinsConnections.filter((c) => c.id !== id),
          repoCiBindings,
        },
        jenkinsTokens,
      };
    });
    void get().save({ silent: true });
  },
  setRepoBinding(repoId, binding, immediateSave = true) {
    set((st) => {
      if (!st.draft) return {};
      const repoCiBindings = { ...st.draft.repoCiBindings };
      if (binding) repoCiBindings[String(repoId)] = binding;
      else delete repoCiBindings[String(repoId)];
      return { draft: { ...st.draft, repoCiBindings } };
    });
    if (immediateSave) {
      void get().save({ silent: true });
    } else {
      get().scheduleAutoSave();
    }
  },
  setFieldError(key, message) {
    set((st) => {
      const fieldErrors = { ...st.fieldErrors };
      if (message) fieldErrors[key] = message;
      else delete fieldErrors[key];
      return { fieldErrors };
    });
  },
  setPendingView(view) { set({ pendingView: view }); },

  async retrySave() {
    return await get().save({ silent: false });
  },

  async save(options?: { silent?: boolean }): Promise<boolean> {
    clearDebounce();

    // 并发互斥与排队队列：若有请求正处于保存中，将排期标记打上，并在前序请求结束后重跑
    if (saveInFlightPromise) {
      pendingSaveRerun = true;
      return await saveInFlightPromise;
    }

    const { draft } = get();
    if (!draft) return false;
    const errors = validateSettings(draft);
    if (Object.keys(errors).length) {
      set({ fieldErrors: errors, autoSaveStatus: 'error' });
      if (!options?.silent) {
        useApp.getState().setToast({ text: '设置有需要修正的内容，请检查标红的字段', kind: 'fail' });
      }
      return false;
    }

    // 捕获本次提交时的快照，用于解决网络往返期间新输入的增量清理
    const snapshotPat = get().pat;
    const snapshotJenkinsTokens = { ...get().jenkinsTokens };
    const snapshotDraft = get().draft;

    const performSave = async (): Promise<boolean> => {
      set({ saving: true, autoSaveStatus: 'saving' });
      try {
        const app = useApp.getState();
        const oldIds = (app.settings?.jenkinsConnections ?? []).map((c) => c.id);
        for (const connection of draft.jenkinsConnections) {
          const token = snapshotJenkinsTokens[connection.id]?.trim();
          if (token) await api.saveJenkinsToken(connection.id, token);
        }
        await app.saveAll(draft, snapshotPat.trim() || undefined);
        const currentIds = new Set(draft.jenkinsConnections.map((c) => c.id));
        for (const id of oldIds) {
          if (!currentIds.has(id)) await api.deleteJenkinsToken(id);
        }
        get()._applyBaseline(useApp.getState().settings, {
          pat: snapshotPat,
          jenkinsTokens: snapshotJenkinsTokens,
          draft: snapshotDraft,
        });
        if (!options?.silent) {
          useApp.getState().setToast({ text: '设置已保存', kind: 'ok' });
        }
        return true;
      } catch (e) {
        set({ autoSaveStatus: 'error' });
        if (!options?.silent) {
          useApp.getState().setToast({ text: `保存失败：${String(e)}`, kind: 'fail' });
        }
        return false;
      } finally {
        set({ saving: false });
        saveInFlightPromise = null;
        if (pendingSaveRerun) {
          pendingSaveRerun = false;
          void get().save({ silent: true });
        }
      }
    };

    saveInFlightPromise = performSave();
    return await saveInFlightPromise;
  },

  /** 放弃修改：回到基线（进入设置页时 beginEdit 会再用最新已保存值重建） */
  discard() {
    clearDebounce();
    set((st) => ({
      draft: st.baseline ? { ...st.baseline } : st.baseline,
      pat: '',
      jenkinsTokens: {},
      fieldErrors: {},
      pendingView: null,
      autoSaveStatus: 'saved',
    }));
  },
}));
