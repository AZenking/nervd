import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { SettingsIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';

/** 侧栏底部用户区：头像即设置入口（原下拉弹窗已移除）；连接与读写状态统一收口到工作区卡片的状态徽章 */
export function NavUser() {
  const { settings } = useApp();
  const { openSettings } = useUi();

  const name = settings?.organizationId ? `组织 ${settings.organizationId.slice(0, 8)}…` : '未配置';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip="设置" onClick={() => openSettings()}>
          <Avatar>
            <AvatarFallback>NV</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">设置</span>
            <span className="truncate text-xs">{name}</span>
          </div>
          <SettingsIcon className="ml-auto size-4" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
