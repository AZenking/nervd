import { useCallback, useState } from 'react';
import { DEFAULT_DETAIL_TAB, useUi, type DetailTabKey } from '@/store/ui';

export interface DetailTabStateOptions {
  /** 嵌入态（Peek 抽屉）：首次挂载默认「交付进展」，缺省受控时也回到该页签。 */
  embedded?: boolean;
  /** 受控页签：传入时以调用方（WorkitemPeekDrawer）为准，j/k 连续检视不重置。 */
  detailTab?: DetailTabKey;
  /** 受控页签变更回调：调用方据此同步自己的受控 state。 */
  onDetailTabChange?: (tab: DetailTabKey) => void;
}

/**
 * 需求详情页签状态（纯前端瞬态，见 store/ui.ts 的 detailTab 注释）：
 * - 嵌入态（Peek 抽屉）：默认「交付进展」，由 WorkitemPeekDrawer 受控持有；工作项切换（j/k）
 *   只换内容不换页签，抽屉关闭时由调用方重置回默认。
 * - 全屏工作台：内部 state 仅在挂载时从 store 初始化（分栏 → 全屏继承页签），变更写回 store；
 *   但不做成「store 强控」——子项钻取时的 openWorkitem 会把 store 重置为默认，
 *   内部 state 必须保留当前页签，避免钻取后视图被拽回「交付进展」。
 */
export function useDetailTabState({
  embedded = false,
  detailTab,
  onDetailTabChange,
}: DetailTabStateOptions = {}) {
  const [internalTab, setInternalTab] = useState<DetailTabKey>(
    () => detailTab ?? (embedded ? DEFAULT_DETAIL_TAB : useUi.getState().detailTab),
  );
  const activeTab = detailTab ?? internalTab;
  const setActiveTab = useCallback((tab: DetailTabKey) => {
    setInternalTab(tab);
    onDetailTabChange?.(tab);
    // 瞬态页签同步到 store：供「分栏 → 全屏」这一跨挂载路径携带；不写入导航快照。
    useUi.getState().setDetailTab(tab);
  }, [onDetailTabChange]);
  return [activeTab, setActiveTab] as const;
}