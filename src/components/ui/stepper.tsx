import { CheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface StepperStep {
  key: string;
  label: string;
  description?: string | null;
  /** 强制标记完成；缺省时按 current 推导（当前步之前的节点视为已完成） */
  done?: boolean;
}

export interface StepperProps {
  steps: StepperStep[];
  /** 当前步索引（从 0 开始） */
  current?: number;
  className?: string;
}

export function Stepper({ steps, current = 0, className }: StepperProps) {
  return (
    <ol className={cn('flex w-full items-start', className)}>
      {steps.map((step, index) => {
        const isCurrent = index === current;
        const done = step.done ?? index < current;
        return (
          <li
            key={step.key}
            aria-current={isCurrent ? 'step' : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center"
          >
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[calc(-50%+16px)] right-[calc(50%+16px)] top-[27px] h-0.5 rounded-full',
                  'transition-colors duration-300 ease-[var(--ease-smooth)] motion-reduce:transition-none',
                  steps[index - 1]?.done ?? index - 1 < current
                    ? 'bg-primary/80'
                    : 'bg-muted-foreground/25',
                )}
              />
            )}
            <div className="relative z-10 flex flex-col items-center gap-1.5 px-4 py-3 text-center">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full',
                  'transition-[background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-smooth)] motion-reduce:transition-none',
                  done
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'border-[1.5px] border-primary bg-background font-medium text-primary'
                      : 'border border-border bg-default text-muted-foreground',
                )}
              >
                {done ? (
                  <CheckIcon
                    className="size-4 animate-step-check motion-reduce:animate-none"
                    strokeWidth={2.5}
                  />
                ) : (
                  <span className="font-mono text-xs tabular-nums">{index + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  'max-w-full truncate text-sm transition-colors duration-150 ease-[var(--ease-smooth)] motion-reduce:transition-none',
                  isCurrent ? 'font-semibold text-foreground' : 'text-foreground/90',
                )}
              >
                {step.label}
              </span>
              {step.description != null && (
                <span
                  className={cn(
                    'max-w-full truncate text-xs transition-colors duration-150 ease-[var(--ease-smooth)] motion-reduce:transition-none',
                    isCurrent ? 'text-foreground/70' : 'text-muted-foreground',
                  )}
                >
                  {step.description}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
