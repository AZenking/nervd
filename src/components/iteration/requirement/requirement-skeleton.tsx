import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { STICKY_PAGE_HEADER_CLASS } from '@/components/page-header';

/** 需求/工作项详情骨架屏（对齐 Linear 详情页布局） */
export function RequirementDetailsSkeleton({ embedded }: { embedded?: boolean }) {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {embedded ? (
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-border/70 bg-popover/95 px-5 pt-7 pb-3 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-2.5">
            <Skeleton className="size-4 rounded-full shrink-0" />
            <Skeleton className="h-5 w-20 rounded shrink-0" />
            <Skeleton className="h-5 w-48 rounded" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Skeleton className="size-6 rounded" />
            <Skeleton className="size-6 rounded" />
          </div>
        </div>
      ) : (
        <header className={STICKY_PAGE_HEADER_CLASS}>
          <div className="flex min-h-9 items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-14 rounded" />
              <span className="text-muted-foreground/30">/</span>
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-16 rounded" />
            </div>
          </div>
        </header>
      )}

      <div className={cn(
        'flex flex-col gap-8',
        embedded ? 'px-5 pb-8 pt-2' : 'mx-auto w-full max-w-7xl py-1',
      )}>
        {!embedded && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-5 rounded-full shrink-0" />
              <Skeleton className="h-7 w-2/3 rounded-lg" />
            </div>
          </div>
        )}

        <div className={cn('grid grid-cols-1 gap-8', !embedded && 'xl:grid-cols-[minmax(0,1fr)_18rem]')}>
          {/* 左侧主内容区 */}
          <div className="min-w-0 flex flex-col gap-8">
            {/* 描述 */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-12 rounded" />
                <Skeleton className="h-3.5 w-32 rounded" />
              </div>
              <div className="flex flex-col gap-2.5 rounded-lg border border-border/40 bg-card/30 p-4">
                <Skeleton className="h-3.5 w-full rounded" />
                <Skeleton className="h-3.5 w-5/6 rounded" />
                <Skeleton className="h-3.5 w-3/5 rounded" />
              </div>
            </section>

            {/* 云效仓库交付链路 */}
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-7 w-20 rounded-md" />
              </div>
              <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-card/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-4 rounded" />
                    <Skeleton className="h-4 w-36 rounded" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="flex flex-col gap-2 pt-3 border-t border-border/30">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-3.5 w-16 rounded" />
                    <Skeleton className="h-5 w-44 rounded" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-3.5 w-16 rounded" />
                    <Skeleton className="h-5 w-56 rounded" />
                  </div>
                </div>
              </div>
            </section>

            {/* 子任务 */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-6 w-20 rounded" />
              </div>
              <div className="flex flex-col gap-1.5">
                {[0, 1].map((i) => (
                  <div key={i} className="flex h-9 items-center gap-3 rounded-md border border-border/40 bg-card/20 px-3">
                    <Skeleton className="size-3.5 rounded-full shrink-0" />
                    <Skeleton className="h-3.5 w-16 shrink-0" />
                    <Skeleton className="h-3.5 flex-1 rounded" style={{ width: `${45 + i * 15}%` }} />
                    <Skeleton className="size-4 rounded-full shrink-0 ml-auto" />
                  </div>
                ))}
              </div>
            </section>

            {/* 缺陷 */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-12 rounded" />
                <Skeleton className="h-6 w-20 rounded" />
              </div>
              <div className="flex h-9 items-center gap-3 rounded-md border border-border/40 bg-card/20 px-3">
                <Skeleton className="size-3.5 rounded-full shrink-0" />
                <Skeleton className="h-3.5 w-16 shrink-0" />
                <Skeleton className="h-3.5 w-1/2 rounded" />
                <Skeleton className="size-4 rounded-full shrink-0 ml-auto" />
              </div>
            </section>

            {/* 动态 */}
            <section className="flex flex-col gap-3">
              <Skeleton className="h-4 w-16 rounded" />
              <div className="flex items-start gap-3 pl-3">
                <Skeleton className="size-6 rounded-full shrink-0" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-24 rounded" />
                  <Skeleton className="h-4 w-2/3 rounded" />
                </div>
              </div>
            </section>
          </div>

          {/* 右侧属性栏（仅全屏） */}
          {!embedded && (
            <aside className="flex flex-col gap-4 xl:sticky xl:top-20 xl:w-auto">
              <Skeleton className="h-3.5 w-10 rounded" />
              <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-card/30 p-4">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-3.5 rounded" />
                      <Skeleton className="h-3.5 w-14 rounded" />
                    </div>
                    <Skeleton className="h-4 w-20 rounded" />
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
