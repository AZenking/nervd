import { useCallback, useRef, useState } from 'react';

/**
 * 列表多选与批量选择管理 Hook：
 * - 维护已选 ID 集合（Set<string>）
 * - 单选、切换选中、范围选择、指定列表全选、清空
 * - 配合快捷键 x 与 Esc 实现 Linear 风格批量流转操作
 */
export function useBatchSelection(initialIds?: Iterable<string>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialIds));
  const anchorIdRef = useRef<string | null>(null);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback((id: string) => {
    anchorIdRef.current = id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectOnly = useCallback((id: string) => {
    anchorIdRef.current = id;
    setSelectedIds(new Set([id]));
  }, []);

  const setAnchor = useCallback((id: string | null) => {
    anchorIdRef.current = id;
  }, []);

  const selectRange = useCallback((orderedIds: string[], targetId: string, additive = false) => {
    const targetIndex = orderedIds.indexOf(targetId);
    if (targetIndex < 0) return;

    let anchorIndex = anchorIdRef.current ? orderedIds.indexOf(anchorIdRef.current) : -1;
    if (anchorIndex < 0) {
      anchorIdRef.current = targetId;
      anchorIndex = targetIndex;
    }

    const range = orderedIds.slice(
      Math.min(anchorIndex, targetIndex),
      Math.max(anchorIndex, targetIndex) + 1,
    );

    setSelectedIds((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      for (const id of range) next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[], anchorId?: string) => {
    anchorIdRef.current = anchorId && ids.includes(anchorId) ? anchorId : (ids[0] ?? null);
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    anchorIdRef.current = null;
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    hasSelected: selectedIds.size > 0,
    isSelected,
    toggle,
    selectOnly,
    setAnchor,
    selectRange,
    selectAll,
    clear,
    setSelectedIds,
  };
}
