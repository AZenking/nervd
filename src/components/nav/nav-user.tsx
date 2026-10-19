import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { MoonIcon, SettingsIcon, SunIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';

/** 侧栏底部操作区：用户信息、主题切换与设置入口 */
export function NavUser() {
  const { openSettings, theme, toggleTheme } = useUi();
  const { currentUser } = useApp();

  return (
    <SidebarMenu className="gap-0.5">
      {currentUser && (
        <SidebarMenuItem>
          <SidebarMenuButton
            size="default"
            tooltip={`${currentUser.name} (${currentUser.email || currentUser.id}) · 点击进入设置`}
            onClick={() => openSettings('connection')}
            className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
          >
            <Avatar className="size-4.5 shrink-0 rounded-full">
              {currentUser.avatarUrl && <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />}
              <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-medium">
                {currentUser.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-[13px] font-medium">{currentUser.name}</span>
            <span className="ml-auto rounded border border-border/50 bg-background/50 px-1 py-0.2 text-[9px] font-mono text-muted-foreground/70 leading-none group-data-[collapsible=icon]:hidden">
              云效
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
      <SidebarMenuItem>
        <SidebarMenuButton
          size="default"
          tooltip={theme === 'dark' ? '浅色模式' : '深色模式'}
          onClick={(e) => toggleTheme({ clientX: e.clientX, clientY: e.clientY })}
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
        >
          {theme === 'dark' ? <SunIcon className="size-4 shrink-0" /> : <MoonIcon className="size-4 shrink-0" />}
          <span className="truncate text-[13px] font-medium">{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="default"
          tooltip="设置 (g s)"
          onClick={() => openSettings()}
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
        >
          <SettingsIcon className="size-4 shrink-0" />
          <span className="truncate text-[13px] font-medium">设置</span>
          <kbd className="ml-auto rounded border border-border bg-background px-1 font-mono text-[10px] leading-4 text-muted-foreground group-data-[collapsible=icon]:hidden">
            g s
          </kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
