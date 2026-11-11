import { useMemo, useState } from 'react';
import { ExternalLinkIcon, FileTextIcon, SearchIcon, XIcon } from 'lucide-react';
import { Button, Card, Chip, Input, Table } from '@heroui/react';
import type { WorkitemRow } from '@/lib/api';
import { StatusIcon } from '@/components/status-icon';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface WorkitemsDataTableProps {
  categoryLabel: string;
  items: WorkitemRow[];
  complete: boolean;
  loading?: boolean;
  selectedWorkitemId?: string | null;
  onOpenDetail: (item: WorkitemRow) => void;
  onOpenWorkbench?: (id: string, identifier: string, subject: string) => void;
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
            <Card.Title className="text-sm font-semibold tracking-tight text-foreground">
              工作项速览 · {categoryLabel}
            </Card.Title>
            <Chip size="sm" variant="soft" color="default" className="text-xs">
              {complete ? `最近更新 · 共 ${items.length} 条` : `最近更新 · 已加载 ${items.length} 条`}
            </Chip>
          </div>

          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.nativeEvent.isComposing) return;
              }}
              placeholder="搜索工作项编号或标题..."
              autoComplete="off"
              spellCheck={false}
              className="h-8 pl-8 pr-7 text-xs"
            />
            {search && (
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                onPress={() => setSearch('')}
                className="absolute right-1 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="清空搜索"
              >
                <XIcon className="size-3" />
              </Button>
            )}
          </div>
        </div>
        {/* 交互提示下沉至 Description 槽：数据完整时引导点击查看，分页未完时明确数据口径 */}
        <Card.Description className="text-[11px] text-muted-foreground">
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
          <div className="py-12 text-center text-xs text-muted-foreground">
            {search ? '未找到匹配的工作项' : '暂无工作项'}
          </div>
        ) : (
          <Table variant="secondary" className="w-full">
            <Table.ScrollContainer className="max-h-96 overflow-y-auto overscroll-contain">
              <Table.Content aria-label="工作项列表" className="text-xs">
                <Table.Header className="border-b border-border/60 bg-transparent text-[11px] text-muted-foreground">
                  <Table.Column isRowHeader className="w-28 px-4 py-2.5 text-start font-mono text-[11px] font-medium text-muted-foreground">
                    工作项编号
                  </Table.Column>
                  <Table.Column className="min-w-64 px-3 py-2.5 text-start text-[11px] font-medium text-muted-foreground">
                    工作项标题
                  </Table.Column>
                  <Table.Column className="w-28 px-3 py-2.5 text-start text-[11px] font-medium text-muted-foreground">
                    当前状态
                  </Table.Column>
                  <Table.Column className="w-28 px-3 py-2.5 text-start font-mono text-[11px] font-medium text-muted-foreground">
                    更新时间
                  </Table.Column>
                  <Table.Column className="w-28 px-4 py-2.5 text-end text-[11px] font-medium text-muted-foreground">
                    操作
                  </Table.Column>
                </Table.Header>

                <Table.Body>
                  {filteredItems.map((item) => {
                    const isSelected = item.workitemId === selectedWorkitemId;
                    return (
                      <Table.Row
                        key={item.workitemId || item.identifier}
                        id={item.workitemId || item.identifier}
                        className={cn(
                          'border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer',
                          isSelected && 'bg-accent/50 font-medium',
                        )}
                        onAction={() => onOpenDetail(item)}
                      >
                        <Table.Cell className="px-4 py-2.5">
                          <span className="font-mono text-xs font-semibold text-foreground" title={item.identifier}>
                            {item.identifier}
                          </span>
                        </Table.Cell>

                        <Table.Cell className="px-3 py-2.5 font-medium text-foreground">
                          <OverflowTooltip
                            text={item.subject}
                            className="max-w-md truncate text-xs text-foreground"
                          />
                        </Table.Cell>

                        <Table.Cell className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <StatusIcon status={item.status} className="size-3.5 shrink-0" />
                            <span className="text-xs text-muted-foreground" title={item.status}>{item.status}</span>
                          </div>
                        </Table.Cell>

                        <Table.Cell className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                          {item.updatedAt?.slice(0, 10) ?? '—'}
                        </Table.Cell>

                        <Table.Cell className="px-4 py-2.5 text-end">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onPress={() => onOpenDetail(item)}
                              className="h-7 gap-1 px-2 text-[11px]"
                            >
                              <FileTextIcon className="size-3" />
                              <span>详情</span>
                            </Button>
                            {onOpenWorkbench && (
                              <Button
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                onPress={() => onOpenWorkbench(item.workitemId, item.identifier ?? '', item.subject ?? '')}
                                className="size-7"
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
