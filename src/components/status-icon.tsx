import { CircleDashedIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statusMeta, type StatusTone } from './StatusBadge';

/**
 * Linear 式状态图标（1:1 克隆的视觉锚点）：
 * - idle  → 灰色虚线圆（Backlog/Todo）
 * - run   → 黄色半充圆（In Progress，Linear 标志性图形）
 * - fail  → 红色实心圆 + 白叉
 * - ok    → 靛蓝实心圆 + 白勾（Done，Linear 品牌紫 #5e6ad2）
 * 颜色取自 Linear 状态盘，不走主题 token（状态色是全局常量，不随主题翻转）。
 */

/** 进行中：左半充圆（Linear In Progress 图形） */
function HalfCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" className={cn('text-sig-run', className)} fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 1.25 A5.75 5.75 0 0 0 7 12.75 Z" fill="currentColor" />
    </svg>
  );
}

/** 已完成：实心品牌紫圆 + 白勾（Linear Done 图形） */
function DoneCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" className={className} aria-hidden="true">
      <circle cx="7" cy="7" r="6" className="fill-primary" />
      <path
        d="M4.4 7.3 L6.1 9 L9.6 5.3"
        stroke="currentColor"
        className="text-primary-foreground"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 失败/阻塞：实心红圆 + 白叉 */
function FailCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" className={className} aria-hidden="true">
      <circle cx="7" cy="7" r="6" className="fill-sig-fail" />
      <path
        d="M5 5 L9 9 M9 5 L5 9"
        stroke="currentColor"
        className="text-destructive-foreground"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const TONE_ICON: Record<StatusTone, (props: { className?: string }) => React.ReactNode> = {
  idle: ({ className }) => (
    <CircleDashedIcon className={cn('text-sig-idle', className)} strokeWidth={2} />
  ),
  run: ({ className }) => <HalfCircle className={className} />,
  ok: ({ className }) => <DoneCircle className={className} />,
  fail: ({ className }) => <FailCircle className={className} />,
};

/** 任意状态值（云效中文状态 / CI 英文状态）→ Linear 式状态图形 */
export function StatusIcon({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  const tone = statusMeta(status).tone;
  const Icon = TONE_ICON[tone];
  return (
    <span
      role="img"
      aria-label={statusMeta(status).label}
      className={cn('inline-flex shrink-0 items-center justify-center', className ?? 'size-3.5')}
    >
      <Icon className="size-full" />
    </span>
  );
}

/** 分组排序权重：进行中 → 失败/阻塞 → 待处理 → 已完成（Linear 默认排序的本地化） */
export const STATUS_TONE_ORDER: readonly StatusTone[] = ['run', 'fail', 'idle', 'ok'];

export { statusMeta };
