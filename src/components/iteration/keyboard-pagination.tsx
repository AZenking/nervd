import { Pagination } from '@heroui/react';
import { cn } from '@/lib/utils';

export interface KeyboardPaginationProps {
  /** 当前页码（1-indexed） */
  pageIndex: number;
  /** 总页数 */
  totalPages: number;
  /** 页码变更回调 */
  onPageChange: (page: number) => void;
  /** 外层样式 */
  className?: string;
}

/**
 * 全键盘感知紧凑分页器（Deep Linear Alignment 规范）：
 * - HeroUI Pagination：Previous/Next 图标 + 页码 Link（React Aria onPress）
 * - 等宽数字展示（tabular-nums font-mono）
 */
export function KeyboardPagination({
  pageIndex,
  totalPages,
  onPageChange,
  className,
}: KeyboardPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Pagination
        size="sm"
        className="text-xs text-muted-foreground"
      >
        <Pagination.Content>
          <Pagination.Item>
            <Pagination.Previous
              aria-label="上一页"
              isDisabled={pageIndex <= 1}
              onPress={() => onPageChange(Math.max(1, pageIndex - 1))}
            >
              <Pagination.PreviousIcon />
            </Pagination.Previous>
          </Pagination.Item>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Pagination.Item key={p}>
              <Pagination.Link
                isActive={p === pageIndex}
                onPress={() => onPageChange(p)}
                className="font-mono tabular-nums"
              >
                {p}
              </Pagination.Link>
            </Pagination.Item>
          ))}
          <Pagination.Item>
            <Pagination.Next
              aria-label="下一页"
              isDisabled={pageIndex >= totalPages}
              onPress={() => onPageChange(Math.min(totalPages, pageIndex + 1))}
            >
              <Pagination.NextIcon />
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </Pagination>
    </div>
  );
}
