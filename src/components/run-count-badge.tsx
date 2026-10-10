import { Badge } from '@/components/ui/badge';

/** 运行记录计数徽章：无记录显示「—」，与迭代仓库表 / 需求详情仓库表共用同一口径 */
export function RunCountBadge({ count }: { count?: number }) {
  return (
    <Badge variant="outline">
      {count ? `最近 ${count} 次` : '—'}
    </Badge>
  );
}
