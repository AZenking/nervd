import { useEffect, useState } from 'react';
import { ClockIcon, ExternalLinkIcon, Trash2Icon } from 'lucide-react';
import { Table } from '@heroui/react';
import { useRecentWorkitems, type RecentWorkitem } from '@/store/recent-workitems';
import { useUi } from '@/store/ui';
import { useApp } from '@/store/app';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusIcon } from '@/components/status-icon';
import { EmptyHint } from '@/components/empty-hint';
import { WorkitemPeekDrawer } from '@/components/workitem-peek-drawer';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { PageHeader } from '@/components/page-header';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, type Category } from '@/types';
import { hasWorkspaceOverlay, isEditing } from '@/lib/workspace-actions';
import { OverflowTooltip } from '@/components/overflow-tooltip';

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
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || hasWorkspaceOverlay()) return;
      if (!items.length) return;
      const target = e.target as HTMLElement | null;
      if (isEditing(target) || target?.closest('button, a, [role="button"]')) {
        return;
      }
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveCursor((prev) => {
          const next = Math.min(items.length - 1, prev + 1);
          document
            .querySelector(`[data-key="${items[next]?.workitemId}"]`)
            ?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveCursor((prev) => {
          const next = Math.max(0, prev - 1);
          document
            .querySelector(`[data-key="${items[next]?.workitemId}"]`)
            ?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter') {
        const item = items[activeCursor];
        if (item) {
          // 光标行若已被 Table 聚焦，Enter 的行动作由 RAC 触发，避免双重打开
          if (target?.closest('[role="row"]')) return;
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
      <PageHeader
        sticky
        navigation={<SidebarTrigger aria-label="折叠/展开侧栏" />}
        title="最近查看"
        titleClassName="text-sm font-semibold tracking-tight text-foreground"
        titleBadge={
          items.length > 0 ? (
            <Chip size="sm" variant="soft" className="font-mono text-[11px] tabular-nums select-none">
              {items.length} 项
            </Chip>
          ) : undefined
        }
        description={items.length > 0 ? '仅记录持续深入查看超过 30 秒的需求项' : undefined}
        actions={
          items.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearRecents}
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2Icon className="size-3.5 mr-1" />
              清空记录
            </Button>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyHint
          icon={ClockIcon}
          title="暂无最近查看记录"
          description="当您在某个需求详情中持续检视停留超过 30 秒，系统将自动收录于此，方便随时快速回访。"
          className="rounded-xl border border-dashed py-16"
        />
      ) : (
        <Table variant="secondary">
          <Table.ScrollContainer>
            <Table.Content aria-label="最近查看列表">
              <Table.Header>
                <Table.Column isRowHeader>需求</Table.Column>
                <Table.Column>类别</Table.Column>
                <Table.Column>所属空间</Table.Column>
                <Table.Column className="text-end">查看时间</Table.Column>
                <Table.Column>操作</Table.Column>
              </Table.Header>

              <Table.Body>
                {items.map((item, idx) => {
                  const isCursorActive = activeCursor === idx;
                  return (
                    <Table.Row
                      key={item.workitemId}
                      id={item.workitemId}
                      onAction={() => handleOpenWorkitem(item)}
                      className={cn('group', isCursorActive && 'bg-muted-bg')}
                    >
                      <Table.Cell>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <StatusIcon status={item.status} className="size-3.5 shrink-0" />
                          <span className="shrink-0 font-mono font-bold tracking-tight text-primary">
                            {item.identifier}
                          </span>
                          <OverflowTooltip
                            text={item.subject}
                            className="min-w-0 font-medium text-foreground"
                          />
                        </div>
                      </Table.Cell>

                      <Table.Cell>
                        <span className="flex items-center gap-1.5">
                          {item.category && (
                            <Chip size="sm" variant="soft">
                              {CATEGORY_LABELS[item.category as Category] || item.category}
                            </Chip>
                          )}
                          <Chip size="sm" variant="soft" color="warning" className="font-mono">
                            <ClockIcon className="size-2.5" />
                            30s+
                          </Chip>
                        </span>
                      </Table.Cell>

                      <Table.Cell>
                        {item.spaceName ? (
                          <OverflowTooltip
                            text={item.spaceName}
                            className="max-w-28 text-muted-foreground"
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Table.Cell>

                      <Table.Cell className="text-end">
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {formatRelativeTime(item.viewedAt)}
                        </span>
                      </Table.Cell>

                      <Table.Cell>
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  title="从最近列表中移除"
                                  aria-label="从最近列表中移除"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeRecent(item.workitemId);
                                  }}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2Icon className="size-3" />
                                </Button>
                              }
                            />
                            <TooltipContent>从最近列表中移除</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  title="在工作台中全屏打开"
                                  aria-label="在工作台中全屏打开"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenWorkbench(item.workitemId, item.identifier, item.subject);
                                  }}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <ExternalLinkIcon className="size-3" />
                                </Button>
                              }
                            />
                            <TooltipContent>在工作台中全屏打开</TooltipContent>
                          </Tooltip>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
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
