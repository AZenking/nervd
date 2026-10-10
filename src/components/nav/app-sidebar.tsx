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
  DatabaseIcon,
  LayoutDashboardIcon,
  SearchIcon,
  TerminalSquareIcon,
  TerminalIcon,
} from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { StatusBadge } from '../StatusBadge';
import { SETTINGS_SECTIONS } from '../settings/sections';

/** nervd 基准侧栏：品牌 + 工作区卡片 + 主导航 + 迭代分组 + 用户区；进入设置后整体切换为设置菜单 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { view, iterationKey, settingsSection, setSettingsSection, setView } = useUi();
  const { settings } = useApp();
  const inSettings = view === 'full-settings';

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-sidebar-border/70 px-2.5 pb-2 pt-2">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2">
          <SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
            <SidebarMenuItem>
              <SidebarMenuButton size="lg">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <TerminalIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold tracking-tight">nervd</span>
                  <span className="truncate text-xs font-medium tracking-[0.14em] text-muted-foreground">Delivery Control</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {/* Notion 式：折叠钮收在侧栏品牌行右侧，不再占用顶栏 */}
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
          {/* 全局搜索入口（⌘K）：切到迭代视图并聚焦主区搜索框 */}
          <div className="px-0.5 pb-1">
            <button
              type="button"
              onClick={() => useUi.getState().focusGlobalSearch()}
              className="flex h-7 w-full items-center gap-2 rounded-md bg-sidebar-accent/50 px-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <SearchIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">搜索工作项</span>
              <kbd className="shrink-0 rounded border border-border bg-background px-1 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
            </button>
          </div>
          {/* 工作区卡片：真实组织与连接状态 */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="pointer-events-none border border-sidebar-border bg-sidebar">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-primary">
                  <DatabaseIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">工作区</span>
                  <span className="truncate font-medium">
                    {settings?.organizationId ? `平台工程 / ${settings.organizationId.slice(0, 6)}…` : '未配置'}
                  </span>
                </div>
                {/* 读写策略徽章（原底部状态行上移到此，UX 评审）；连接状态见设置页保存栏与总览 */}
                <StatusBadge status={settings?.allowWriteOps ? 'WRITABLE' : 'READONLY'} />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <NavMain
            items={[
              {
                title: '工作区',
                icon: <TerminalSquareIcon />,
                // UX A3：主按钮可点（回当前迭代），高亮覆盖 iteration + requirement
                view: 'iteration',
                isActive: view === 'iteration' || view === 'requirement',
                items: [
                  { title: `当前迭代 · ${iterationKey}`, view: 'iteration' },
                  { title: '设置', view: 'full-settings' },
                ],
              },
              {
                title: '总览',
                icon: <LayoutDashboardIcon />,
                view: 'overview',
              },
            ]}
          />
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
