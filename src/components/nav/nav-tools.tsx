import { useEffect, useState, type ReactNode } from 'react';
import {
  CalendarClockIcon,
  ChevronRightIcon,
  ClockIcon,
  FolderGit2Icon,
  GitBranchIcon,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useRecentWorkitems } from '@/store/recent-workitems';
import { useScheduleStore } from '@/store/schedule';
import { useUi } from '@/store/ui';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/utils';

/** 侧栏工具分组内的单个条目（视图跳转 / 设置分区直达） */
interface NavToolEntry {
  title: string;
  icon: ReactNode;
  isActive: boolean;
  badge?: ReactNode;
  onSelect: () => void;
}

/** 计数徽标：与主导航原有样式保持一致（等宽数字、折叠态隐藏） */
function NavCountBadge({ count }: { count: number }) {
  return (
    <Chip size="sm" variant="secondary" className="ml-auto font-mono tabular-nums group-data-[collapsible=icon]:hidden">
      {count}
    </Chip>
  );
}

/**
 * 侧栏「工具」分组（导航收敛为 当前迭代 / 总览 / 迭代列表 / 工具 四类入口）：
 * - 展开态：分组标题为可聚焦 Disclosure 按钮，Enter/Space 或点击开合，aria-expanded 由 React Aria 维护；
 *   默认收起，进入工具内页面时自动展开，保证当前页在侧栏可见（用户仍可手动收起）。
 * - 折叠态（group-data-[collapsible=icon]）：标题与折叠容器一并让位，4 个条目直接作为图标按钮常驻，
 *   与主导航项一致（SidebarMenuButton 在折叠态自动以 tooltip 文本作为 aria-label），不会因标题隐藏而无法到达。
 * - 不含「高级模式」开关：工具内的「本地仓库与 Agent」直接复用 openSettings('attribution') 进入既有变更归属设置。
 */
export function NavTools({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { view, settingsSection, setView, openSettings } = useUi();
  const { state, isMobile } = useSidebar();
  const recentCount = useRecentWorkitems((s) => s.items.length);
  const activeScheduleCount = useScheduleStore(
    (s) => s.tasks.filter((task) => task.enabled).length,
  );
  const [open, setOpen] = useState(defaultOpen);

  const entries: NavToolEntry[] = [
    {
      title: '最近查看',
      icon: <ClockIcon />,
      isActive: view === 'recents',
      badge: recentCount > 0 ? <NavCountBadge count={recentCount} /> : null,
      onSelect: () => setView('recents'),
    },
    {
      title: '集成分支',
      icon: <GitBranchIcon />,
      isActive: view === 'integration',
      onSelect: () => setView('integration'),
    },
    {
      title: '定时任务',
      icon: <CalendarClockIcon />,
      isActive: view === 'schedules',
      // 保留「已启用任务数」徽标（SchedulesView 的全局暂停/任务操作逻辑不在此改动）
      badge: activeScheduleCount > 0 ? <NavCountBadge count={activeScheduleCount} /> : null,
      onSelect: () => setView('schedules'),
    },
    {
      title: '本地仓库与 Agent',
      icon: <FolderGit2Icon />,
      isActive: view === 'full-settings' && settingsSection === 'attribution',
      // 不新增页面标识：直达现有「变更归属」设置分区
      onSelect: () => openSettings('attribution'),
    },
  ];

  const hasActiveEntry = entries.some((entry) => entry.isActive);

  // 进入工具内页面（如 g b / g c / g r）时自动展开，避免当前页在侧栏不可见；
  // 依赖为布尔值，用户手动收起后不会因为同一页面的重渲染反复弹开。
  useEffect(() => {
    if (hasActiveEntry) setOpen(true);
  }, [hasActiveEntry]);

  const menu = (
    <SidebarMenu className="gap-1">
      {entries.map((entry) => (
        <SidebarMenuItem key={entry.title}>
          <SidebarMenuButton
            tooltip={entry.title}
            isActive={entry.isActive}
            aria-current={entry.isActive ? 'page' : undefined}
            onClick={entry.onSelect}
          >
            {entry.icon}
            <span className="flex-1 font-medium group-data-[collapsible=icon]:hidden">
              {entry.title}
            </span>
            {entry.badge}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  // 纯图标模式：分组标题会随 CSS 隐藏，若继续包在折叠容器里，收起状态下条目将不可达。
  // 因此折叠态直接平铺 4 个图标入口（页面标识与顺序不变）。
  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarGroup data-nav-group="tools" className="px-0 py-0">
        {menu}
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup data-nav-group="tools" className="px-0 py-0">
      <Collapsible open={open} onOpenChange={setOpen} className="w-full">
        <CollapsibleTrigger
          data-nav-tools-trigger
          className={cn(
            'flex h-8 w-full cursor-pointer select-none items-center gap-1 rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 transition-colors',
            'hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
          )}
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              'size-3 shrink-0 text-sidebar-foreground/45 transition-transform duration-200',
              open && 'rotate-90',
            )}
          />
          <span className="min-w-0 flex-1 text-left">工具</span>
        </CollapsibleTrigger>
        <CollapsibleContent>{menu}</CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}