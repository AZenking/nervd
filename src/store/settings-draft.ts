// 设置编辑单会话：所有设置区共享同一份草稿，
// 消除双表单并发编辑互相覆盖的数据丢失风险；dirty 状态配合 ui store 的导航守卫使用。
import { create } from 'zustand';
import * as api from '../lib/api';
import type { JenkinsConnection, RepoCiBinding, Settings, SettingsView } from '../types';
// 注意：app ↔ ui ↔ settings-draft 存在模块环，但相互引用均发生在动作执行期（运行时），
// 模块初始化期无交叉引用，ESM 下安全。
import { useApp } from './app';

/** 与已保存 settings 可比对的形态（剥离视图字段） */
const normalize = (s: SettingsView | null | undefined): Settings | null => {
  if (!s) return null;
  const { hasPat: _hasPat, jenkinsConnections, ...rest } = s;
  return {
    ...rest,
    jenkinsConnections: jenkinsConnections.map(({ hasToken: _hasToken, ...connection }) => connection),
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

const sameSettings = (a: Settings | null, b: Settings | null) =>
  a === b || (a != null && b != null && JSON.stringify(a) === JSON.stringify(b));

/** 保存前校验：返回字段级错误（键：字段名 / 自定义键） */
export function validateSettings(s: Settings): Record<string, string> {
  const errors: Record<string, string> = {};
  const space = s.defaultSpaceIdentifier.trim();
  if (space && !/^[0-9a-f]{16,}$/i.test(space)) {
    errors.space = '项目空间需从下拉选择（值为 16 位以上的项目 ID），当前填写内容像是项目名称';
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

interface SettingsDraftStore {
  /** 编辑中的草稿；null = 尚未开始编辑 */
  draft: Settings | null;
  /** 草稿基线（最近一次同步的已保存值），isDirty 与之比较 */
  baseline: Settings | null;
  /** 输入中的个人访问令牌 / Jenkins Token（留空 = 保持不变） */
  pat: string;
  jenkinsTokens: Record<string, string>;
  saving: boolean;
  fieldErrors: Record<string, string>;
  /** dirty 时被导航守卫拦截的目标视图（由 ui store 写入，Shell 弹确认） */
  pendingView: string | null;

  isDirty(): boolean;
  /** 进入任一设置页时调用：无未保存修改则从已保存 settings 重建草稿，有则保留 */
  beginEdit(saved: SettingsView | null): void;
  /** 保存成功后：以已保存 settings 覆盖草稿并清空输入中的令牌 */
  syncFromSaved(saved: SettingsView | null): void;
  update(patch: Partial<Settings>): void;
  setPat(pat: string): void;
  setJenkinsToken(id: string, token: string): void;
  addJenkins(): void;
  updateJenkins(id: string, patch: Partial<JenkinsConnection>): void;
  removeJenkins(id: string): void;
  setRepoBinding(repoId: number, binding: RepoCiBinding | null): void;
  setFieldError(key: string, message: string | null): void;
  setPendingView(view: string | null): void;
  save(): Promise<boolean>;
  discard(): void;
}

export const useSettingsDraft = create<SettingsDraftStore>((set, get) => ({
  draft: null,
  baseline: null,
  pat: '',
  jenkinsTokens: {},
  saving: false,
  fieldErrors: {},
  pendingView: null,

  isDirty() {
    const { draft, baseline, pat, jenkinsTokens } = get();
    if (!draft) return false;
    if (pat.trim() || Object.values(jenkinsTokens).some((t) => t.trim())) return true;
    return !sameSettings(draft, baseline);
  },

  beginEdit(saved) {
    if (get().isDirty()) return; // 有未保存修改：跨入口继续编辑，保留草稿
    const next = normalize(saved) ?? { ...EMPTY_SETTINGS };
    set({ draft: next, baseline: next, fieldErrors: {} });
  },

  syncFromSaved(saved) {
    const next = normalize(saved) ?? { ...EMPTY_SETTINGS };
    set({
      draft: next,
      baseline: next,
      pat: '',
      jenkinsTokens: {},
      fieldErrors: {},
      pendingView: null,
    });
  },

  update(patch) {
    set((st) => ({ draft: st.draft ? { ...st.draft, ...patch } : { ...{ ...EMPTY_SETTINGS }, ...patch } }));
  },
  setPat(pat) { set({ pat }); },
  setJenkinsToken(id, token) {
    set((st) => ({ jenkinsTokens: { ...st.jenkinsTokens, [id]: token } }));
  },
  addJenkins() {
    const id = crypto.randomUUID().replace(/-/g, '');
    set((st) => ({
      draft: st.draft
        ? { ...st.draft, jenkinsConnections: [...st.draft.jenkinsConnections, { id, name: '', baseUrl: '', username: '' }] }
        : st.draft,
    }));
  },
  updateJenkins(id, patch) {
    set((st) => ({
      draft: st.draft
        ? { ...st.draft, jenkinsConnections: st.draft.jenkinsConnections.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
        : st.draft,
    }));
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
  },
  setRepoBinding(repoId, binding) {
    set((st) => {
      if (!st.draft) return {};
      const repoCiBindings = { ...st.draft.repoCiBindings };
      if (binding) repoCiBindings[String(repoId)] = binding;
      else delete repoCiBindings[String(repoId)];
      return { draft: { ...st.draft, repoCiBindings } };
    });
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

  async save() {
    const { draft } = get();
    if (!draft) return false;
    const errors = validateSettings(draft);
    if (Object.keys(errors).length) {
      set({ fieldErrors: errors });
      useApp.getState().setToast({ text: '设置有需要修正的内容，请检查标红的字段', kind: 'fail' });
      return false;
    }
    set({ saving: true });
    try {
      const app = useApp.getState();
      const oldIds = (app.settings?.jenkinsConnections ?? []).map((c) => c.id);
      await app.saveAll(draft, get().pat.trim() || undefined);
      for (const connection of draft.jenkinsConnections) {
        const token = get().jenkinsTokens[connection.id]?.trim();
        if (token) await api.saveJenkinsToken(connection.id, token);
      }
      const currentIds = new Set(draft.jenkinsConnections.map((c) => c.id));
      for (const id of oldIds) {
        if (!currentIds.has(id)) await api.deleteJenkinsToken(id);
      }
      get().syncFromSaved(useApp.getState().settings);
      useApp.getState().setToast({ text: '设置已保存', kind: 'ok' });
      return true;
    } catch (e) {
      useApp.getState().setToast({ text: `保存失败：${String(e)}`, kind: 'fail' });
      return false;
    } finally {
      set({ saving: false });
    }
  },

  /** 放弃修改：回到基线（进入设置页时 beginEdit 会再用最新已保存值重建） */
  discard() {
    set((st) => ({
      draft: st.baseline ? { ...st.baseline } : st.baseline,
      pat: '',
      jenkinsTokens: {},
      fieldErrors: {},
      pendingView: null,
    }));
  },
}));
