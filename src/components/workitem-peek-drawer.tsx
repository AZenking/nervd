import { useEffect } from 'react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { RequirementDetails } from '@/components/iteration/RequirementDetails';

export interface WorkitemPeekDrawerProps {
  /** 当前选中的工作项 ID；为 null 时抽屉关闭 */
  workitemId: string | null;
  /** 关闭抽屉回调 */
  onClose: () => void;
  /** 在独立工作台完整打开回调（若未传则默认使用 useUi.openWorkitem） */
  onOpenWorkbench?: (workitemId: string, identifier?: string, subject?: string) => void;
}

/**
 * 工作项侧边轻量预览抽屉（Linear Peek View Drawer）：
 * - 点击工作项编号或卡片就地从右侧滑出，保留底层仪表盘或集成分支的上下文；
 * - 抽屉内部以嵌入模态（embedded）渲染 RequirementDetails；
 * - 支持一键“全屏打开”切换至独立工作台并自动关闭抽屉。
 */
export function WorkitemPeekDrawer({
  workitemId,
  onClose,
  onOpenWorkbench,
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
      <DrawerContent className="w-[100vw] sm:w-[min(58rem,92vw)] data-[swipe-axis=x]:sm:[--drawer-content-width:min(58rem,92vw)] p-0 duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
        <div key={workitemId ?? 'empty'} className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto animate-content-fade">
          {workitemId && (
            <RequirementDetails
              embedded
              onOpenWorkbench={handleOpenWorkbench}
              onClose={onClose}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
