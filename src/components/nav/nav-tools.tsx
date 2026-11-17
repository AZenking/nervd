import { useEffect, useState, type ReactNode } from 'react';
import {
  ClockIcon,
  GitBranchIcon,
} from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useRecentWorkitems } from '@/store/recent-workitems';
import { useUi } from '@/store/ui';
import { Chip } from '@/components/ui/chip';

/** 侧栏工具分组内的单个条目（视图跳转 / 设置分区直达） */
interface NavToolEntry {
  title: string;
  icon: ReactNode;
  isActive: boolean;
  badge?: ReactNode;
  onSelect: () => void;
}

/** 计数徽标：与主导航原有样式保持一致（等宽数字、折叠态隐藏） */
export function NavCountBadge({ count }: { count: number }) {
  return (
    <Chip size="sm" variant="secondary" className="ml-auto font-mono tabular-nums group-data-[collapsible=icon]:hidden">
      {count}
    </Chip>
  );
}

/**
 * 侧栏「工具」分组（导航收敛为 当前迭代 / 总览 / 迭代列表 / 工具 四类入口）：
 * - 展开态：与「迭代列表」一致使用 HeroUI Accordion 原生手风琴（DESIGN §2.2 形态统一），
 *   分组标题即 Accordion.Trigger，Enter/Space 或点击开合，aria-expanded 由 React Aria 维护；
 *   默认收起，进入工具内页面时自动展开，保证当前页在侧栏可见（用户仍可手动收起）。
 * - 折叠态（group-data-[collapsible=icon]）：标题与折叠容器一并让位，条目直接作为图标按钮常驻，
 *   与主导航项一致（SidebarMenuButton 在折叠态自动以 tooltip 文本作为 aria-label），不会因标题隐藏而无法到达。
 * - 「定时任务」已上提为主导航入口（紧跟总览，2026-11-17）；「本地仓库与 Agent」入口下线，
 *   本地仓库绑定仍可从「设置 → 仓库与分支」进入。
 */
export function NavTools({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { view, setView } = useUi();
  const { state, isMobile } = useSidebar();
  const recentCount = useRecentWorkitems((s) => s.items.length);
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
  // 因此折叠态直接平铺条目图标入口（页面标识与顺序不变）。
  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarGroup data-nav-group="tools" className="px-0 py-0">
        {menu}
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup data-nav-group="tools" className="px-0 py-0">
      <Accordion
        expandedKeys={open ? ['tools'] : []}
        onExpandedChange={(keys) => {
          // RAC DisclosureGroup 回传 Set<Key>；单条目分组只需判断是否含 'tools'
          setOpen(keys.has('tools'));
        }}
        className="w-full px-0"
      >
        <Accordion.Item id="tools" className="border-none">
          <Accordion.Heading>
            <Accordion.Trigger
              data-nav-tools-trigger
              className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground"
            >
              <span className="min-w-0 flex-1 text-left">工具</span>
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="p-0">{menu}</Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </SidebarGroup>
  );
}
