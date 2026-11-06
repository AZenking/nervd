import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BranchRuleTemplate } from '@/types';
import { useApp } from '@/store/app';
import { importIterationTracks, listIterationTracks, saveIterationTracks } from '@/lib/api';

const STORAGE_KEY = 'nervd:iteration-branch-templates';
const BACKUP_STORAGE_KEY = 'nervd:iteration-branch-templates.bak';

export interface ScopedBranchRuleTemplate extends BranchRuleTemplate {
  scope: 'global' | 'iteration';
  iterationId?: string;
}

/**
 * 遗留 localStorage 读取（迁移源专用）：
 * 旧版本把迭代专属模板整字典存于 localStorage['nervd:iteration-branch-templates']，
 * 阶段3 起业务读写已切换 SQLite（api.listIterationTracks / saveIterationTracks）。
 * 本函数仅供启动一次性迁移（migrateIterationTemplatesToDb）解析迁移源，勿用于业务读路径。
 */
export function loadAllIterationTemplates(): Record<string, BranchRuleTemplate[]> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, BranchRuleTemplate[]>) : {};
  } catch {
    return {};
  }
}

/**
 * 读取特定迭代的专属分支模板列表（SQLite 行级存储，异步）。
 * 读取失败（IPC 异常等）降级为空列表：轨道融合自动兜底到全局模板，不阻断 UI。
 */
export async function getIterationTemplates(iterationId: string): Promise<BranchRuleTemplate[]> {
  if (!iterationId) return [];
  try {
    const rows = await listIterationTracks(iterationId);
    // 防御性数组化：mock/异常后端返回非数组时降级为空（读失败 = 无迭代专属模板）
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * 保存特定迭代的专属分支模板列表（SQLite 行级替换，异步）。
 * 成功后广播 'nervd:iteration-templates-changed'，各 hook 实例重拉 DB 真值；
 * 空数组 = 行级清空该迭代模板（由后端删除对应行），前端不再特判。
 */
export async function saveIterationTemplates(
  iterationId: string,
  templates: BranchRuleTemplate[],
): Promise<void> {
  if (!iterationId) return;
  await saveIterationTracks(iterationId, templates);
  window.dispatchEvent(
    new CustomEvent('nervd:iteration-templates-changed', {
      detail: { iterationId },
    }),
  );
}

/**
 * 融合全局分支模板与「已加载」的迭代专属分支模板：
 * 迭代专属模板优先排在前面，全局通用模板紧随其后，按模板 id 去重。
 * 注意：迭代模板改异步读库后，本函数第二个参数从 iterationId 换成已加载的迭代模板数组，
 * 异步取数由 useFusedBranchTemplates / getIterationTemplates 负责。
 */
export function getFusedBranchTemplates(
  globalTemplates: BranchRuleTemplate[] = [],
  iterationTemplates: BranchRuleTemplate[] = [],
  iterationId?: string,
): ScopedBranchRuleTemplate[] {
  const result: ScopedBranchRuleTemplate[] = [];
  const seenIds = new Set<string>();
  // 防御：null/非数组（默认参只兜 undefined）时按空列表处理
  const iterationList = Array.isArray(iterationTemplates) ? iterationTemplates : [];
  const globalList = Array.isArray(globalTemplates) ? globalTemplates : [];

  // 1. 迭代专属模板（优先）
  for (const t of iterationList) {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      result.push({ ...t, scope: 'iteration', iterationId });
    }
  }

  // 2. 全局通用模板
  for (const t of globalList) {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      result.push({ ...t, scope: 'global' });
    }
  }

  return result;
}

/**
 * 响应式 Hook：订阅并管理特定迭代的专属分支模板（SQLite 异步读写）。
 * - 挂载 / 迭代切换时从 DB 拉取；监听 'nervd:iteration-templates-changed' 事件重拉
 * - saveTemplates 乐观更新本地状态，落库失败自动回滚 DB 真值并向上抛错
 */
export function useIterationBranchTemplates(iterationId?: string) {
  const [templates, setTemplates] = useState<BranchRuleTemplate[]>([]);

  useEffect(() => {
    if (!iterationId) {
      setTemplates([]);
      return;
    }
    let disposed = false;
    const refresh = async () => {
      const next = await getIterationTemplates(iterationId);
      if (!disposed) setTemplates(next);
    };
    void refresh();

    const handleChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ iterationId?: string }>;
      if (!customEvent.detail || customEvent.detail.iterationId === iterationId) {
        void refresh();
      }
    };

    window.addEventListener('nervd:iteration-templates-changed', handleChanged);
    return () => {
      disposed = true;
      window.removeEventListener('nervd:iteration-templates-changed', handleChanged);
    };
  }, [iterationId]);

  const save = useCallback(
    (next: BranchRuleTemplate[]) => {
      if (!iterationId) return Promise.resolve();
      // 乐观即时呈现，落库失败回滚为 DB 真值（AGENTS.md §5.3 乐观更新与失败回滚）
      setTemplates(next);
      return saveIterationTemplates(iterationId, next).catch((error: unknown) => {
        void getIterationTemplates(iterationId).then((current) => setTemplates(current));
        throw error;
      });
    },
    [iterationId],
  );

  return { templates, saveTemplates: save };
}

/**
 * 响应式 Hook：获取当前环境融合后的分支模板列表（迭代专属优先 + 全局模板）。
 * 迭代模板异步加载完成前返回仅含全局部分的融合结果，加载完成后自动补齐。
 */
export function useFusedBranchTemplates(iterationId?: string): ScopedBranchRuleTemplate[] {
  const globalTemplates = useApp((s) => s.settings?.branchRuleTemplates) ?? [];
  const { templates: iterationTemplates } = useIterationBranchTemplates(iterationId);

  return useMemo(() => {
    return getFusedBranchTemplates(globalTemplates, iterationTemplates, iterationId);
  }, [globalTemplates, iterationTemplates, iterationId]);
}

/**
 * 启动一次性迁移：遗留 localStorage 迭代模板孤岛 → SQLite 行级存储（import_iteration_tracks 幂等导入）。
 * - 模块级 in-flight Promise 防重入：React StrictMode 双挂载 / 并发调用共享同一次迁移
 * - 成功：原值写入备份键 'nervd:iteration-branch-templates.bak' 后删除原键
 * - 导入失败：保留原键下次重试，并清空守卫放行后续 mount 重试
 * - 损坏数据（JSON 解析失败）：永远无法导入成功，移入备份键后删除原键，避免每次启动空转
 * 由 App.tsx 挂载时在不阻塞首屏的副作用中触发。
 */
let iterationTemplatesMigration: Promise<void> | null = null;

export function migrateIterationTemplatesToDb(): Promise<void> {
  if (iterationTemplatesMigration) return iterationTemplatesMigration;
  iterationTemplatesMigration = (async () => {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || !raw.trim()) return;

    let map: Record<string, BranchRuleTemplate[]>;
    try {
      map = JSON.parse(raw) as Record<string, BranchRuleTemplate[]>;
      if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('invalid payload');
    } catch {
      localStorage.setItem(BACKUP_STORAGE_KEY, raw);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const entries = Object.entries(map).filter(([, list]) => Array.isArray(list) && list.length > 0);
    try {
      if (entries.length > 0) {
        const imported = await importIterationTracks(Object.fromEntries(entries));
        if (!imported) throw new Error('import_iteration_tracks 未确认导入');
      }
      localStorage.setItem(BACKUP_STORAGE_KEY, raw);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 失败保留原键下次重试；清空守卫放行后续重试
      iterationTemplatesMigration = null;
    }
  })();
  return iterationTemplatesMigration;
}

/** @internal 仅供单测重置模块级迁移防重入状态（业务代码勿用） */
export function __resetIterationTemplatesMigrationForTest(): void {
  iterationTemplatesMigration = null;
}
