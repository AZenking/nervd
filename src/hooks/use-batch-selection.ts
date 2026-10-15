import { useCallback, useState } from 'react';

/**
 * 列表多选与批量选择管理 Hook：
 * - 维护已选 ID 集合（Set<string>）
 * - 切换选中、全选、反选、清空
 * - 配合快捷键 x 与 Esc 实现 Linear 风格批量流转操作
 */
export function useBatchSelection(initialIds?: Iterable<string>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialIds));

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback((id: string) => {
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

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    hasSelected: selectedIds.size > 0,
    isSelected,
    toggle,
    selectAll,
    clear,
    setSelectedIds,
  };
}
