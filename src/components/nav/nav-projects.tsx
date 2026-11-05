import { Accordion } from '@heroui/react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { StatusIcon } from '../status-icon';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { useApp } from '@/store/app';
import { useUi, iterationsOrFallback } from '@/store/ui';

/** 迭代名：truncate + 仅在溢出时显示统一 Tooltip；折叠模式下隐藏文本 */
function IterationName({ name, showOverflowTooltip }: { name: string; showOverflowTooltip: boolean }) {
  const className = 'min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden';
  return showOverflowTooltip
    ? <OverflowTooltip text={name} className={className} />
    : <span className={className}>{name}</span>;
}

/**
 * 迭代分组（HeroUI Accordion 原生手风琴）：
 * 废弃外部自定义 CSS 覆写，使用 HeroUI 原生 Accordion 复合组件；
 * 折叠模式下自动收敛，展开模式下支持手风琴开合；
 * 单行导航项，外化状态图形与名称，点击切换右侧工作台视图。
 */
export function NavProjects() {
  const { iterationKey, setIteration, setView, view } = useUi();
  const { isMobile, state } = useSidebar();
  const {
    iterations: realIterations, loadingIterations,
  } = useApp();
  const useSidebarTooltip = state === 'collapsed' && !isMobile;

  const iterations = iterationsOrFallback(realIterations);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Accordion defaultExpandedKeys={['iterations']} className="w-full px-0">
      <Accordion.Item id="iterations" className="border-none">
        <Accordion.Heading className="group-data-[collapsible=icon]:hidden">
          <Accordion.Trigger className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground">
            <span>迭代（{loadingIterations ? '…' : iterations.length}）</span>
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body className="p-0">
            <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
              {iterations.map((iteration) => {
                const isSelected = iterationKey === iteration.name;
                const isCurrentView = isSelected && (view === 'iteration' || view === 'requirement');
                // 老迭代根据截止日期自动判定：如果截止日期早于今天，视为已结束
                const isPast = Boolean(iteration.endDate && iteration.endDate < today);
                const effectiveStatus = isPast ? '已结束' : iteration.state;
                const isOngoing = iteration.state === '进行中';

                return (
                  <SidebarMenuItem key={iteration.id || iteration.name}>
                    <SidebarMenuButton
                      tooltip={useSidebarTooltip ? iteration.name : undefined}
                      isActive={isCurrentView}
                      onClick={() => {
                        setIteration(iteration.name);
                        setView('iteration');
                      }}
                    >
                      <StatusIcon status={effectiveStatus} />
                      <IterationName name={iteration.name} showOverflowTooltip={!useSidebarTooltip} />
                      {isOngoing && (
                        <span className="ml-auto rounded-sm bg-success/10 text-success border border-success/20 text-[10.5px] font-semibold px-2 py-0.5 leading-none group-data-[collapsible=icon]:hidden">
                          当前
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
