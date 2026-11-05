import { useEffect } from 'react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { RequirementDetails } from '@/components/iteration/RequirementDetails';
import type { WorkitemChild } from '@/lib/api';

export interface WorkitemPeekDrawerProps {
  /** 当前选中的工作项 ID；为 null 时抽屉关闭 */
  workitemId: string | null;
  /** 关闭抽屉回调 */
  onClose: () => void;
  /** 在独立工作台完整打开回调（若未传则默认使用 useUi.openWorkitem） */
  onOpenWorkbench?: (workitemId: string, identifier?: string, subject?: string) => void;
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
 */
export function WorkitemPeekDrawer({
  workitemId,
  onClose,
  onOpenWorkbench,
  parentWorkitem,
  onSelectChild,
  onSelectParent,
}: WorkitemPeekDrawerProps) {
  const items = useApp((s) => s.items);
  const openWorkitem = useUi((s) => s.openWorkitem);

  useEffect(() => {
    if (workitemId) {
      void useApp.getState().select(workitemId);
    }
  }, [workitemId]);

  const handleOpenWorkbench = () => {
    if (!workitemId) return;
    const it = items.find((i) => i.workitemId === workitemId);
    onClose();
    if (onOpenWorkbench) {
      onOpenWorkbench(workitemId, it?.identifier, it?.subject);
    } else {
      openWorkitem(workitemId, {
        workitemId,
        identifier: it?.identifier ?? '',
        subject: it?.subject,
      });
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
        <div key={workitemId ?? 'empty'} className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto animate-content-fade">
          {workitemId && (
            <RequirementDetails
              embedded
              parentWorkitem={parentWorkitem ?? null}
              onSelectChild={onSelectChild}
              onSelectParent={onSelectParent}
              onOpenWorkbench={handleOpenWorkbench}
              onClose={onClose}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
