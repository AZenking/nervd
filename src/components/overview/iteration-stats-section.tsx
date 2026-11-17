import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import type { WorkitemRow } from '@/lib/api';
import { SectionHeader } from '@/components/section-header';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { WorkitemStatusChart } from './workitem-status-chart';
import { WorkitemUpdateActivityChart } from './workitem-update-activity-chart';

export interface IterationStatsSectionProps {
  /** 当前迭代 + 类别已加载的工作项（图表沿用该范围，不推断未加载数据） */
  items: WorkitemRow[];
  /** 分页是否取尽：图表内部据此区分「完整列表 / 已加载范围」 */
  complete: boolean;
  loading?: boolean;
  /** 状态分布标题后缀（当前迭代名） */
  iterationName?: string;
  className?: string;
}

/**
 * 迭代统计折叠区（总览第 5 区块）：
 * - 状态分布 + 更新时间分布默认收起，避免把次要统计压在首屏主要信息之前；
 * - 展开状态只做会话内记忆（useState），不写 localStorage，刷新/重开应用回到默认收起；
 * - 标题沿用 SectionHeader，触发器是 HeroUI Disclosure 的原生 button：
 *   自带 aria-expanded / aria-controls / 键盘操作，收起时面板 aria-hidden。
 * - 图表始终挂载并使用父级已加载数据，展开不会触发额外请求。
 */
export function IterationStatsSection({
  items,
  complete,
  loading = false,
  iterationName,
  className,
}: IterationStatsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      render={<div role="region" aria-label="迭代统计" />}
      className={cn('flex flex-col gap-4', className)}
    >
      <SectionHeader
        title="迭代统计"
        hint="状态分布与更新时间分布 · 基于当前已加载范围"
        action={
          <CollapsibleTrigger className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span>{expanded ? '收起统计' : '展开统计'}</span>
            <ChevronDownIcon
              aria-hidden
              className={cn(
                'size-3.5 transition-transform duration-200',
                expanded && 'rotate-180',
              )}
            />
          </CollapsibleTrigger>
        }
      />

      <CollapsibleContent>
        <div className="flex flex-col gap-4 lg:flex-row">
          <WorkitemStatusChart
            items={items}
            complete={complete}
            loading={loading}
            title={iterationName ? `状态分布 · ${iterationName}` : '状态分布'}
          />
          <WorkitemUpdateActivityChart items={items} complete={complete} loading={loading} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}