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
} from '@/components/ui/sidebar';
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ClockIcon,
  LayoutDashboardIcon,
  SearchIcon,
  ZapIcon,
} from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { useRecentWorkitems } from '@/store/recent-workitems';
import { useScheduleStore } from '@/store/schedule';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';
import { useSettingsDraft } from '@/store/settings-draft';
import { SETTINGS_SECTIONS, getSectionErrorCount } from '../settings/sections';
import { cn } from '@/lib/utils';

/**
 * nervd 侧栏：对齐现代 SaaS 视觉风格（大圆角胶囊、顶部个人卡片、精致状态徽标）
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { view, settingsSection, setSettingsSection, setView, openSettings, setQuickBuildOpen } = useUi();
  const { settings, currentUser } = useApp();
  const fieldErrors = useSettingsDraft((s) => s.fieldErrors);
  const recentCount = useRecentWorkitems((s) => s.items.length);
  const activeScheduleCount = useScheduleStore(
    (s) => s.tasks.filter((t) => t.enabled).length,
  );
  const inSettings = view === 'full-settings';

  const displayName = currentUser?.name || 'Kate Moore';
  const displayRole = currentUser?.email
    ? currentUser.email
    : settings?.allowWriteOps
    ? 'Admin'
    : 'Viewer';

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader
        data-tauri-drag-region
        className="px-3 pb-2 pt-2 select-none group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:items-center"
      >
        {/* macOS 沉浸式窗口：红绿灯安全留白避让与可拖拽区（配合 y:26 红绿灯位置下移） */}
        <div data-tauri-drag-region className="h-9 w-full shrink-0 select-none cursor-default" />

        {/* 顶部个人卡片：对齐参考图中的 Kate Moore / Admin 头部风格 */}
        <div
          data-tauri-drag-region
          className="flex items-center justify-between gap-2.5 rounded-2xl p-1 transition-colors group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-0"
        >
          <button
            type="button"
            onClick={() => openSettings('connection')}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl p-1.5 text-left transition-all hover:bg-sidebar-accent group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:p-0"
            title={`${displayName} (${displayRole}) · 点击进入账号设置`}
            data-no-drag
          >
            <div className="relative size-10 shrink-0 overflow-hidden rounded-full shadow-2xs ring-1 ring-border/40">
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={displayName}
                  className="size-full object-cover"
                />
              ) : (
                /* 渐变艺术头像，对齐图片中 Kate Moore 的紫蓝青柔和渐变 */
                <div className="flex size-full items-center justify-center bg-gradient-to-tr from-(--brand-indigo)/25 via-(--sticker-sky)/30 to-(--sticker-green)/30 text-(--brand-indigo) font-semibold text-sm select-none dark:text-(--sticker-purple)">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              {/* 可写 / 只读小状态指示点落在头像右下角 */}
              <span
                className={cn(
                  "absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-sidebar",
                  settings?.allowWriteOps ? "bg-success" : "bg-warning"
                )}
                title={settings?.allowWriteOps ? "读写模式已启用" : "只读安全模式"}
              />
            </div>

            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-[13.5px] font-semibold text-foreground tracking-tight leading-tight">
                {displayName}
              </div>
              <div className="truncate text-xs text-muted-foreground mt-0.5 font-normal leading-tight">
                {displayRole}
              </div>
            </div>
          </button>
        </div>

        {/* 搜索与快速操作区：软胶囊输入框 */}
        {!inSettings && (
          <>
            <div className="pt-1.5 flex flex-col gap-1.5 group-data-[collapsible=icon]:hidden" data-no-drag>
              <button
                type="button"
                onClick={() => useUi.getState().setCommandOpen(true)}
                className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl bg-sidebar-accent/70 px-3 text-[12.5px] text-muted-foreground transition-all hover:bg-sidebar-accent hover:text-foreground"
              >
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-left">搜索或跳转…</span>
                <Kbd className="shrink-0 h-5! px-1.5! font-mono! text-[10.5px]! leading-none!">
                  ⌘K
                </Kbd>
              </button>
            </div>
            {/* 折叠模式下的图标按钮 */}
            <div className="pt-1.5 hidden group-data-[collapsible=icon]:flex flex-col items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => useUi.getState().setCommandOpen(true)}
                      aria-label="搜索或跳转 (⌘K)"
                      className="flex size-8 cursor-pointer items-center justify-center rounded-xl bg-sidebar-accent/70 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                    />
                  }
                >
                  <SearchIcon className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="right">搜索或跳转 (⌘K)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => setQuickBuildOpen(true)}
                      aria-label="快速构建 (⌘B)"
                      className="flex size-8 cursor-pointer items-center justify-center rounded-xl bg-sidebar-accent/70 text-warning hover:bg-sidebar-accent"
                    />
                  }
                >
                  <ZapIcon className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="right">快速构建流水线 (⌘B)</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </SidebarHeader>

      {inSettings ? (
        // 设置模式：左侧栏即设置菜单，顶部为返回工作区，下方直列各个设置分区
        <SidebarContent className="gap-1 px-3 py-2 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:items-center">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="返回工作区" onClick={() => setView('iteration')}>
                <ArrowLeftIcon />
                <span className="group-data-[collapsible=icon]:hidden">返回工作区</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <SidebarSeparator className="my-1.5" />

          {/* 设置分区列表 */}
          <SidebarMenu>
            {SETTINGS_SECTIONS.map((section) => {
              const errorCount = getSectionErrorCount(section.value, fieldErrors);
              return (
                <SidebarMenuItem key={section.value}>
                  <SidebarMenuButton
                    tooltip={section.label}
                    isActive={settingsSection === section.value}
                    onClick={() => setSettingsSection(section.value)}
                  >
                    <section.icon />
                    <span className="flex-1 font-medium group-data-[collapsible=icon]:hidden">{section.label}</span>
                    {errorCount > 0 && (
                      <span
                        className="size-2 rounded-full bg-destructive shrink-0"
                        title={`${section.label}有待修正项`}
                      />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
      ) : (
        <SidebarContent className="gap-1.5 px-3 py-2 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:items-center">
          {/* 主导航：对齐图片菜单序列（Dashboard, Orders, Tracker [New], Analytics, etc.） */}
          <NavMain
            items={[
              {
                title: '总览',
                icon: <LayoutDashboardIcon />,
                view: 'overview',
              },
              {
                title: '当前迭代',
                icon: <CalendarDaysIcon />,
                view: 'iteration',
              },
              {
                title: '定时任务',
                icon: <CalendarClockIcon />,
                view: 'schedules',
                badge: activeScheduleCount > 0 ? (
                  <span className="ml-auto rounded-full bg-sidebar-accent text-muted-foreground px-2 py-0.5 font-mono text-[10.5px] font-medium leading-none group-data-[collapsible=icon]:hidden">
                    {activeScheduleCount}
                  </span>
                ) : null,
              },
              {
                title: '最近查看',
                icon: <ClockIcon />,
                view: 'recents',
                badge: recentCount > 0 ? (
                  <span className="ml-auto rounded-full bg-sidebar-accent text-muted-foreground px-2 py-0.5 font-mono text-[10.5px] font-medium leading-none group-data-[collapsible=icon]:hidden">
                    {recentCount}
                  </span>
                ) : null,
              },
            ]}
          />
          {/* 迭代分组：真实迭代列表（单选切换视图） */}
          <NavProjects />
        </SidebarContent>
      )}

      <SidebarFooter className="border-t border-sidebar-border/70 p-3 pt-2 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:items-center">
        {!inSettings && <NavUser />}
      </SidebarFooter>
    </Sidebar>
  );
}
