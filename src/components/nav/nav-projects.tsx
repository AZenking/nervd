import { useRef, useState } from 'react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { NavCollapsibleGroup } from './nav-group';
import { StatusIcon } from '../status-icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useApp } from '@/store/app';
import { useUi, iterationsOrFallback } from '@/store/ui';

/** 迭代名：truncate + 仅在溢出时显示全名 Tooltip */
function IterationName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowed, setOverflowed] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            ref={ref}
            className="min-w-0 flex-1 truncate text-left"
            onMouseEnter={() => {
              const el = ref.current;
              if (el) setOverflowed(el.scrollWidth > el.clientWidth);
            }}
          />
        }
      >
        {name}
      </TooltipTrigger>
      {overflowed && (
        <TooltipContent side="right" className="max-w-72 break-words">
          {name}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

/**
 * 迭代分组（Linear 式纯净导航）：
 * 单行导航项，外化状态图形与名称，点击切换右侧工作台视图；
 * 历史迭代按截止日期智能归为完成态，工作项统一在主区查看，不再在侧栏展开长列表。
 */
export function NavProjects() {
  const { iterationKey, setIteration, setView, view } = useUi();
  const {
    iterations: realIterations, loadingIterations,
  } = useApp();

  const iterations = iterationsOrFallback(realIterations);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <NavCollapsibleGroup
      className="px-0"
      label={<>迭代（{loadingIterations ? '…' : iterations.length}）</>}
      labelClassName="px-2"
    >
      <SidebarMenu>
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
                tooltip={iteration.name}
                isActive={isCurrentView}
                className="group/menu-button"
                onClick={() => {
                  setIteration(iteration.name);
                  setView('iteration');
                }}
              >
                <StatusIcon status={effectiveStatus} />
                <IterationName name={iteration.name} />
                {isOngoing && (
                  <span className="ml-auto text-[10px] text-muted-foreground/80 font-normal group-data-[collapsible=icon]:hidden">
                    当前
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </NavCollapsibleGroup>
  );
}

