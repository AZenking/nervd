import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { NavCollapsibleGroup } from './nav-group';
import { ChevronRightIcon } from 'lucide-react';
import { useUi } from '@/store/ui';
import type { WorkspaceView } from '@/store/ui';

export interface NavMainItem {
  title: string;
  icon: React.ReactNode;
  view?: WorkspaceView;
  isActive?: boolean;
  items?: { title: string; view?: WorkspaceView }[];
}

/** 主导航：视图切换通过 useUi 直接驱动，无需事件总线 */
export function NavMain({ items }: { items: NavMainItem[] }) {
  const { setView, view } = useUi();
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  return (
    <NavCollapsibleGroup
      label="工作"
      labelClassName="px-2"
      className="px-0"
    >
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible
            key={item.title}
            open={openItems[item.title] ?? item.isActive ?? false}
            onOpenChange={(open) => setOpenItems((current) => ({ ...current, [item.title]: open }))}
            render={<SidebarMenuItem />}
          >
            <SidebarMenuButton
              tooltip={item.title}
              // UX A3：显式 isActive 优先（如「工作区」覆盖 iteration+requirement），否则按 view 匹配
              isActive={item.isActive ?? (item.view != null && item.view === view)}
              onClick={() => {
                if (item.view) setView(item.view);
              }}
            >
              {item.icon}
              <span>{item.title}</span>
            </SidebarMenuButton>
            {item.items?.length ? (
              <>
                <CollapsibleTrigger render={<SidebarMenuAction className="aria-expanded:rotate-90" />}>
                  <ChevronRightIcon />
                  <span className="sr-only">Toggle</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton
                          isActive={subItem.view != null && subItem.view === view}
                          onClick={() => {
                            if (subItem.view) setView(subItem.view);
                          }}
                        >
                          <span>{subItem.title}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </>
            ) : null}
          </Collapsible>
        ))}
      </SidebarMenu>
    </NavCollapsibleGroup>
  );
}
