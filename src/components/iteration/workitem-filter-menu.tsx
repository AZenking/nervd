import { useMemo } from 'react';
import { ListFilterIcon, XIcon } from 'lucide-react';
import { Dropdown, Label } from '@heroui/react';
import { Chip } from '@/components/ui/chip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUi, type WorkitemFilters } from '@/store/ui';
import { useApp } from '@/store/app';

/**
 * 工作项筛选菜单（Linear 视图工具行形态）：
 * 处理人 / 关联人 / 状态三个多选下拉，选项来自当前迭代已加载工作项（含计数）。
 * 全部采用 HeroUI 原生 Dropdown 原语（selectionMode="multiple" + ItemIndicator），
 * 筛选状态仍存于 ui store，与侧栏需求子列表共享同一份。
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

  const selectedKeySet = useMemo(() => new Set<string>(selected), [selected]);

  return (
    <Dropdown>
      {/* HeroUI Trigger 直接承载样式（单 button，按压可靠）；选中态切换语义色 */}
      <Dropdown.Trigger
        className={cn(
          'inline-flex h-7 min-w-0 cursor-pointer select-none items-center gap-1 rounded-sm px-2 text-xs font-medium transition-colors outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring/60',
          selected.length
            ? 'bg-primary/10 text-primary hover:bg-primary/15'
            : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground',
        )}
      >
        <span className="max-w-24 truncate">{label}</span>
        {selected.length > 0 && (
          <Chip size="sm" variant="secondary" className="h-4 shrink-0 gap-0 bg-primary/15 px-1 font-mono text-[10px] text-primary">
            {selected.length}
          </Chip>
        )}
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end" className="max-h-72 min-w-52">
        <ScrollArea size={24} className="max-h-[inherit]">
        {sortedOptions.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground select-none">
            暂无可筛选项
          </p>
        ) : (
          <Dropdown.Menu
            aria-label={label + '筛选'}
            selectionMode="multiple"
            selectedKeys={selectedKeySet}
            onSelectionChange={(keys) => {
              if (keys === 'all') return;
              const keySet = new Set([...keys].map(String));
              // 与 ui store 同步差量：新增勾选 / 取消勾选
              for (const [value] of options) {
                if (selected.includes(value) !== keySet.has(value)) {
                  toggleFilter(kind, value);
                }
              }
            }}
          >
            {sortedOptions.map(([value, count]) => {
              const isMe = Boolean(myName && (kind === 'assignees' || kind === 'related') && value === myName);
              return (
                <Dropdown.Item
                  key={value}
                  id={value}
                  textValue={value}
                  className="flex cursor-pointer items-center justify-between gap-2"
                >
                  <Dropdown.ItemIndicator />
                  <Label>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{value}</span>
                      {isMe && (
                        <span className="rounded bg-primary/15 px-1 py-0.5 text-[10px] font-medium leading-none text-primary">
                          我
                        </span>
                      )}
                    </span>
                  </Label>
                  <span className="shrink-0 pl-2 text-xs tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </Dropdown.Item>
              );
            })}
          </Dropdown.Menu>
        )}
        </ScrollArea>
      </Dropdown.Popover>
    </Dropdown>
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
