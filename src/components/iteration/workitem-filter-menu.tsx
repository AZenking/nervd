import { useMemo } from 'react';
import { ListFilterIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUi, type WorkitemFilters } from '@/store/ui';
import { useApp } from '@/store/app';

/**
 * 工作项筛选菜单（Linear 视图工具行形态）：
 * 处理人 / 关联人 / 状态三个多选下拉，选项来自当前迭代已加载工作项（含计数）。
 * 原侧栏筛选块迁入视图工具行；筛选状态仍存于 ui store，与侧栏需求子列表共享同一份。
 */
function FilterMenu({ label, kind, options }: {
  label: string;
  kind: keyof WorkitemFilters;
  options: [string, number][];
}) {
  const selected = useUi((s) => s.filters[kind]);
  const toggleFilter = useUi((s) => s.toggleFilter);
  const currentUser = useApp((s) => s.currentUser);
  const customName = useApp((s) => s.workitemHighlight.customName?.trim());

  const myName = customName || currentUser?.name;

  const sortedOptions = useMemo(() => {
    if (!myName || (kind !== 'assignees' && kind !== 'related')) return options;
    return [...options].sort((a, b) => {
      if (a[0] === myName) return -1;
      if (b[0] === myName) return 1;
      return 0;
    });
  }, [options, myName, kind]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={selected.length ? 'secondary' : 'outline'} size="sm" className="min-w-0 gap-1 px-2" />}
      >
        <span className="max-w-24 truncate">{label}</span>
        {selected.length > 0 && (
          <Badge variant="secondary" className="shrink-0 rounded-sm px-1.5">{selected.length}</Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-52 overflow-y-auto">
        {sortedOptions.map(([value, count]) => {
          const isMe = Boolean(myName && (kind === 'assignees' || kind === 'related') && value === myName);
          return (
            <DropdownMenuCheckboxItem
              key={value}
              checked={selected.includes(value)}
              onCheckedChange={() => toggleFilter(kind, value)}
              closeOnClick={false}
            >
              <span className="min-w-0 flex-1 truncate flex items-center gap-1.5">
                <span>{value}</span>
                {isMe && (
                  <span className="rounded bg-primary/15 px-1 py-0.2 text-[10px] font-medium leading-none text-primary">
                    我
                  </span>
                )}
              </span>
              <span className="shrink-0 pl-2 text-xs tabular-nums text-muted-foreground">{count}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
        {!options.length && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">暂无可筛选项</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 视图工具行筛选组：筛选图标 + 三个多选菜单 + 清除（有命中时） */
export function WorkitemFilterBar({ options, activeFilterCount }: {
  options: {
    assignees: [string, number][];
    related: [string, number][];
    statuses: [string, number][];
  };
  activeFilterCount: number;
}) {
  const clearFilters = useUi((s) => s.clearFilters);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <ListFilterIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <FilterMenu label="处理人" kind="assignees" options={options.assignees} />
      <FilterMenu label="关联人" kind="related" options={options.related} />
      <FilterMenu label="状态" kind="statuses" options={options.statuses} />
      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <XIcon data-icon="inline-start" />
          清除（{activeFilterCount}）
        </Button>
      )}
    </div>
  );
}
