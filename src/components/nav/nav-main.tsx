import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useUi } from '@/store/ui';
import type { WorkspaceView } from '@/store/ui';

export interface NavMainItem {
  title: string;
  icon: React.ReactNode;
  view?: WorkspaceView;
  isActive?: boolean;
  badge?: React.ReactNode;
  onClick?: () => void;
}

/** 主导航：Linear 式直接主菜单项，无多余折叠包裹 */
export function NavMain({ items }: { items: NavMainItem[] }) {
  const { setView, view } = useUi();
  return (
    <SidebarGroup className="px-0 py-0">
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              tooltip={item.title}
              isActive={item.isActive ?? (item.view != null && item.view === view)}
              onClick={() => {
                if (item.onClick) item.onClick();
                else if (item.view) setView(item.view);
              }}
            >
              {item.icon}
              <span className="flex-1">{item.title}</span>
              {item.badge}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
