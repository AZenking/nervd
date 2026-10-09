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
} from '@/components/ui/sidebar';
import {
  DatabaseIcon,
  LayoutDashboardIcon,
  Settings2Icon,
  TerminalSquareIcon,
  TerminalIcon,
} from 'lucide-react';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';

/** nervd-new-ui 基准侧栏：品牌 + 工作区卡片 + 主导航 + 迭代分组 + 用户区 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { view, iterationKey } = useUi();
  const { settings, connection } = useApp();

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <TerminalIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">nervd</span>
                <span className="truncate text-xs">DELIVERY CONTROL</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* 工作区卡片：真实组织与连接状态 */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                <DatabaseIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-xs text-muted-foreground">工作区</span>
                <span className="truncate font-medium">
                  {settings?.organizationId ? `平台工程 / ${settings.organizationId.slice(0, 6)}…` : '未配置'}
                </span>
              </div>
              <span
                className={
                  connection === 'ok'
                    ? 'size-2 rounded-full bg-emerald-500'
                    : connection === 'fail'
                      ? 'size-2 rounded-full bg-red-500'
                      : 'size-2 rounded-full bg-muted-foreground/40'
                }
                title={connection === 'ok' ? '云效 API 已连接' : connection === 'fail' ? '连接失败' : '连接中'}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavMain
          items={[
            {
              title: '工作区',
              icon: <TerminalSquareIcon />,
              isActive: view === 'iteration' || view === 'requirement',
              items: [
                { title: `当前迭代 · ${iterationKey}`, view: 'iteration' },
                { title: '工作区设置', view: 'full-settings' },
              ],
            },
            {
              title: '总览',
              icon: <LayoutDashboardIcon />,
              view: 'overview',
            },
            {
              title: '环境与策略',
              icon: <Settings2Icon />,
              view: 'settings',
            },
          ]}
        />
        <NavProjects />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
