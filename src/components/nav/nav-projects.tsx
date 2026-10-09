import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CalendarDaysIcon, ChevronRightIcon, CircleDotIcon, ListFilterIcon, PlusIcon, UserIcon, UsersIcon, XIcon,
} from 'lucide-react';
import { useApp } from '@/store/app';
import {
  useUi, iterationsOrFallback, scopedItems, buildWorkitemFilterOptions, applyWorkitemFilters,
  type WorkitemFilters,
} from '@/store/ui';

/** 需求标题：truncate + 仅在溢出时显示 Tooltip */
function RequirementTitle({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowed, setOverflowed] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            ref={ref}
            className="truncate"
            onMouseEnter={() => {
              const el = ref.current;
              if (el) setOverflowed(el.scrollWidth > el.clientWidth);
            }}
          />
        }
      >
        {title}
      </TooltipTrigger>
      {overflowed && (
        <TooltipContent side="right" className="max-w-72 break-words">
          {title}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

/** 多选筛选下拉（侧栏紧凑版）：选项取自当前迭代已加载工作项（含计数），选中不关闭菜单 */
function FilterMenu({ label, icon, kind, options }: {
  label: string;
  icon: ReactNode;
  kind: keyof WorkitemFilters;
  options: [string, number][];
}) {
  const selected = useUi((s) => s.filters[kind]);
  const toggleFilter = useUi((s) => s.toggleFilter);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={selected.length ? 'secondary' : 'outline'} size="sm" className="h-6 gap-1 rounded-md px-1.5 text-xs" />}
      >
        {icon}
        {label}
        {selected.length > 0 && (
          <Badge variant="secondary" className="rounded-full px-1.5 text-[10px]">{selected.length}</Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto">
        {options.map(([value, count]) => (
          <DropdownMenuCheckboxItem
            key={value}
            checked={selected.includes(value)}
            onCheckedChange={() => toggleFilter(kind, value)}
            closeOnClick={false}
          >
            <span className="min-w-0 flex-1 truncate">{value}</span>
            <span className="shrink-0 pl-2 text-xs tabular-nums text-muted-foreground">{count}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {!options.length && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">暂无可筛选项</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 迭代分组：云效 sprints OpenAPI 的真实迭代列表（不可用时回退占位壳）。
 * 当前迭代行下方提供 处理人/关联人/状态 筛选（同时作用于侧栏需求子列表与主区工作项网格）；
 * 需求子项按当前迭代 sprint 过滤真实工作项列表（store.items）。
 */
export function NavProjects() {
  const { iterationKey, setIteration, openRequirement, filters, clearFilters } = useUi();
  const {
    items, selectedId, select, loadingList,
    iterations: realIterations, loadingIterations,
  } = useApp();
  const [expanded, setExpanded] = useState(true);

  const iterations = iterationsOrFallback(realIterations);
  const scoped = useMemo(
    () => scopedItems(items, iterationKey, realIterations),
    [items, iterationKey, realIterations],
  );
  const options = useMemo(() => buildWorkitemFilterOptions(scoped), [scoped]);
  const filtered = useMemo(() => applyWorkitemFilters(scoped, filters), [scoped, filters]);
  const activeFilterCount = filters.assignees.length + filters.related.length + filters.statuses.length;

  // 重新加载 / 切换迭代后，清理选项中已不存在的筛选项
  useEffect(() => {
    const prune = (sel: string[], opts: [string, number][]) =>
      sel.filter((v) => opts.some(([o]) => o === v));
    const next: WorkitemFilters = {
      assignees: prune(filters.assignees, options.assignees),
      related: prune(filters.related, options.related),
      statuses: prune(filters.statuses, options.statuses),
    };
    const changed =
      next.assignees.length !== filters.assignees.length ||
      next.related.length !== filters.related.length ||
      next.statuses.length !== filters.statuses.length;
    if (changed) useUi.setState({ filters: next });
  }, [options, filters]);

  const requirementEntries = useMemo(
    () => filtered.slice(0, 12).map((it) => ({ id: it.identifier, title: it.subject, workitemId: it.workitemId })),
    [filtered],
  );

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between">
        <SidebarGroupLabel>迭代（{loadingIterations ? '…' : iterations.length}）</SidebarGroupLabel>
        <SidebarGroupAction title="新增迭代（占位）" aria-label="新增迭代">
          <PlusIcon />
        </SidebarGroupAction>
      </div>
      <SidebarMenu>
        {iterations.map((iteration) => {
          const isActive = iterationKey === iteration.name;
          return (
            <SidebarMenuItem key={iteration.id || iteration.name}>
              <SidebarMenuButton
                isActive={isActive}
                onClick={() => setIteration(iteration.name)}
              >
                <CalendarDaysIcon />
                <span>{iteration.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{iteration.state}</span>
                <ChevronRightIcon
                  className={isActive && expanded ? 'rotate-90' : ''}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((v) => !v);
                  }}
                />
              </SidebarMenuButton>
              {isActive && expanded && (
                <SidebarMenuSub>
                  {/* 筛选控件：处理人 / 关联人 / 状态（同时作用于主区工作项网格） */}
                  <SidebarMenuSubItem>
                    <div className="flex flex-col gap-1.5 py-1">
                      <div className="flex items-center gap-1">
                        <ListFilterIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">筛选</span>
                        {activeFilterCount > 0 && (
                          <>
                            <Badge variant="outline" className="px-1.5 text-[10px]">
                              命中 {filtered.length}
                            </Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              className="ml-auto h-auto gap-0.5 px-1 py-0.5 text-[10px] font-normal text-muted-foreground hover:text-foreground"
                              onClick={clearFilters}
                            >
                              <XIcon />
                              清除
                            </Button>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <FilterMenu label="处理人" icon={<UserIcon className="size-3" />} kind="assignees" options={options.assignees} />
                        <FilterMenu label="关联人" icon={<UsersIcon className="size-3" />} kind="related" options={options.related} />
                        <FilterMenu label="状态" icon={<CircleDotIcon className="size-3" />} kind="statuses" options={options.statuses} />
                      </div>
                    </div>
                  </SidebarMenuSubItem>
                  {requirementEntries.map((requirement) => (
                    <SidebarMenuSubItem key={requirement.id}>
                      <SidebarMenuSubButton
                        isActive={selectedId === requirement.workitemId}
                        onClick={() => {
                          void select(requirement.workitemId);
                          openRequirement();
                        }}
                      >
                        <RequirementTitle title={requirement.title} />
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                  {!requirementEntries.length && (
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton>
                        <span className="text-xs text-muted-foreground">
                          {loadingList
                            ? '加载工作项…'
                            : activeFilterCount
                              ? '无匹配工作项（清除筛选试试）'
                              : '当前迭代暂无已加载工作项（向下滚动列表可继续拉取）'}
                        </span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
