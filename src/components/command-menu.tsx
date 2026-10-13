import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import {
  CalendarDaysIcon,
  LayoutDashboardIcon,
  LockIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { iterationsOrFallback, useUi } from '@/store/ui';
import { StatusIcon } from './status-icon';

/**
 * ⌘K 命令面板（Linear 式全局入口）：
 * 四组固定顺序的条目 —— 导航 → 迭代 → 工作项 → 操作；
 * 搜索匹配 label + keywords + hint，↑↓ 循环选择、↵ 执行、esc 关闭。
 * 受控于 useUi.commandOpen，由 Shell 的 ⌘K 快捷键与侧栏入口开合。
 */

/** 面板条目模型（group 决定分组与渲染顺序；run 前统一先收面板） */
interface CommandEntry {
  id: string;
  group: '导航' | '迭代' | '工作项' | '操作';
  label: string;
  hint?: string;
  icon: React.ReactNode;
  keywords?: string;
  /** 当前即此目标时给常驻弱高亮（如已在该视图） */
  active?: boolean;
  run: () => void;
}

/** 组顺序固定（Linear 信息架构），构建条目时按此顺序展开 */
const GROUP_ORDER = ['导航', '迭代', '工作项', '操作'] as const;
type CommandGroup = (typeof GROUP_ORDER)[number];

/** 工作项条目上限：有搜索词取 15 条，空态预览前 8 条 */
const WORKITEM_LIMIT_WITH_QUERY = 15;
const WORKITEM_LIMIT_IDLE = 8;

/** 底部键位提示的小胶囊（与侧栏 ⌘K 徽标同一形态） */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background px-1 font-mono text-[11px] leading-4 text-muted-foreground">
      {children}
    </kbd>
  );
}

export function CommandMenu() {
  const open = useUi((s) => s.commandOpen);
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  const { view, setView, openSettings, setIteration, openWorkitem } = useUi();
  const items = useApp((s) => s.items);
  const realIterations = useApp((s) => s.iterations);
  const loadList = useApp((s) => s.loadList);
  const loadIterations = useApp((s) => s.loadIterations);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const q = query.trim().toLowerCase();

  // 条目按组顺序扁平展开；导航/迭代/操作走 label+keywords+hint 匹配，
  // 工作项组独立按 identifier+subject 匹配并截断（空态预览 8 条，有词取 15 条）
  const entries = useMemo<CommandEntry[]>(() => {
    const hit = (entry: { label: string; keywords?: string; hint?: string }) =>
      [entry.label, entry.keywords, entry.hint].some((text) => text?.toLowerCase().includes(q));

    const nav: CommandEntry[] = [
      {
        id: 'nav-iteration',
        group: '导航',
        label: '当前迭代',
        icon: <CalendarDaysIcon className="size-4" />,
        keywords: '迭代 iteration sprint',
        active: view === 'iteration' || view === 'requirement',
        run: () => setView('iteration'),
      },
      {
        id: 'nav-overview',
        group: '导航',
        label: '总览',
        icon: <LayoutDashboardIcon className="size-4" />,
        keywords: '总览 overview dashboard',
        active: view === 'overview',
        run: () => setView('overview'),
      },
      {
        id: 'nav-settings',
        group: '导航',
        label: '打开设置',
        icon: <SettingsIcon className="size-4" />,
        keywords: '设置 settings 配置',
        active: view === 'full-settings',
        run: () => openSettings('connection'),
      },
    ];

    const iterationEntries: CommandEntry[] = iterationsOrFallback(realIterations).map((it) => ({
      id: `iteration-${it.id || it.name}`,
      group: '迭代',
      label: it.name,
      hint: it.state,
      icon: <StatusIcon status={it.state} className="size-4" />,
      keywords: it.title,
      run: () => setIteration(it.name),
    }));

    const workitemPool = q
      ? items.filter((it) => `${it.identifier} ${it.subject}`.toLowerCase().includes(q))
      : items;
    const workitemEntries: CommandEntry[] = workitemPool
      .slice(0, q ? WORKITEM_LIMIT_WITH_QUERY : WORKITEM_LIMIT_IDLE)
      .map((it) => ({
        id: `workitem-${it.workitemId}`,
        group: '工作项',
        label: it.subject,
        hint: it.identifier,
        icon: <StatusIcon status={it.status} className="size-4" />,
        run: () =>
          openWorkitem(it.workitemId, {
            workitemId: it.workitemId,
            identifier: it.identifier,
            subject: it.subject,
          }),
      }));

    const actions: CommandEntry[] = [
      {
        id: 'action-refresh',
        group: '操作',
        label: '刷新迭代与工作项',
        icon: <RefreshCwIcon className="size-4" />,
        keywords: '刷新 refresh reload 重新加载',
        run: () => {
          void loadList(false);
          void loadIterations();
        },
      },
      {
        id: 'action-security',
        group: '操作',
        label: '安全与写操作设置',
        icon: <LockIcon className="size-4" />,
        keywords: '安全 security 只读 写操作 只读模式',
        run: () => openSettings('security'),
      },
    ];

    return [
      ...nav.filter(hit),
      ...iterationEntries.filter(hit),
      ...workitemEntries,
      ...actions.filter(hit),
    ];
  }, [q, view, realIterations, items, setView, openSettings, setIteration, openWorkitem, loadList, loadIterations]);

  // 非空组（保持 GROUP_ORDER 顺序）+ 扁平序（键盘 active 索引按扁平序计）
  const groups = useMemo<{ group: CommandGroup; entries: CommandEntry[] }[]>(
    () =>
      GROUP_ORDER.map((group) => ({ group, entries: entries.filter((e) => e.group === group) })).filter(
        (g) => g.entries.length,
      ),
    [entries],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.entries), [groups]);
  const flatIndexOf = useMemo(() => new Map(flat.map((e, i) => [e, i] as const)), [flat]);

  // 查询变化 / 重新打开时回到第一条；列表收窄时收敛到末条防越界
  useEffect(() => {
    setActive(0);
  }, [q, open]);
  const activeIndex = flat.length ? Math.min(active, flat.length - 1) : 0;

  // active 项滚动进可视区（只滚结果列表自身，不影响外层布局）
  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runEntry = (entry: CommandEntry | undefined) => {
    if (!entry) return;
    // 先收面板再执行（跳转 / 刷新等动作都发生在面板已关闭的状态下）
    setCommandOpen(false);
    entry.run();
  };

  // 关闭即清空搜索词，下次打开是干净的全量列表（Linear 行为）
  const handleOpenChange = (next: boolean) => {
    setCommandOpen(next);
    if (!next) setQuery('');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length) setActive((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runEntry(flat[activeIndex]);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        {/* 遮罩：与 ui/dialog.tsx 的 DialogOverlay 同款（浅黑 + 轻模糊） */}
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/20 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        {/* 顶部 12vh 悬浮面板（Linear 形态：非居中卡片，不用 DialogContent） */}
        <DialogPrimitive.Popup
          className="fixed left-1/2 top-[12vh] z-50 w-full max-w-[640px] -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-level-2 ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
        >
          {/* 无障碍必需：sr-only 标题 */}
          <DialogPrimitive.Title className="sr-only">命令面板</DialogPrimitive.Title>

          {/* 搜索行 */}
          <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="搜索工作项、迭代，或跳转…"
              autoFocus
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* 结果列表（组间只渲染非空组） */}
          <div className="max-h-[min(26rem,50vh)] overflow-y-auto py-2">
            {flat.length ? (
              groups.map(({ group, entries: groupEntries }) => (
                <div key={group}>
                  <p className="px-4 pb-1 pt-2.5 text-xs font-medium text-muted-foreground">{group}</p>
                  {groupEntries.map((entry) => {
                    const index = flatIndexOf.get(entry) ?? 0;
                    const isActiveRow = index === activeIndex;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        ref={(el) => {
                          rowRefs.current[index] = el;
                        }}
                        data-active={isActiveRow || undefined}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => runEntry(entry)}
                        className={cn(
                          'mx-2 flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm',
                          // 常驻弱高亮：当前即此目标；键盘/hover 命中时以 bg-accent 覆盖
                          entry.active && !isActiveRow && 'bg-accent/50',
                          isActiveRow && 'bg-accent',
                        )}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                          {entry.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-left">{entry.label}</span>
                        {entry.hint && (
                          <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                            {entry.hint}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">无匹配结果</p>
            )}
          </div>

          {/* 底部键位提示条 */}
          <div className="flex shrink-0 items-center gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              选择
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              打开
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd>
              关闭
            </span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
