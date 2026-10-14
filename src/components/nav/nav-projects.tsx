import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { NavCollapsibleGroup } from './nav-group';
import { cn } from '@/lib/utils';
import { StatusIcon } from '../status-icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronRightIcon, PlusIcon,
} from 'lucide-react';
import { useApp } from '@/store/app';
import {
  useUi, iterationsOrFallback, scopedItems, buildWorkitemFilterOptions, applyWorkitemFilters,
  type WorkitemFilters,
} from '@/store/ui';

/** 侧栏需求子列表最多直列的条数（UX A7：超出给入口而非静默截断） */
const SIDEBAR_LIST_LIMIT = 12;

/** 迭代名：truncate + 仅在溢出时显示全名 Tooltip（与 RequirementTitle 同一策略） */
function IterationName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowed, setOverflowed] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            ref={ref}
            className="min-w-0 flex-1 truncate"
            onMouseEnter={() => {
              const el = ref.current;
              if (el) setOverflowed(el.scrollWidth > el.clientWidth);
            }}
          />
        }
      >
        {name}
      </TooltipTrigger>
      {overflowed && (
        <TooltipContent side="right" className="max-w-72 break-words">
          {name}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

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

/**
 * 迭代分组（UX A6：每个迭代独立展开，chevron 仅负责展开/收起，点行主体切换迭代）：
 * 云效 sprints OpenAPI 的真实迭代列表（不可用时回退占位壳）。
 * 筛选控件已迁至迭代视图工具行（WorkitemFilterBar），共享同一份选中状态。
 */
export function NavProjects() {
  const { iterationKey, setIteration, filters, openWorkitem } = useUi();
  const {
    items, selectedId, loadingList,
    iterations: realIterations, loadingIterations,
  } = useApp();

  const iterations = iterationsOrFallback(realIterations);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set([useUi.getState().iterationKey]),
  );

  // 真实迭代列表到达后校正选中迭代时，同步默认展开
  useEffect(() => {
    const key = useUi.getState().iterationKey;
    setExpandedIds((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
  }, [realIterations]);

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

  const toggleExpanded = (key: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <NavCollapsibleGroup
      className="group-data-[collapsible=icon]:hidden px-0"
      label={<>迭代（{loadingIterations ? '…' : iterations.length}）</>}
      labelClassName="px-2"
      action={
        /* UX A9：未接入的能力显式禁用并说明去处，不做"点了没反应"的假按钮；hover 分组头时显示 */
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" className="size-5 rounded-md text-sidebar-foreground/60" disabled aria-label="新增迭代（暂未接入）" />}
          >
            <PlusIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>端内新增迭代暂未接入，请在云效网页端操作</TooltipContent>
        </Tooltip>
      }
    >
      <SidebarMenu>
        {iterations.map((iteration) => {
          const isActive = iterationKey === iteration.name;
          const expanded = expandedIds.has(iteration.name);
          const iterationScoped = isActive
            ? filtered
            : applyWorkitemFilters(scopedItems(items, iteration.name, realIterations), filters);
          const hiddenCount = Math.max(0, iterationScoped.length - SIDEBAR_LIST_LIMIT);
          const requirementEntries = iterationScoped
            .slice(0, SIDEBAR_LIST_LIMIT)
            .map((it) => ({ id: it.identifier, title: it.subject, workitemId: it.workitemId }));

          return (
            <SidebarMenuItem key={iteration.id || iteration.name}>
              <SidebarMenuButton
                isActive={isActive}
                aria-expanded={expanded}
                className="group/menu-button"
                onClick={() => {
                  if (isActive && useUi.getState().view === 'iteration') {
                    // 已在迭代视图时点击当前迭代行 = 收起/展开子列表
                    toggleExpanded(iteration.name);
                  } else {
                    // 切换迭代并确保展开
                    setIteration(iteration.name);
                    setExpandedIds((prev) => (prev.has(iteration.name)
                      ? prev
                      : new Set([...prev, iteration.name])));
                  }
                }}
              >
                {/* Linear 式状态图形：迭代状态（未开始/进行中/已完成）直接外化为图标 */}
                <StatusIcon status={iteration.state} />
                <IterationName name={iteration.name} />
                {/* UX A6：chevron 为装饰态（键盘经行按钮操作展开）；hover-reveal——展开态常驻指示方向 */}
                <ChevronRightIcon
                  aria-hidden="true"
                  className={cn(
                    'shrink-0 transition-[opacity,transform] duration-200',
                    expanded
                      ? 'rotate-90'
                      : 'opacity-0 group-hover/menu-button:opacity-100',
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(iteration.name);
                  }}
                />
              </SidebarMenuButton>
              {expanded && (
                <SidebarMenuSub>
                  {requirementEntries.map((requirement) => (
                    <SidebarMenuSubItem key={requirement.id}>
                      <SidebarMenuSubButton
                        isActive={selectedId === requirement.workitemId}
                        onClick={() => {
                          openWorkitem(requirement.workitemId, {
                            workitemId: requirement.workitemId,
                            identifier: requirement.id,
                            subject: requirement.title,
                          });
                        }}
                      >
                        <RequirementTitle title={requirement.title} />
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                  {/* UX A7：超出直列上限时给出剩余数量与完整列表入口 */}
                  {hiddenCount > 0 && (
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        onClick={() => setIteration(iteration.name)}
                      >
                        <span className="text-xs text-muted-foreground">
                          还有 {hiddenCount} 条 · 在迭代视图查看全部
                        </span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )}
                  {!requirementEntries.length && (
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton>
                        <span className="text-xs text-muted-foreground">
                          {loadingList
                            ? '加载工作项…'
                            : activeFilterCount && isActive
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
    </NavCollapsibleGroup>
  );
}
