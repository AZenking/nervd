import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BranchRuleTemplate } from '@/types';
import { useApp } from '@/store/app';

const STORAGE_KEY = 'nervd:iteration-branch-templates';

export interface ScopedBranchRuleTemplate extends BranchRuleTemplate {
  scope: 'global' | 'iteration';
  iterationId?: string;
}

/**
 * 读取本地存储的所有迭代专属分支模板字典：iterationId -> BranchRuleTemplate[]
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
 * 读取特定迭代的专属分支模板列表
 */
export function getIterationTemplates(iterationId: string): BranchRuleTemplate[] {
  if (!iterationId) return [];
  const all = loadAllIterationTemplates();
  return all[iterationId] ?? [];
}

/**
 * 保存特定迭代的专属分支模板列表
 */
export function saveIterationTemplates(
  iterationId: string,
  templates: BranchRuleTemplate[],
): void {
  if (!iterationId || typeof localStorage === 'undefined') return;
  const all = loadAllIterationTemplates();
  if (templates.length === 0) {
    delete all[iterationId];
  } else {
    all[iterationId] = templates;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  window.dispatchEvent(
    new CustomEvent('nervd:iteration-templates-changed', {
      detail: { iterationId },
    }),
  );
}

/**
 * 融合全局分支模板与当前迭代专属分支模板：
 * 迭代专属模板优先排在前面，全局通用模板紧随其后。
 */
export function getFusedBranchTemplates(
  globalTemplates: BranchRuleTemplate[] = [],
  iterationId?: string,
): ScopedBranchRuleTemplate[] {
  const iterationTemplates = iterationId ? getIterationTemplates(iterationId) : [];
  const result: ScopedBranchRuleTemplate[] = [];
  const seenIds = new Set<string>();

  // 1. 迭代专属模板（优先）
  for (const t of iterationTemplates) {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      result.push({ ...t, scope: 'iteration', iterationId });
    }
  }

  // 2. 全局通用模板
  for (const t of globalTemplates) {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      result.push({ ...t, scope: 'global' });
    }
  }

  return result;
}

/**
 * 响应式 Hook：订阅并管理特定迭代的专属分支模板
 */
export function useIterationBranchTemplates(iterationId?: string) {
  const [templates, setTemplates] = useState<BranchRuleTemplate[]>(() =>
    iterationId ? getIterationTemplates(iterationId) : [],
  );

  useEffect(() => {
    if (!iterationId) {
      setTemplates([]);
      return;
    }
    setTemplates(getIterationTemplates(iterationId));

    const handleChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ iterationId?: string }>;
      if (!customEvent.detail || customEvent.detail.iterationId === iterationId) {
        setTemplates(getIterationTemplates(iterationId));
      }
    };

    window.addEventListener('nervd:iteration-templates-changed', handleChanged);
    return () => {
      window.removeEventListener('nervd:iteration-templates-changed', handleChanged);
    };
  }, [iterationId]);

  const save = useCallback(
    (next: BranchRuleTemplate[]) => {
      if (!iterationId) return;
      saveIterationTemplates(iterationId, next);
      setTemplates(next);
    },
    [iterationId],
  );

  return { templates, saveTemplates: save };
}

/**
 * 响应式 Hook：获取当前环境融合后的分支模板列表（迭代专属优先 + 全局模板）
 */
export function useFusedBranchTemplates(iterationId?: string): ScopedBranchRuleTemplate[] {
  const globalTemplates = useApp((s) => s.settings?.branchRuleTemplates) ?? [];
  const { templates: iterationTemplates } = useIterationBranchTemplates(iterationId);

  return useMemo(() => {
    return getFusedBranchTemplates(globalTemplates, iterationId);
  }, [globalTemplates, iterationTemplates, iterationId]);
}
