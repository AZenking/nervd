// DESIGN §F.3：工作区（扣除侧栏后的内容区）< 760px → 页头切换 compact 密度。
// 宽度由 Shell 统一测量（`[data-workspace-content]`）后写入 store，
// 视图不得再用自身内容盒宽度判定（会少掉 ScrollArea 横向 padding，阈值偏早 40–80px）。
import { useLayout, SINGLE_COLUMN_WORKSPACE_WIDTH } from '@/store/layout';

export function useWorkspaceCompact(): boolean {
  const workspaceWidth = useLayout((s) => s.workspaceWidth);
  return workspaceWidth > 0 && workspaceWidth < SINGLE_COLUMN_WORKSPACE_WIDTH;
}
