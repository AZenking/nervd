import { NavMain } from './nav-main';
import { NavProjects } from './nav-projects';
import { NavTools } from './nav-tools';
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
  CalendarDaysIcon,
  LayoutDashboardIcon,
  SearchIcon,
  ZapIcon,
} from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
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
          className="relative flex items-center justify-between gap-2.5 rounded-xl p-1 transition-colors group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-0"
        >
          <button
            type="button"
            onClick={() => openSettings('connection')}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl p-1.5 text-left transition-all hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:p-0"
            title={`${displayName} (${displayRole}) · 点击进入账号设置`}
            data-no-drag
          >
            <div className="relative size-10 shrink-0 overflow-hidden rounded-full ring-1 ring-border/40">
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={displayName}
                  className="size-full object-cover"
                />
              ) : (
                /* 渐变艺术头像，对齐图片中 Kate Moore 的紫蓝青柔和渐变 */
                <div className="flex size-full items-center justify-center bg-gradient-to-tr from-(--brand-indigo)/25 via-(--sticker-sky)/30 to-(--sticker-green)/30 text-(--brand-indigo) font-semibold text-sm select-none">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
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

          {/* 只读安全模式徽标：展开态为可见文字徽标，折叠态收敛为头像右下角圆点；
              点击直达「安全」设置分区（AGENTS.md §2.5），不再让只读原因不可见 */}
          {!settings?.allowWriteOps && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    data-no-drag
                    aria-label="只读安全模式"
                    variant="outline"
                    size="xs"
                    onPress={() => openSettings('security')}
                    className={cn(
                      'shrink-0 border-warning/30 font-medium text-warning hover:bg-warning/15',
                      'group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:bottom-0 group-data-[collapsible=icon]:right-0 group-data-[collapsible=icon]:z-10 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:size-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0',
                    )}
                  />
                }
              >
                <span className="group-data-[collapsible=icon]:hidden">只读</span>
                <span
                  aria-hidden="true"
                  className="hidden size-2.5 rounded-full bg-warning ring-2 ring-sidebar group-data-[collapsible=icon]:block"
                />
              </TooltipTrigger>
              <TooltipContent side="right">只读安全模式 · 点击前往安全设置</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* 搜索与快速操作区：软胶囊输入框 */}
        {!inSettings && (
          <>
            <div className="pt-1.5 flex flex-col gap-1.5 group-data-[collapsible=icon]:hidden" data-no-drag>
              <button
                type="button"
                onClick={() => useUi.getState().setCommandOpen(true)}
                className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl bg-sidebar-accent/70 px-3 text-[12.5px] text-muted-foreground transition-all hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-left">搜索、跳转或执行命令…</span>
                <Kbd className="shrink-0 h-5! px-1.5! text-[10px]! leading-none!">
                  ⌘K
                </Kbd>
              </button>
            </div>
            {/* 折叠模式下的图标按钮 */}
            <div className="pt-1.5 hidden group-data-[collapsible=icon]:flex flex-col items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="搜索、跳转或执行命令 (⌘K)"
                      onPress={() => useUi.getState().setCommandOpen(true)}
                      className="text-muted-foreground hover:text-foreground"
                    />
                  }
                >
                  <SearchIcon className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="right">搜索、跳转或执行命令 (⌘K)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="快速构建 (⌘B)"
                      onPress={() => setQuickBuildOpen(true)}
                      className="text-warning"
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
          <nav aria-label="设置导航" className="flex w-full flex-col gap-1 group-data-[collapsible=icon]:items-center">
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
                      aria-current={settingsSection === section.value ? 'page' : undefined}
                      onClick={() => setSettingsSection(section.value)}
                    >
                      <section.icon />
                      <span className="flex-1 font-medium group-data-[collapsible=icon]:hidden">{section.label}</span>
                      {errorCount > 0 && (
                        <>
                          <span className="size-2 rounded-full bg-destructive shrink-0" aria-hidden="true" />
                          <span className="sr-only">{section.label}有待修正项</span>
                        </>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </nav>
        </SidebarContent>
      ) : (
        <SidebarContent className="gap-1.5 px-3 py-2 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:items-center">
          <nav aria-label="主导航" className="flex w-full flex-col gap-1.5 group-data-[collapsible=icon]:items-center">
            {/* 主导航（导航收敛：当前迭代 / 总览 为主入口；迭代列表与工具分组依次收在其后） */}
            <NavMain
              items={[
                {
                  title: '当前迭代',
                  icon: <CalendarDaysIcon />,
                  view: 'iteration',
                },
                {
                  title: '总览',
                  icon: <LayoutDashboardIcon />,
                  view: 'overview',
                },
              ]}
            />
            {/* 迭代列表：保留原「迭代」分组的 NavProjects Accordion 切换方式 */}
            <NavProjects />
            {/* 工具菜单：最近查看 / 集成分支 / 定时任务 / 本地仓库与 Agent（折叠态平铺为图标入口） */}
            <NavTools />
          </nav>
        </SidebarContent>
      )}

      <SidebarFooter className="border-t border-sidebar-border/70 p-3 pt-2 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:items-center">
        {!inSettings && <NavUser />}
      </SidebarFooter>
    </Sidebar>
  );
}
