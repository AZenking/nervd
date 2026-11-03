import { useEffect, useState } from 'react';
import { formatElapsedTime } from '@/hooks/use-elapsed-time';
import { cn } from '@/lib/utils';

export interface BuildProgressBarProps {
  /** 任务启动时间戳 (ms) */
  startTime?: number | null;
  /** 历史基准时长 (ms)，无历史数据传 undefined */
  estimatedDurationMs?: number | null;
  /** 自定义外层样式 */
  className?: string;
  /** 是否紧凑模式（单行） */
  compact?: boolean;
}

export interface BuildProgressState {
  /** 当前已执行时长文本 (mm:ss) */
  elapsedText: string;
  /** 预估总耗时文本 (mm:ss) */
  estimatedText: string;
  /** 预估剩余时长文本 (mm:ss) */
  remainingText: string;
  /** 超出时长文本 (如 +00:35) */
  overtimeText: string;
  /** 进度百分比 0-100 */
  percent: number;
  /** 是否已超出预估时长 */
  isOvertime: boolean;
  /** 是否有预估基准 */
  hasEstimate: boolean;
}

export function useBuildProgress(
  startTime?: number | null,
  estimatedDurationMs?: number | null,
): BuildProgressState {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startTime) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [startTime]);

  if (!startTime) {
    return {
      elapsedText: '—',
      estimatedText: '—',
      remainingText: '—',
      overtimeText: '',
      percent: 0,
      isOvertime: false,
      hasEstimate: false,
    };
  }

  const elapsedMs = Math.max(0, now - startTime);
  const elapsedText = formatElapsedTime(elapsedMs);

  const validEstimate = typeof estimatedDurationMs === 'number' && estimatedDurationMs > 3000;
  if (!validEstimate) {
    return {
      elapsedText,
      estimatedText: '—',
      remainingText: '—',
      overtimeText: '',
      percent: 0,
      isOvertime: false,
      hasEstimate: false,
    };
  }

  const estimatedText = formatElapsedTime(estimatedDurationMs);
  const isOvertime = elapsedMs >= estimatedDurationMs;

  if (isOvertime) {
    const overtimeMs = elapsedMs - estimatedDurationMs;
    return {
      elapsedText,
      estimatedText,
      remainingText: '00:00',
      overtimeText: `+${formatElapsedTime(overtimeMs)}`,
      percent: 95,
      isOvertime: true,
      hasEstimate: true,
    };
  }

  const rawPercent = Math.floor((elapsedMs / estimatedDurationMs) * 100);
  // 在实际完成之前，进度条最多推进到 92%，防止用户误以为已完成
  const percent = Math.min(92, Math.max(4, rawPercent));
  const remainingMs = Math.max(0, estimatedDurationMs - elapsedMs);
  const remainingText = formatElapsedTime(remainingMs);

  return {
    elapsedText,
    estimatedText,
    remainingText,
    overtimeText: '',
    percent,
    isOvertime: false,
    hasEstimate: true,
  };
}

export function BuildProgressBar({
  startTime,
  estimatedDurationMs,
  className,
  compact = false,
}: BuildProgressBarProps) {
  const {
    elapsedText,
    estimatedText,
    remainingText,
    overtimeText,
    percent,
    isOvertime,
    hasEstimate,
  } = useBuildProgress(startTime, estimatedDurationMs);

  if (compact) {
    return (
      <div className={cn('flex flex-col gap-1 w-full', className)}>
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="text-foreground font-medium">{elapsedText}</span>
            {hasEstimate && <span>/ 约 {estimatedText}</span>}
            {isOvertime && (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">{overtimeText}</span>
            )}
          </span>
          <span>{hasEstimate ? `${percent}%` : '首次运行中'}</span>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
          {hasEstimate ? (
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500 ease-out',
                isOvertime ? 'bg-amber-500 animate-pulse' : 'bg-sig-run',
              )}
              style={{ width: `${percent}%` }}
            />
          ) : (
            <div className="h-full w-full rounded-full bg-sig-run/60 animate-pulse" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1.5 w-full', className)}>
      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">已用:</span>
          <span className="font-semibold text-foreground">{elapsedText}</span>
          {hasEstimate && (
            <>
              <span className="opacity-50">/</span>
              <span>预估约 {estimatedText}</span>
            </>
          )}
          {isOvertime && (
            <span className="rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1 py-0.2 text-[10px] font-bold">
              超出预估 {overtimeText}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasEstimate && !isOvertime && (
            <span className="text-muted-foreground/80">
              剩余约 <span className="text-foreground/90 font-medium">{remainingText}</span>
            </span>
          )}
          <span className="font-semibold text-sig-run">
            {hasEstimate ? `${percent}%` : '首次运行预估中'}
          </span>
        </div>
      </div>

      {/* 进度条轨道 */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
        {hasEstimate ? (
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-out relative',
              isOvertime
                ? 'bg-amber-500 animate-pulse'
                : 'bg-gradient-to-r from-sig-run/90 to-sig-run',
            )}
            style={{ width: `${percent}%` }}
          >
            {/* 柔和流光扫光效果 */}
            <div className="absolute inset-0 bg-white/20 -skew-x-12 animate-pulse" />
          </div>
        ) : (
          <div className="h-full w-full rounded-full bg-sig-run/40 animate-pulse" />
        )}
      </div>
    </div>
  );
}
