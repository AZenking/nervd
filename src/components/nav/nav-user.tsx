import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { MoonIcon, SettingsIcon, SunIcon } from 'lucide-react';
import { useUi } from '@/store/ui';

/** 侧栏底部操作区：主题切换与设置入口 */
export function NavUser() {
  const { openSettings, theme, toggleTheme } = useUi();

  return (
    <SidebarMenu>
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
