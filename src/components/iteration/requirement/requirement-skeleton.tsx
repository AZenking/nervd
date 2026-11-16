import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { STICKY_PAGE_HEADER_CLASS } from '@/components/page-header';

/**
 * 需求/工作项详情骨架屏（对齐 Linear 详情页布局）：
 * - 与真实 DOM 同构：裸文本描述（无 Card 外框）+ SectionHeader + Tabs 行 + 单面板；
 * - 全屏额外渲染右侧 plain Descriptions 属性栏（裸行，无 Card）；
 * - 行高与真实正文一致（14px 文本 / 22px 行距），加载完成时不产生跳动。
 */
export function RequirementDetailsSkeleton({ embedded }: { embedded?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col', embedded ? 'gap-0' : 'gap-6')} aria-hidden>
      {embedded ? (
        <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-2 border-b border-border/70 bg-popover/95 px-5 pt-7 pb-3 backdrop-blur-sm">
          {/* 主行：返回 / 编号 / 标题 / 操作 */}
          <div className="flex h-8 min-w-0 items-center gap-2.5">
            <Skeleton className="h-6 w-16 shrink-0 rounded-md" />
            <span className="h-3.5 w-px shrink-0 bg-border/70" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Skeleton className="size-4 shrink-0 rounded-full" />
              <Skeleton className="h-5 w-20 shrink-0 rounded-sm" />
              <Skeleton className="h-5 w-40 rounded" />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="size-6 rounded-md" />
              ))}
            </div>
          </div>
          {/* 元数据条：状态 / 处理人 / 类型 / 父需求 / 仓库数 */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <span className="mx-0.5 h-4 w-px shrink-0 bg-border/60" />
            <Skeleton className="h-6 w-16 rounded-sm" />
            <Skeleton className="h-6 w-24 rounded-sm" />
            <Skeleton className="h-6 w-20 rounded-sm" />
          </div>
        </div>
      ) : (
        <header data-tauri-drag-region className={cn(STICKY_PAGE_HEADER_CLASS, 'select-none')}>
          {/* 与真实 PageHeader（DESIGN §F.1 单主行）同构：面包屑｜标题+徽标｜弹性空隙｜操作 */}
          <div className="flex min-h-9 items-center gap-2.5">
            <Skeleton className="h-4 w-14 shrink-0 rounded" />
            <span className="text-muted-foreground/30">/</span>
            <Skeleton className="h-4 w-24 shrink-0 rounded" />
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <Skeleton className="h-7 w-2/3 min-w-0 rounded" />
            <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Skeleton className="h-7 w-24 rounded-md" />
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
          </div>
        </header>
      )}

      <div className={cn(
        'mx-auto flex w-full flex-col gap-8 pb-12',
        embedded
          ? 'max-w-full px-5 pt-5'
          : 'max-w-5xl px-5 py-2 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-10 2xl:grid-cols-[minmax(0,1fr)_20rem]',
      )}>
        {/* 左主列：与真实详情页一致的裸画布 */}
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex w-full flex-col gap-4">
            {/* Tabs 行（描述 / 关联仓库 / 变更 / 子工作项 / 活动动态） */}
            <div className="flex w-full min-w-0 items-center gap-2">
              <Skeleton className="h-8 w-14 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-14 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>

            {/* 描述面板：SectionHeader（h2 + hairline）+ 裸文本行 */}
            <section className="flex flex-col gap-3">
              <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
                <Skeleton className="h-4 w-12 rounded" />
                <Skeleton className="h-6 w-12 rounded-md" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-full rounded" />
                <Skeleton className="h-3.5 w-5/6 rounded" />
                <Skeleton className="h-3.5 w-3/5 rounded" />
              </div>
            </section>
          </div>
        </div>

        {/* 右侧属性栏（仅全屏）：h3 区块标题 + plain 裸行 */}
        {!embedded && (
          <aside className="flex w-full flex-col gap-6 xl:sticky xl:top-20 xl:w-auto">
            <div className="flex flex-col">
              <div className="px-2 pb-1.5">
                <Skeleton className="h-3.5 w-10 rounded" />
              </div>
              <div className="flex flex-col">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="flex items-center gap-2 px-2 py-1.5">
                    <Skeleton className="size-3.5 shrink-0 rounded" />
                    <Skeleton className="h-3.5 w-14 shrink-0 rounded" />
                    <Skeleton className="ml-auto h-3.5 w-20 rounded" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col">
              <div className="px-2 pb-1.5">
                <Skeleton className="h-3.5 w-16 rounded" />
              </div>
              <div className="flex flex-col">
                {Array.from({ length: 2 }, (_, index) => (
                  <div key={index} className="flex items-center gap-2 px-2 py-1.5">
                    <Skeleton className="size-3.5 shrink-0 rounded" />
                    <Skeleton className="h-3.5 w-14 shrink-0 rounded" />
                    <Skeleton className="ml-auto h-3.5 w-20 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}