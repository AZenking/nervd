import { NavMain } from './nav-main';
import { NavProjects } from './nav-projects';
import { NavUser } from './nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  ArrowLeftIcon,
  GitBranchIcon,
  LayoutDashboardIcon,
  SearchIcon,
} from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { SETTINGS_SECTIONS } from '../settings/sections';

/**
 * nervd 侧栏（Linear 解剖）：工作区行 + 搜索行 + 主导航 + 迭代分组 + 设置入口；
 * 进入设置后整体切换为设置菜单。头部干净无冗余装饰，不使用卡片式盒子。
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { view, settingsSection, setSettingsSection, setView, openSettings, setAboutOpen } = useUi();
  const { settings } = useApp();
  const inSettings = view === 'full-settings';

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      {/* Linear 头部：干净品牌行 + 只读/可写指示 + 侧栏折叠 */}
      <SidebarHeader className="px-2.5 pb-2 pt-1.5">
        {/* macOS 沉浸式窗口：红绿灯安全留白避让与可拖拽区（Linear 桌面端标准） */}
        <div data-tauri-drag-region className="h-8 w-full shrink-0 select-none" />
        <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2">
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            title="关于 nervd"
            className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-sidebar-accent/50"
          >
            <div className="flex aspect-square size-6 shrink-0 items-center justify-center rounded-[6px] bg-sidebar-primary text-sidebar-primary-foreground shadow-xs transition-transform group-hover:scale-105">
              <img
                src="/nervd-logo.png"
                alt="nervd logo"
                aria-hidden="true"
                className="size-full rounded-[6px] object-cover"
              />
            </div>
            <span className="truncate text-[13px] font-semibold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
              nervd
            </span>
          </button>

          <div className="flex items-center gap-1">
            {/* 读写策略指示：只读时展示微标，点击直达安全设置；可写时展示状态小绿点 */}
            <div className="group-data-[collapsible=icon]:hidden">
              {settings != null && !settings.allowWriteOps ? (
                <button
                  type="button"
                  onClick={() => openSettings('security')}
                  title="当前为只读模式 · 点击前往安全设置"
                  className="cursor-pointer rounded bg-muted/80 px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  只读
                </button>
              ) : (
                <span
                  title="可写模式"
                  className="inline-block size-1.5 rounded-full bg-sig-ok"
                />
              )}
            </div>
            {/* 折叠钮收在侧栏品牌行右侧 */}
            <SidebarTrigger aria-label="折叠/展开侧栏" className="shrink-0 opacity-60 transition-opacity hover:opacity-100" />
          </div>
        </div>
        {/* 搜索行（Linear 同款）：固定常驻在 Header 顶层，永不随滚动条滚走 */}
        {!inSettings && (
          <div className="pt-1.5 group-data-[collapsible=icon]:hidden">
            <button
              type="button"
              onClick={() => useUi.getState().setCommandOpen(true)}
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md bg-sidebar-accent/50 px-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <SearchIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">搜索或跳转…</span>
              <kbd className="shrink-0 rounded border border-border bg-background px-1 font-mono text-[11px] leading-4 text-muted-foreground">⌘K</kbd>
            </button>
          </div>
        )}
      </SidebarHeader>

      {inSettings ? (
        // 设置模式：左侧栏即设置菜单，顶部为返回工作区，下方直列各个设置分区
        <SidebarContent className="gap-1 px-2.5 py-2">
          {/* 返回工作区按钮置于顶部 */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="返回工作区" onClick={() => setView('iteration')}>
                <ArrowLeftIcon />
                <span>返回工作区</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <SidebarSeparator className="my-1" />

          {/* 设置分区列表 */}
          <SidebarMenu>
            {SETTINGS_SECTIONS.map((section) => (
              <SidebarMenuItem key={section.value}>
                <SidebarMenuButton
                  tooltip={section.label}
                  isActive={settingsSection === section.value}
                  onClick={() => setSettingsSection(section.value)}
                >
                  <section.icon />
                  <span>{section.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
      ) : (
        <SidebarContent className="gap-1 px-2.5 py-2">
          {/* 主导航：总览（全局交付大盘）+ 集成分支（跨仓分支集成） */}
          <NavMain
            items={[
              {
                title: '总览',
                icon: <LayoutDashboardIcon />,
                view: 'overview',
              },
              {
                title: '集成分支',
                icon: <GitBranchIcon />,
                view: 'integration',
              },
            ]}
          />
          {/* 迭代分组：真实迭代列表（单选切换视图） */}
          <NavProjects />
        </SidebarContent>
      )}

      <SidebarFooter className="border-t border-sidebar-border/70 p-2.5">
        {/* 设置模式下侧栏已是设置菜单，底部用户区（设置入口）不再重复出现 */}
        {!inSettings && <NavUser />}
      </SidebarFooter>
    </Sidebar>
  );
}
