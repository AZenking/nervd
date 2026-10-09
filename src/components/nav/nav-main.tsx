import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
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
  return (
    <SidebarGroup>
      <SidebarGroupLabel>当前工作</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible key={item.title} defaultOpen={item.isActive} render={<SidebarMenuItem />}>
            <SidebarMenuButton
              tooltip={item.title}
              isActive={item.view != null && item.view === view}
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
    </SidebarGroup>
  );
}
