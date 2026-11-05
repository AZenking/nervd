import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { RequirementDetailsSkeleton } from './iteration/requirement/requirement-skeleton';

export { RequirementDetailsSkeleton as RequirementViewSkeleton };

/** 集成分支视图骨架屏 */
export function IntegrationViewSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {/* 与真实页头一致：单行（导航 + 标题 + 刷新），工具行已下放正文 */}
      <PageHeader
        sticky
        navigation={<Skeleton className="size-7 rounded-md" />}
        title="集成分支"
        titleClassName="text-sm font-semibold tracking-tight text-foreground"
        actions={<Skeleton className="h-7 w-7 rounded-md" />}
      />
      <div className="flex flex-col gap-4">
        {/* 工具行骨架：仓库选择 + 基准分支 + 匹配模式（与真实正文工具行同位） */}
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-56 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-56 rounded-md" />
        </div>
        <div className="flex flex-col gap-2">
        <div className="flex h-8 items-center gap-2 rounded-md bg-muted/70 px-3">
          <Skeleton className="size-3.5 rounded" />
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex h-11 w-full items-center gap-3 rounded-lg border border-border/30 bg-card/10 px-3"
          >
            <Skeleton className="size-3.5 rounded shrink-0" />
            <Skeleton className="h-3.5 w-48 shrink-0 rounded" />
            <Skeleton className="h-3.5 flex-1 rounded" />
            <Skeleton className="h-3.5 w-20 shrink-0 rounded" />
            <Skeleton className="h-4 w-16 shrink-0 rounded" />
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

/** 定时任务工作台骨架屏 */
export function SchedulesViewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <PageHeader
        sticky
        density="compact"
        navigation={<Skeleton className="size-7 rounded-md" />}
        title="定时任务工作台"
        titleClassName="text-sm font-semibold tracking-tight text-foreground"
        toolbar={
          <div className="flex items-center justify-end gap-2 w-full">
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-32 rounded-md" />
            <Skeleton className="h-8 w-32 rounded-md" />
          </div>
        }
      />
      {/* 筛选与搜索行骨架（自页头下移至正文，与真实页面同位） */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-44 rounded-md" />
        <Skeleton className="h-8 flex-1 max-w-xs rounded-md" />
      </div>
      {/* 任务列表骨架：单容器 + 发丝线分行，与真实 ListBox 列表形态一致 */}
      <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border/60">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-4 rounded shrink-0" />
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-14 rounded-md" />
                <Skeleton className="size-7 rounded-md" />
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <Skeleton className="h-3.5 w-28 rounded" />
              <Skeleton className="h-3.5 w-36 rounded" />
              <Skeleton className="h-3.5 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 设置视图（工作区嵌入模态）骨架屏 */
export function SettingsViewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <PageHeader
        sticky
        navigation={<Skeleton className="size-7 rounded-md" />}
        title="系统设置"
        titleClassName="text-2xl font-semibold tracking-tight text-foreground"
        description="加载配置模块中…"
        actions={<Skeleton className="h-6 w-24 rounded" />}
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-20">
        <Card className="flex flex-col gap-4 p-5">
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-3.5 w-3/4 rounded" />
          <div className="flex flex-col gap-3 pt-3 border-t border-border/40">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </Card>
      </div>
    </div>
  );
}
