import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { HelpCircleIcon, MonitorIcon, MoonIcon, SettingsIcon, SunIcon } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useAppUpdate } from '@/hooks/use-app-update';
import { APP_VERSION } from '@/lib/app-info';

/** 侧栏底部操作区：对齐现代 SaaS 风格底部（帮助与信息、界面主题切换、系统设置） */
export function NavUser() {
  const { openSettings, theme, resolvedTheme, toggleTheme, setAboutOpen } = useUi();
  const { hasUpdate, updateInfo } = useAppUpdate();

  const themeLabel =
    theme === 'system'
      ? `跟随系统 (${resolvedTheme === 'dark' ? '深色' : '浅色'})`
      : theme === 'dark'
      ? '深色模式'
      : '浅色模式';

  const ThemeIcon =
    theme === 'system' ? MonitorIcon : theme === 'dark' ? MoonIcon : SunIcon;

  return (
    <SidebarMenu className="gap-1">
      <SidebarMenuItem>
        <SidebarMenuButton
          size="default"
          tooltip={hasUpdate ? `发现新版本 v${updateInfo?.latestVersion} · 点击查看更新` : `帮助与关于 nervd (v${APP_VERSION})`}
          onClick={() => setAboutOpen(true)}
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
        >
          <HelpCircleIcon className="size-[18px] shrink-0" />
          <span className="truncate text-[13.5px] font-medium group-data-[collapsible=icon]:hidden">帮助与信息</span>
          {hasUpdate ? (
            <span className="ml-auto rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-semibold text-primary group-data-[collapsible=icon]:hidden animate-pulse leading-none">
              新版本
            </span>
          ) : (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground/60 group-data-[collapsible=icon]:hidden leading-none">
              v{APP_VERSION}
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="default"
          tooltip={`当前: ${themeLabel} · 点击切换`}
          onClick={(e) => toggleTheme({ clientX: e.clientX, clientY: e.clientY })}
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
        >
          <ThemeIcon className="size-[18px] shrink-0" />
          <span className="truncate text-[13.5px] font-medium group-data-[collapsible=icon]:hidden">{themeLabel}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="default"
          tooltip="系统设置 (g s)"
          onClick={() => openSettings()}
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
        >
          <SettingsIcon className="size-[18px] shrink-0" />
          <span className="truncate text-[13.5px] font-medium group-data-[collapsible=icon]:hidden">系统设置</span>
          <kbd className="ml-auto rounded-md border border-neutral-200/80 bg-background dark:border-neutral-700 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden leading-none">
            g s
          </kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
