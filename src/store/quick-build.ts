import { create } from 'zustand';
import * as api from '@/lib/api';
import { useApp } from './app';
import type { RepoSummary, Settings } from '@/types';
import { errorLog, humanizeError } from '@/lib/error-format';

export interface QuickBuildTarget {
  id: string; // 唯一 key: `flow:${repoId}` 或 `jenkins:${repoId}:${connectionId}:${jobFullName}`
  type: 'flow' | 'jenkins';
  repoId: number;
  repoName: string;
  repoPathWithNamespace?: string;
  pipelineName: string;
  connectionId?: string;
  connectionName?: string;
  jobFullName?: string;
  parameters?: Record<string, string>;
  environmentParameter?: string;
  branchParameter?: string;
  lastTriggeredAt?: number;
  triggerCount?: number;
}

const STORAGE_KEY = 'nervd:quick-build-history';
const MAX_HISTORY = 10;

function loadStoredHistory(): QuickBuildTarget[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === 'string' && typeof item.repoId === 'number');
  } catch {
    return [];
  }
}

function persistHistory(history: QuickBuildTarget[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // 忽略存储超限等异常
  }
}

interface QuickBuildState {
  history: QuickBuildTarget[];
  triggeringId: string | null;
  /** 记录一次构建触发至历史并置顶 */
  recordBuild(target: QuickBuildTarget, parameters?: Record<string, string>): void;
  /** 移除某条历史 */
  removeHistory(id: string): void;
  /** 清空构建历史 */
  clearHistory(): void;
  /** 执行快速构建触发（处理只读保护、API 调用、高频轮询与 Toast 反馈） */
  triggerQuickBuild(
    target: QuickBuildTarget,
    customParameters?: Record<string, string>,
  ): Promise<boolean>;
}

export const useQuickBuild = create<QuickBuildState>((set, get) => ({
  history: loadStoredHistory(),
  triggeringId: null,

  recordBuild(target, parameters) {
    const current = get().history;
    const finalParams = parameters || target.parameters;
    const existingIndex = current.findIndex((h) => h.id === target.id);
    const existing = existingIndex >= 0 ? current[existingIndex] : null;

    const updated: QuickBuildTarget = {
      ...target,
      parameters: finalParams,
      lastTriggeredAt: Date.now(),
      triggerCount: (existing?.triggerCount ?? 0) + 1,
    };

    const nextHistory = [
      updated,
      ...current.filter((h) => h.id !== target.id),
    ].slice(0, MAX_HISTORY);

    persistHistory(nextHistory);
    set({ history: nextHistory });
  },

  removeHistory(id) {
    const nextHistory = get().history.filter((h) => h.id !== id);
    persistHistory(nextHistory);
    set({ history: nextHistory });
  },

  clearHistory() {
    persistHistory([]);
    set({ history: [] });
  },

  async triggerQuickBuild(target, customParameters) {
    const app = useApp.getState();
    const allowWriteOps = app.settings?.allowWriteOps ?? false;

    if (!allowWriteOps) {
      app.setToast({
        text: '当前处于只读保护模式，无法发起构建。请前往「设置 → 安全策略」开启写操作。',
        kind: 'fail',
      });
      return false;
    }

    set({ triggeringId: target.id });

    try {
      if (target.type === 'flow') {
        await api.triggerRepoCi(target.repoId);
        app.markRepoCiActive(90_000);
        app.setToast({
          text: `已触发 ${target.repoName} 的云效流水线`,
          kind: 'ok',
        });
        void app.loadRepoCi(target.repoId);
        get().recordBuild(target);
        return true;
      }

      if (target.type === 'jenkins') {
        if (!target.connectionId || !target.jobFullName) {
          throw new Error('未配置有效的 Jenkins 实例或任务名称');
        }
        const effectiveParams = customParameters || target.parameters || {};
        await api.triggerJenkinsJob(
          target.repoId,
          target.connectionId,
          target.jobFullName,
          effectiveParams,
        );
        app.markRepoCiActive(90_000);
        app.setToast({
          text: `已触发 ${target.repoName} 的 Jenkins 构建：${target.jobFullName}`,
          kind: 'ok',
        });
        void app.loadRepoCi(target.repoId);
        get().recordBuild(target, effectiveParams);
        return true;
      }

      return false;
    } catch (err) {
      errorLog('quick-build.trigger', err);
      app.setToast({
        text: `构建触发失败：${humanizeError(err, '请检查流水线或网络连接后重试')}`,
        kind: 'fail',
      });
      return false;
    } finally {
      set({ triggeringId: null });
    }
  },
}));

/**
 * 辅助选择器：从全局 AppState 提取所有已绑定 CI 的可用构建目标列表
 */
export function extractConfiguredBuildTargets(
  settings: Settings | null,
  repos: RepoSummary[],
): QuickBuildTarget[] {
  if (!settings || !settings.repoCiBindings) return [];

  const targets: QuickBuildTarget[] = [];
  const bindings = settings.repoCiBindings;
  const reposMap = new Map<number, RepoSummary>(repos.map((r) => [r.id, r]));
  const connectionsMap = new Map((settings.jenkinsConnections || []).map((c) => [c.id, c.name]));

  for (const [repoIdStr, binding] of Object.entries(bindings)) {
    const repoId = Number(repoIdStr);
    if (!repoId || isNaN(repoId)) continue;
    const repo = reposMap.get(repoId);
    const repoName = repo?.name || `仓库 #${repoId}`;
    const repoPathWithNamespace = repo?.pathWithNamespace;

    if (binding.provider === 'flow') {
      targets.push({
        id: `flow:${repoId}`,
        type: 'flow',
        repoId,
        repoName,
        repoPathWithNamespace,
        pipelineName: binding.pipelineName || '云效 Flow 流水线',
      });
    } else if (binding.provider === 'jenkins') {
      const connName = connectionsMap.get(binding.connectionId) || 'Jenkins';
      targets.push({
        id: `jenkins:${repoId}:${binding.connectionId}:${binding.jobFullName}`,
        type: 'jenkins',
        repoId,
        repoName,
        repoPathWithNamespace,
        pipelineName: binding.jobFullName,
        connectionId: binding.connectionId,
        connectionName: connName,
        jobFullName: binding.jobFullName,
        parameters: binding.parameters,
        environmentParameter: binding.environmentParameter,
        branchParameter: binding.branchParameter,
      });
    }
  }

  return targets;
}
