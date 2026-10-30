import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import {
  ClockIcon,
  PlayIcon,
  SearchIcon,
  TerminalIcon,
  WorkflowIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import {
  extractConfiguredBuildTargets,
  useQuickBuild,
  type QuickBuildTarget,
} from '@/store/quick-build';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background px-1 font-mono text-[11px] leading-4 text-muted-foreground">
      {children}
    </kbd>
  );
}

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return '';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}天前`;
}

export function QuickBuildDialog() {
  const open = useUi((s) => s.quickBuildOpen);
  const setOpen = useUi((s) => s.setQuickBuildOpen);
  const settings = useApp((s) => s.settings);
  const repositories = useApp((s) => s.repositories);
  const history = useQuickBuild((s) => s.history);
  const triggeringId = useQuickBuild((s) => s.triggeringId);
  const triggerQuickBuild = useQuickBuild((s) => s.triggerQuickBuild);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 1. 获取所有已配置的流水线目标
  const configuredTargets = useMemo(
    () => extractConfiguredBuildTargets(settings, repositories),
    [settings, repositories],
  );

  // 2. 扁平化条目列表（用于键盘光标选择）
  const q = query.trim().toLowerCase();

  const { recentList, allList, flatEntries } = useMemo(() => {
    // 过滤最近历史
    const filteredRecent = history.filter((target) => {
      if (!q) return true;
      return (
        target.repoName.toLowerCase().includes(q) ||
        target.pipelineName.toLowerCase().includes(q) ||
        (target.connectionName && target.connectionName.toLowerCase().includes(q))
      );
    });

    // 过滤所有已配置
    const filteredAll = configuredTargets.filter((target) => {
      // 避免与 recent 完全重复
      if (!q && history.some((h) => h.id === target.id)) return false;
      if (!q) return true;
      return (
        target.repoName.toLowerCase().includes(q) ||
        target.pipelineName.toLowerCase().includes(q) ||
        (target.connectionName && target.connectionName.toLowerCase().includes(q))
      );
    });

    const flat: QuickBuildTarget[] = [...filteredRecent, ...filteredAll];
    return {
      recentList: filteredRecent,
      allList: filteredAll,
      flatEntries: flat,
    };
  }, [history, configuredTargets, q]);

  // 打开时重置光标与输入框
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 16);
    }
  }, [open]);

  // 越界保护
  useEffect(() => {
    if (selectedIndex >= flatEntries.length) {
      setSelectedIndex(Math.max(0, flatEntries.length - 1));
    }
  }, [flatEntries.length, selectedIndex]);

  // 触发构建动作
  const handleTrigger = async (target: QuickBuildTarget) => {
    const success = await triggerQuickBuild(target);
    if (success) {
      setOpen(false);
    }
  };

  // 键盘操作
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (flatEntries.length ? (prev + 1) % flatEntries.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        flatEntries.length ? (prev - 1 + flatEntries.length) % flatEntries.length : 0,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = flatEntries[selectedIndex];
      if (current) {
        void handleTrigger(current);
      }
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/20 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className="fixed left-1/2 top-[12vh] z-50 w-full max-w-[640px] -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-level-2 ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
        >
          <DialogPrimitive.Title className="sr-only">快速构建</DialogPrimitive.Title>

          {/* 顶栏：搜索输入与快捷键提示 */}
          <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="快速构建：搜索仓库名、流水线名，回车一键触发…"
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground"
            />
            <div className="flex items-center gap-1.5 shrink-0 pl-2">
              <Kbd>↵ 运行</Kbd>
              <Kbd>esc</Kbd>
            </div>
          </div>

          {/* 内容区 */}
          <div className="max-h-[min(26rem,50vh)] overflow-y-auto py-2">
            {flatEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground">
                {q ? (
                  <span>未匹配到相关仓库或流水线</span>
                ) : (
                  <span>尚未配置任何流水线绑定，请在代码仓库或设置中关联 Flow / Jenkins</span>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* 分组 1：最近触发 */}
                {recentList.length > 0 && (
                  <div>
                    <p className="px-4 pb-1 pt-1 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <ClockIcon className="size-3" />
                      <span>最近触发 (Recent Builds)</span>
                    </p>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {recentList.map((target) => {
                        const idx = flatEntries.indexOf(target);
                        const isSelected = idx === selectedIndex;
                        const isTriggering = triggeringId === target.id;

                        return (
                          <button
                            key={target.id}
                            ref={(el) => {
                              itemRefs.current[idx] = el;
                            }}
                            type="button"
                            onClick={() => void handleTrigger(target)}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            disabled={isTriggering}
                            className={cn(
                              'mx-2 flex min-h-9 cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors',
                              isSelected
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-muted/60 text-foreground',
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {target.type === 'flow' ? (
                                <WorkflowIcon className="size-3.5 text-primary shrink-0" />
                              ) : (
                                <TerminalIcon className="size-3.5 text-amber-500 shrink-0" />
                              )}
                              <div className="flex flex-col min-w-0 text-left">
                                <div className="flex items-center gap-2 font-medium truncate">
                                  <span>{target.repoName}</span>
                                  <span className="text-[11px] text-muted-foreground font-normal">
                                    {target.pipelineName}
                                  </span>
                                </div>
                                {target.parameters && Object.keys(target.parameters).length > 0 && (
                                  <div className="text-[10px] text-muted-foreground/80 font-mono truncate mt-0.5">
                                    {Object.entries(target.parameters)
                                      .map(([k, v]) => `${k}=${v}`)
                                      .join(' ')}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground ml-2">
                              {target.lastTriggeredAt && (
                                <span>{formatRelativeTime(target.lastTriggeredAt)}</span>
                              )}
                              <div
                                className={cn(
                                  'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-opacity',
                                  isSelected ? 'bg-primary text-primary-foreground' : 'opacity-0',
                                )}
                              >
                                <PlayIcon className="size-2.5 fill-current" />
                                <span>触发</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 分组 2：所有已绑定流水线 */}
                {allList.length > 0 && (
                  <div>
                    <p className="px-4 pb-1 pt-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <WorkflowIcon className="size-3" />
                      <span>所有已配置流水线</span>
                    </p>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {allList.map((target) => {
                        const idx = flatEntries.indexOf(target);
                        const isSelected = idx === selectedIndex;
                        const isTriggering = triggeringId === target.id;

                        return (
                          <button
                            key={target.id}
                            ref={(el) => {
                              itemRefs.current[idx] = el;
                            }}
                            type="button"
                            onClick={() => void handleTrigger(target)}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            disabled={isTriggering}
                            className={cn(
                              'mx-2 flex min-h-9 cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors',
                              isSelected
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-muted/60 text-foreground',
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {target.type === 'flow' ? (
                                <WorkflowIcon className="size-3.5 text-primary shrink-0" />
                              ) : (
                                <TerminalIcon className="size-3.5 text-amber-500 shrink-0" />
                              )}
                              <div className="flex flex-col min-w-0 text-left">
                                <div className="flex items-center gap-2 font-medium truncate">
                                  <span>{target.repoName}</span>
                                  <span className="text-[11px] text-muted-foreground font-normal">
                                    {target.pipelineName}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div
                              className={cn(
                                'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-opacity ml-2',
                                isSelected ? 'bg-primary text-primary-foreground' : 'opacity-0',
                              )}
                            >
                              <PlayIcon className="size-2.5 fill-current" />
                              <span>触发</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 底部紧凑快捷说明栏 */}
          <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                选择
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd>
                触发运行
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1">
                <Kbd>esc</Kbd>
                关闭
              </span>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground/80">⌘B 随时呼出</span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
