import { useMemo, useState } from 'react';
import { ExternalLinkIcon, FileTextIcon, SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Table } from '@/components/ui/table';
import type { WorkitemRow } from '@/lib/api';
import { StatusIcon } from '@/components/status-icon';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { EmptyHint } from '@/components/empty-hint';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { RefreshButton } from './refresh-button';

export interface WorkitemsDataTableProps {
  categoryLabel: string;
  items: WorkitemRow[];
  complete: boolean;
  loading?: boolean;
  selectedWorkitemId?: string | null;
  onOpenDetail: (item: WorkitemRow) => void;
  onOpenWorkbench?: (id: string, identifier: string, subject: string) => void;
  /** 空态下一步动作：重新拉取当前类别 */
  onRefresh?: () => void;
  className?: string;
}

export function WorkitemsDataTable({
  categoryLabel,
  items,
  complete,
  loading = false,
  selectedWorkitemId,
  onOpenDetail,
  onOpenWorkbench,
  onRefresh,
  className,
}: WorkitemsDataTableProps) {
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.identifier?.toLowerCase().includes(q) ||
        item.subject?.toLowerCase().includes(q) ||
        item.status?.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <Card.Header className="flex flex-col gap-2.5 border-b border-border/60 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Card.Title>
              工作项速览 · {categoryLabel}
            </Card.Title>
            <Chip size="sm" variant="soft" color="default" className="text-xs font-mono tabular-nums">
              {complete ? (
                <>最近更新 · 共 {items.length} 条</>
              ) : (
                <>最近更新 · 已加载 {items.length} 条</>
              )}
            </Chip>
          </div>

          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            {/* IME 冒泡守卫已由 ui/input 统一承担，这里不再手写 stopPropagation 补丁 */}
            <Input
              aria-label="搜索工作项"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索工作项编号或标题..."
              autoComplete="off"
              spellCheck={false}
              className="pl-8 pr-7"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon-xs"
                onPress={() => setSearch('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="清空搜索"
              >
                <XIcon className="size-3" />
              </Button>
            )}
          </div>
        </div>
        {/* 交互提示下沉至 Description 槽：数据完整时引导点击查看，分页未完时明确数据口径 */}
        <Card.Description>
          {complete
            ? '点击最近更新条目就地查看详情，亦可在抽屉中全屏打开工作台'
            : '仅展示当前已加载范围，不推断未加载数据'}
        </Card.Description>
      </Card.Header>

      <Card.Content className="p-0">
        {loading && items.length === 0 ? (
          <div className="flex flex-col gap-2 p-4" aria-label="正在加载最近更新">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 py-1">
                <Skeleton className="size-4 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-20 shrink-0" />
                <Skeleton className="h-4 flex-1 rounded" />
                <Skeleton className="h-4 w-16 shrink-0" />
                <Skeleton className="h-4 w-20 shrink-0" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyHint
            icon={SearchIcon}
            title={search ? '未找到匹配的工作项' : '暂无工作项'}
            description={
              search
                ? `没有与「${search.trim()}」匹配的编号、标题或状态，可清除搜索查看全部条目。`
                : '当前类别在所选迭代下还没有可展示的最近更新。'
            }
            action={
              search ? (
                <Button size="sm" variant="secondary" onPress={() => setSearch('')}>
                  清除搜索
                </Button>
              ) : onRefresh ? (
                <RefreshButton label="刷新" onPress={onRefresh} />
              ) : undefined
            }
            className="rounded-none border-0 bg-transparent py-10"
          />
        ) : (
          <Table variant="secondary" className="w-full">
            <Table.ScrollContainer className="max-h-96 overflow-y-auto overscroll-contain">
              <Table.Content aria-label="工作项列表">
                <Table.Header>
                  <Table.Column isRowHeader className="w-28">
                    工作项编号
                  </Table.Column>
                  <Table.Column className="min-w-64">工作项标题</Table.Column>
                  <Table.Column className="w-28">当前状态</Table.Column>
                  <Table.Column className="w-28">更新时间</Table.Column>
                  <Table.Column className="w-28 text-end">操作</Table.Column>
                </Table.Header>

                <Table.Body>
                  {filteredItems.map((item) => {
                    const isSelected = item.workitemId === selectedWorkitemId;
                    return (
                      <Table.Row
                        key={item.workitemId || item.identifier}
                        id={item.workitemId || item.identifier}
                        // 选中态只表达一次（accent-soft 底），单元格内不再逐格手写 accent-foreground 反色补丁
                        className={cn(
                          'cursor-pointer transition-colors',
                          isSelected ? 'bg-accent-soft' : 'hover:bg-surface-secondary',
                        )}
                        onAction={() => onOpenDetail(item)}
                      >
                        <Table.Cell>
                          <span className="font-mono text-xs font-semibold">{item.identifier}</span>
                        </Table.Cell>

                        <Table.Cell>
                          <OverflowTooltip text={item.subject} className="max-w-md truncate text-xs" />
                        </Table.Cell>

                        <Table.Cell>
                          <div className="flex items-center gap-1.5">
                            <StatusIcon status={item.status} className="size-3.5 shrink-0" />
                            <span className="text-xs text-muted-foreground">{item.status}</span>
                          </div>
                        </Table.Cell>

                        <Table.Cell>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {item.updatedAt?.slice(0, 10) ?? '—'}
                          </span>
                        </Table.Cell>

                        <Table.Cell className="text-end">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="ghost" size="xs" onPress={() => onOpenDetail(item)}>
                              <FileTextIcon className="size-3" />
                              <span>详情</span>
                            </Button>
                            {onOpenWorkbench && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onPress={() => onOpenWorkbench(item.workitemId, item.identifier ?? '', item.subject ?? '')}
                                aria-label="在全屏工作台打开"
                              >
                                <ExternalLinkIcon className="size-3" />
                              </Button>
                            )}
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
      </Card.Content>
    </Card>
  );
}