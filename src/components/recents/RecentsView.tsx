import { useEffect, useState } from 'react';
import { ClockIcon, ExternalLinkIcon, Trash2Icon } from 'lucide-react';
import { useRecentWorkitems, type RecentWorkitem } from '@/store/recent-workitems';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';
import { Button } from '@/components/ui/button';
import { StatusIcon } from '@/components/status-icon';
import { EmptyHint } from '@/components/empty-hint';
import { WorkitemPeekDrawer } from '@/components/workitem-peek-drawer';
import { STICKY_PAGE_HEADER_CLASS } from '@/components/page-header';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, type Category } from '@/types';

export function RecentsView() {
  const items = useRecentWorkitems((s) => s.items);
  const removeRecent = useRecentWorkitems((s) => s.remove);
  const clearRecents = useRecentWorkitems((s) => s.clear);
  const { openWorkitem } = useUi();
  const selectWorkitem = useApp((s) => s.select);

  const [activeCursor, setActiveCursor] = useState(0);
  const [peekId, setPeekId] = useState<string | null>(null);

  useEffect(() => {
    if (activeCursor >= items.length) {
      setActiveCursor(Math.max(0, items.length - 1));
    }
  }, [items.length, activeCursor]);

  const handleOpenWorkitem = (item: RecentWorkitem) => {
    setPeekId(item.workitemId);
    void selectWorkitem(item.workitemId);
  };

  const handleOpenWorkbench = (id: string, identifier?: string, subject?: string) => {
    setPeekId(null);
    openWorkitem(id, { workitemId: id, identifier: identifier || '', subject: subject || '' });
  };

  // 键盘 j / k 移动光标，Enter 打开详情抽屉
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!items.length) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveCursor((prev) => {
          const next = Math.min(items.length - 1, prev + 1);
          document.getElementById(`recent-row-${next}`)?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveCursor((prev) => {
          const next = Math.max(0, prev - 1);
          document.getElementById(`recent-row-${next}`)?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter') {
        const item = items[activeCursor];
        if (item) {
          e.preventDefault();
          handleOpenWorkitem(item);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, activeCursor]);

  return (
    <div className="flex flex-col gap-6">
      <header
        data-tauri-drag-region
        className={cn(STICKY_PAGE_HEADER_CLASS, 'select-none')}
      >
        <div className="flex min-h-9 items-center justify-between gap-3" data-tauri-drag-region>
          <div className="flex items-center gap-2.5" data-tauri-drag-region>
            <h1 className="text-sm font-semibold tracking-tight text-foreground select-none cursor-default">
              最近查看
            </h1>
            {items.length > 0 && (
              <span className="rounded-md border border-border/80 bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground select-none cursor-default">
                {items.length} 项
              </span>
            )}
            <span className="text-xs text-muted-foreground hidden sm:inline select-none cursor-default">
              · 仅记录持续深入查看超过 30 秒的需求项
            </span>
          </div>

          {items.length > 0 && (
            <div className="flex items-center gap-2" data-no-drag>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearRecents}
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="size-3.5 mr-1" />
                清空记录
              </Button>
            </div>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyHint
          icon={ClockIcon}
          title="暂无最近查看记录"
          description="当您在某个需求详情中持续检视停留超过 30 秒，系统将自动收录于此，方便随时快速回访。"
          className="rounded-xl border border-dashed py-16"
        />
      ) : (
        <div className="rounded-xl border border-border/70 bg-card/40 overflow-hidden divide-y divide-border/40">
          {items.map((item, idx) => {
            const isCursorActive = activeCursor === idx;
            return (
              <div
                key={item.workitemId}
                id={`recent-row-${idx}`}
                onClick={() => handleOpenWorkitem(item)}
                className={cn(
                  'group flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer transition-colors select-none text-xs',
                  isCursorActive ? 'bg-accent/60 text-accent-foreground' : 'hover:bg-muted/40',
                )}
              >
                {/* 左侧：状态图标 + 等宽编号 + 标题 */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <StatusIcon status={item.status} className="size-3.5 shrink-0" />
                  <span className="font-mono font-bold tracking-tight text-primary shrink-0">
                    {item.identifier}
                  </span>
                  <span className="truncate font-medium text-foreground group-hover:text-primary transition-colors">
                    {item.subject}
                  </span>
                </div>

                {/* 右侧：类别徽标 + 30s+ 标记 + 访问时间 + 操作 */}
                <div className="flex items-center gap-3 shrink-0">
                  {item.category && (
                    <span className="rounded bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {CATEGORY_LABELS[item.category as Category] || item.category}
                    </span>
                  )}
                  {item.spaceName && (
                    <span className="text-[11px] text-muted-foreground max-w-28 truncate hidden md:inline">
                      {item.spaceName}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-mono text-amber-600 dark:text-amber-400">
                    <ClockIcon className="size-2.5" />
                    30s+
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono w-20 text-right">
                    {formatRelativeTime(item.viewedAt)}
                  </span>
                  <button
                    type="button"
                    title="从最近列表中移除"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecent(item.workitemId);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive rounded transition-opacity"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                  <button
                    type="button"
                    title="在工作台中全屏打开"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenWorkbench(item.workitemId, item.identifier, item.subject);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground rounded transition-opacity"
                  >
                    <ExternalLinkIcon className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 点击条目打开的 Peek 抽屉 */}
      <WorkitemPeekDrawer
        workitemId={peekId}
        onClose={() => setPeekId(null)}
        onOpenWorkbench={handleOpenWorkbench}
      />
    </div>
  );
}
