import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/store/app';
import { DEFAULT_DETAIL_TAB, useUi, type DetailTabKey } from '@/store/ui';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RequirementDetails } from '@/components/iteration/RequirementDetails';
import type { WorkitemChild } from '@/lib/api';

export interface WorkitemPeekDrawerProps {
  /** 当前选中的工作项 ID；为 null 时抽屉关闭 */
  workitemId: string | null;
  /** 关闭抽屉回调 */
  onClose: () => void;
  /** 在独立工作台完整打开回调（若未传则默认使用 useUi.openWorkitem）。
   *  detailTab 为抽屉当前页签：分栏 → 全屏需原样携带（缺省由 RequirementDetails 内部回落到默认）。 */
  onOpenWorkbench?: (
    workitemId: string,
    identifier?: string,
    subject?: string,
    detailTab?: DetailTabKey,
  ) => void;
  /** 钻取子工作项时记录的父项（面包屑「返回父需求」与 Esc 逐层退回共用） */
  parentWorkitem?: { workitemId: string; identifier: string; subject?: string } | null;
  /** 就地钻取子工作项回调（未传时详情内部仍走 ChildDetailDrawer 兜底） */
  onSelectChild?: (child: WorkitemChild) => void;
  /** 从子项详情退回父需求回调 */
  onSelectParent?: (parentId: string) => void;
}

/**
 * 工作项侧边轻量预览抽屉（Linear Peek View Drawer）：
 * - 点击工作项编号或卡片就地从右侧滑出，保留底层列表 / 仪表盘的上下文与滚动现场；
 * - 抽屉内部以嵌入模态（embedded）渲染 RequirementDetails，支持子任务/缺陷就地钻取与逐层退回；
 * - 支持一键「全屏打开」切换至独立工作台并自动关闭抽屉；
 * - Dialog 带 data-workspace-peek-drawer 标记，供键盘层识别「仅抽屉开启」的浮层让路判定。
 *
 * 页签策略：抽屉持有受控页签（默认「交付进展」）。j/k 连续检视只换 workitemId，页签保留；
 * 抽屉关闭（workitemId=null）重置回默认；「全屏打开」把当前页签经 openWorkitem options 带走。
 */
export function WorkitemPeekDrawer({
  workitemId,
  onClose,
  onOpenWorkbench,
  parentWorkitem,
  onSelectChild,
  onSelectParent,
}: WorkitemPeekDrawerProps) {
  const openWorkitem = useUi((s) => s.openWorkitem);
  const [detailTab, setDetailTab] = useState<DetailTabKey>(DEFAULT_DETAIL_TAB);

  useEffect(() => {
    if (!workitemId) return;
    // 幂等兜底：IterationView.openDetail / 钻取 / 恢复导航通常已自行 select，
    // 这里只在 store 尚未对准目标（或上次详情加载失败且未在加载中）时补发一次，
    // 避免「打开即双发详情 + 评论 + 子项」导致骨架闪烁。
    const { selectedId, detail, loadingDetail } = useApp.getState();
    if (selectedId !== workitemId || (!detail && !loadingDetail)) {
      void useApp.getState().select(workitemId);
    }
  }, [workitemId]);

  useEffect(() => {
    if (workitemId) return;
    // 关闭抽屉 → 重置页签：再次打开回到默认「交付进展」。
    setDetailTab(DEFAULT_DETAIL_TAB);
    useUi.getState().setDetailTab(DEFAULT_DETAIL_TAB);
  }, [workitemId]);

  const handleDetailTabChange = useCallback((tab: DetailTabKey) => {
    setDetailTab(tab);
    // RequirementDetails 也会写回 store；这里再同步一次，保证抽屉作为页签持有方时状态单一来源。
    useUi.getState().setDetailTab(tab);
  }, []);

  const handleOpenWorkbench = () => {
    if (!workitemId) return;
    // 一次性按 ID 取行，不订阅整张 items（避免任意列表变更都重渲抽屉）
    const it = useApp.getState().items.find((i) => i.workitemId === workitemId);
    // 先取出当前页签：onClose 会把 workitemId 置空并触发回归重置，不能依赖重置后的状态。
    const tab = detailTab;
    onClose();
    if (onOpenWorkbench) {
      onOpenWorkbench(workitemId, it?.identifier, it?.subject, tab);
    } else {
      openWorkitem(
        workitemId,
        {
          workitemId,
          identifier: it?.identifier ?? '',
          subject: it?.subject,
        },
        undefined,
        { detailTab: tab },
      );
    }
  };

  return (
    <Drawer
      open={Boolean(workitemId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      swipeDirection="right"
    >
      <DrawerContent
        data-workspace-peek-drawer=""
        className="w-full sm:w-[min(58rem,92vw)] sm:max-w-none"
      >
        {/* 读屏可访问名：抽屉头由 RequirementDetails 自绘，这里补 sr-only DrawerTitle 供 Dialog aria-labelledby 引用 */}
        <DrawerTitle className="sr-only">工作项详情</DrawerTitle>
        {/* animate-* 会覆盖 ScrollShadow 的 scroll-driven animation（同为 animation 简写），
            故入场动画留在外层 div，滚动与边缘渐隐交给内层 ScrollArea */}
        <div key={workitemId ?? 'empty'} className="flex h-full min-h-0 flex-1 flex-col overflow-hidden animate-content-fade">
          <ScrollArea className="min-h-0 flex-1">
            {workitemId && (
              <RequirementDetails
                embedded
                parentWorkitem={parentWorkitem ?? null}
                onSelectChild={onSelectChild}
                onSelectParent={onSelectParent}
                onOpenWorkbench={handleOpenWorkbench}
                onClose={onClose}
                detailTab={detailTab}
                onDetailTabChange={handleDetailTabChange}
              />
            )}
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}