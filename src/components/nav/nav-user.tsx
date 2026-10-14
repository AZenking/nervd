import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { SettingsIcon } from 'lucide-react';
import { useUi } from '@/store/ui';

/** 侧栏底部用户区（Linear 单行紧凑形态）：整行即设置入口；组织与连接状态收口到设置页与工作区行 */
export function NavUser() {
  const { openSettings } = useUi();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="sm" tooltip="设置" onClick={() => openSettings()}>
          <Avatar className="size-6">
            <AvatarFallback className="text-[10px]">NV</AvatarFallback>
          </Avatar>
          <span className="truncate text-[13px] font-medium">设置</span>
          <SettingsIcon className="ml-auto size-4" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
