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
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { NavCollapsibleGroup } from './nav-group';
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  GitBranchIcon,
  LayoutDashboardIcon,
  SearchIcon,
  TerminalIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { SETTINGS_SECTIONS } from '../settings/sections';

/**
 * nervd 侧栏（Linear 解剖）：工作区行 + 搜索行 + 主导航 + 迭代分组 + 用户区；
 * 进入设置后整体切换为设置菜单。头部干净无分隔线，不使用卡片式盒子。
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { view, settingsSection, setSettingsSection, setView } = useUi();
  const { settings } = useApp();
  const inSettings = view === 'full-settings';

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      {/* Linear 头部：无 border-b，保持干净 */}
      <SidebarHeader className="px-2.5 pb-2 pt-2">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2">
          <SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
            <SidebarMenuItem>
              {/* 工作区切换行（Linear 单行形态）：方角头像 + 名称 + 读写状态点 + 下拉箭头 */}
              <SidebarMenuButton size="lg" className="pointer-events-none">
                <div className="flex aspect-square size-6 shrink-0 items-center justify-center rounded-[6px] bg-sidebar-primary text-sidebar-primary-foreground">
                  <TerminalIcon className="size-3.5" />
                </div>
                <span className="truncate text-[13px] font-semibold">nervd</span>
                {/* 读写策略小圆点：绿=可写，灰=只读 */}
                <span
                  title={settings?.allowWriteOps ? '可写' : '只读'}
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    settings?.allowWriteOps ? 'bg-sig-ok' : 'bg-sig-idle',
                  )}
                />
                <ChevronDownIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {/* 折叠钮收在侧栏品牌行右侧，不再占用顶栏 */}
          <SidebarTrigger aria-label="折叠/展开侧栏" className="shrink-0 opacity-60 transition-opacity hover:opacity-100" />
        </div>
      </SidebarHeader>

      {inSettings ? (
        // 设置模式：左侧栏即设置菜单，右侧内容区按所选分区渲染（分区间共享同一份草稿，切换不丢未保存修改）
        <SidebarContent className="gap-1 px-2.5 py-3">
          <NavCollapsibleGroup
            label="设置"
            labelClassName="px-2"
            className="px-0"
          >
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
          </NavCollapsibleGroup>
          <NavCollapsibleGroup
            label="工作区"
            labelClassName="px-2"
            className="px-0"
          >
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="返回工作区" onClick={() => setView('iteration')}>
                  <ArrowLeftIcon />
                  <span>返回工作区</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </NavCollapsibleGroup>
        </SidebarContent>
      ) : (
        <SidebarContent className="gap-1 px-2.5 py-3">
          {/* 搜索行（Linear 同款）：打开命令面板（⌘K） */}
          <div className="px-0.5 pb-1">
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
          {/* 主导航：Linear 两段式（当前迭代 / 总览），无嵌套子项 */}
          <NavMain
            items={[
              {
                title: '当前迭代',
                icon: <CalendarDaysIcon />,
                // 迭代详情（requirement）沿用同一高亮
                view: 'iteration',
                isActive: view === 'iteration' || view === 'requirement',
              },
              {
                title: '集成分支',
                icon: <GitBranchIcon />,
                view: 'integration',
              },
              {
                title: '总览',
                icon: <LayoutDashboardIcon />,
                view: 'overview',
              },
            ]}
          />
          {/* 迭代分组：真实迭代列表 + 需求子列表 */}
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
