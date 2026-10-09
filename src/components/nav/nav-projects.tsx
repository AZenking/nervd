import { useMemo, useState } from 'react';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { CalendarDaysIcon, ChevronRightIcon, PlusIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { PLACEHOLDER_ITERATIONS } from '@/store/ui';

/**
 * 迭代分组：后端暂无云效迭代 API，迭代壳为占位数据；
 * 当前迭代下的需求子项接真实工作项列表（store.items）。
 */
export function NavProjects() {
  const { iterationKey, setIteration, openRequirement } = useUi();
  const { items, selectedId, select, loadingList } = useApp();
  const [expanded, setExpanded] = useState(true);

  const requirementEntries = useMemo(
    () => items.slice(0, 12).map((it) => ({ id: it.identifier, title: it.subject, workitemId: it.workitemId })),
    [items],
  );

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between">
        <SidebarGroupLabel>迭代</SidebarGroupLabel>
        <SidebarGroupAction title="新增迭代（占位）" aria-label="新增迭代">
          <PlusIcon />
        </SidebarGroupAction>
      </div>
      <SidebarMenu>
        {PLACEHOLDER_ITERATIONS.map((iteration) => {
          const isActive = iterationKey === iteration.name;
          return (
            <SidebarMenuItem key={iteration.name}>
              <SidebarMenuButton
                isActive={isActive}
                onClick={() => setIteration(iteration.name)}
              >
                <CalendarDaysIcon />
                <span>{iteration.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{iteration.state}</span>
                <ChevronRightIcon
                  className={isActive && expanded ? 'rotate-90' : ''}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((v) => !v);
                  }}
                />
              </SidebarMenuButton>
              {isActive && expanded && (
                <SidebarMenuSub>
                  {requirementEntries.map((requirement) => (
                    <SidebarMenuSubItem key={requirement.id}>
                      <SidebarMenuSubButton
                        isActive={selectedId === requirement.workitemId}
                        onClick={() => {
                          void select(requirement.workitemId);
                          openRequirement();
                        }}
                      >
                        <span className="truncate">
                          <span className="font-mono text-[10px] text-muted-foreground">{requirement.id}</span>{' '}
                          {requirement.title}
                        </span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                  {isActive && !requirementEntries.length && (
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton>
                        <span className="text-xs text-muted-foreground">
                          {loadingList ? '加载工作项…' : '暂无工作项（检查云效连接）'}
                        </span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
