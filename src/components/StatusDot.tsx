import { cn } from '@/lib/utils';

// 状态信号灯：--sig-* 语义色圆点（RUNNING 呼吸脉冲）
export function StatusDot({ status }: { status?: string }) {
  const s = (status ?? '').toUpperCase();
  const cls =
    s === 'RUNNING' || s === 'WAITING'
      ? 'bg-sig-run animate-sig-pulse'
      : s === 'SUCCESS'
        ? 'bg-sig-ok'
        : s === 'FAIL' || s === 'CANCELED'
          ? 'bg-sig-fail'
          : 'bg-sig-idle';
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full align-middle', cls)}
      title={status || '—'}
    />
  );
}
