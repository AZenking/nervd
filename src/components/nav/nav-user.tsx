import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { InfoIcon, MoonIcon, SettingsIcon, SunIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { useUpdater } from '@/store/updater';

/** 侧栏底部操作区：主题切换、设置与关于入口 */
export function NavUser() {
  const { openSettings, theme, toggleTheme, setAboutOpen } = useUi();
  const { currentUser } = useApp();
  const hasUpdate = useUpdater((s) => s.status === 'available' && Boolean(s.updateInfo?.hasUpdate));

  return (
    <SidebarMenu>
      {currentUser && (
        <SidebarMenuItem>
          <SidebarMenuButton
            size="default"
            tooltip={`${currentUser.name} (${currentUser.email || currentUser.id}) · 点击进入设置`}
            onClick={() => openSettings('connection')}
            className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
          >
            <Avatar className="size-4 shrink-0">
              {currentUser.avatarUrl && <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />}
              <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-medium">
                {currentUser.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-[13px] font-medium">{currentUser.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/70 font-mono group-data-[collapsible=icon]:hidden">
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
      <SidebarMenuItem>
        <SidebarMenuButton
          size="default"
          tooltip={hasUpdate ? '发现新版本 · 点击查看' : '关于 nervd'}
          onClick={() => setAboutOpen(true)}
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
        >
          <div className="relative flex items-center justify-center">
            <InfoIcon className="size-4 shrink-0" />
            {hasUpdate && (
              <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-2 ring-sidebar" />
            )}
          </div>
          <span className="truncate text-[13px] font-medium">关于 nervd</span>
          {hasUpdate && (
            <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary font-mono group-data-[collapsible=icon]:hidden">
              新版
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
