import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { ChevronsUpDownIcon, LifeBuoyIcon, LogOutIcon, SettingsIcon, ShieldIcon } from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';

/** 侧栏底部用户区：展示连接与写操作策略（真实状态），菜单驱动视图切换 */
export function NavUser() {
  const { isMobile } = useSidebar();
  const { settings, connection } = useApp();
  const { setView } = useUi();

  const name = settings?.organizationId ? `组织 ${settings.organizationId.slice(0, 8)}…` : '未配置';
  const state = connection === 'ok' ? '已连接' : connection === 'fail' ? '连接失败' : '连接中';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="aria-expanded:bg-sidebar-accent" />}>
            <Avatar>
              <AvatarFallback>NV</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">nervd 工作台</span>
              <span className="truncate text-xs">{name}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56 rounded-lg" side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    <AvatarFallback>NV</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">nervd 工作台</span>
                    <span className="truncate text-xs">{name}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setView('full-settings')}>
                <SettingsIcon />
                工作区设置
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView('settings')}>
                <ShieldIcon />
                环境与策略
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LifeBuoyIcon />
              支持与反馈（占位）
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <LogOutIcon />
              退出登录（本地应用）
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted-foreground">
        <span>{state}</span>
        <SidebarMenuBadge className="text-[10px]">{settings?.allowWriteOps ? '可写' : '只读'}</SidebarMenuBadge>
      </div>
    </SidebarMenu>
  );
}
