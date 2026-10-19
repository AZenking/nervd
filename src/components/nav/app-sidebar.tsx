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
  ArrowDownToLineIcon,
  ArrowLeftIcon,
  GitBranchIcon,
  LayoutDashboardIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
} from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { useAppUpdate } from '@/hooks/use-app-update';
import { APP_VERSION } from '@/lib/app-info';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SETTINGS_SECTIONS } from '../settings/sections';

/**
 * nervd 侧栏（Linear 解剖）：工作区行 + 搜索行 + 主导航 + 迭代分组 + 设置入口；
 * 进入设置后整体切换为设置菜单。头部干净无冗余装饰，不使用卡片式盒子。
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { view, settingsSection, setSettingsSection, setView, openSettings, setAboutOpen } = useUi();
  const { settings } = useApp();
  const { hasUpdate, updateInfo, isUpdating } = useAppUpdate();
  const latestVersion = updateInfo?.latestVersion;
  const inSettings = view === 'full-settings';

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      {/* Linear 头部：干净品牌行 + 只读/可写指示 + 侧栏折叠 */}
      <SidebarHeader className="px-2.5 pb-2 pt-1.5">
        {/* macOS 沉浸式窗口：红绿灯安全留白避让与可拖拽区（Linear 桌面端标准） */}
        <div data-tauri-drag-region className="h-8 w-full shrink-0 select-none" />
        <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 group-data-[collapsible=icon]:flex-col">
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              title={hasUpdate ? `发现新版本 v${latestVersion} · 点击查看更新` : `关于 nervd (v${APP_VERSION})`}
              className="group flex cursor-pointer items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-sidebar-accent/50"
            >
              <div className="relative flex aspect-square size-6 shrink-0 items-center justify-center rounded-[6px] bg-sidebar-primary text-sidebar-primary-foreground shadow-xs transition-transform group-hover:scale-105">
                <img
                  src="/nervd-logo.png"
                  alt="nervd logo"
                  aria-hidden="true"
                  className="size-full rounded-[6px] object-cover"
                />
                {/* 侧栏折叠时若有新版本，在 Logo 角标处展示小圆点 */}
                {hasUpdate && (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-sidebar hidden group-data-[collapsible=icon]:block animate-pulse" />
                )}
              </div>
              <span className="truncate text-[13px] font-semibold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
                nervd
              </span>
            </button>

            {/* 展开态下的版本号 / 更新下载按钮 */}
            <div className="group-data-[collapsible=icon]:hidden flex items-center shrink-0">
              {hasUpdate ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => setAboutOpen(true)}
                        aria-label={`发现新版本 v${latestVersion}，点击更新`}
                        className="group/btn flex cursor-pointer items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-primary shadow-xs transition-all hover:bg-primary/20 hover:border-primary/60 active:scale-95"
                      />
                    }
                  >
                    {isUpdating ? (
                      <Loader2Icon className="size-3 animate-spin shrink-0 text-primary" />
                    ) : (
                      <ArrowDownToLineIcon className="size-3 shrink-0 text-primary animate-bounce duration-1000" />
                    )}
                    <span className="font-mono text-[10.5px] font-medium leading-none">
                      v{latestVersion}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    className="max-w-xs flex flex-col gap-1 rounded-lg border border-border/80 bg-popover p-2.5 text-popover-foreground shadow-xl"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-primary">
                      <SparklesIcon className="size-3.5 shrink-0 text-amber-500" />
                      <span>发现最新版本 v{latestVersion}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {updateInfo?.releaseName || updateInfo?.releaseNotes || '检测到全新版本，点击打开更新面板进行安装。'}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-primary">
                      <span>点击触发更新弹窗 →</span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => setAboutOpen(true)}
                        className="cursor-pointer select-none rounded border border-border/40 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/75 tracking-tight transition-colors hover:bg-muted hover:text-foreground"
                      />
                    }
                  >
                    v{APP_VERSION}
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" sideOffset={6}>
                    nervd v{APP_VERSION} · 点击查看详情
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
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
