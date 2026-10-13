import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tremor 式统计带（Stat / StatBand）：
 * - Stat：结构化 KPI 单元——label（eyebrow 风格）/ value（等宽表格数字）/ sub（与 value 同行基线排的补充）
 *   + children（额外的下方行，放状态点 / 徽标等），密度紧凑（px-4 py-3.5 / min-h-24）；
 * - StatBand：hairline 分格容器——grid gap-px + bg-border 露缝成 1px 分隔线，格子自身 bg-card 遮底拼出分格；
 * - column 支持 1-4 字面量（全断点）或断点对象（响应式列数），采用字面量静态类名映射，保证 Tailwind v4 扫描器可生成；
 * - 用于页首 KPI（总览统计带等）。
 */

type StatColumnCount = 1 | 2 | 3 | 4;
export type StatBreakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface StatProps {
  /** 指标名（eyebrow 风格小标签） */
  label: ReactNode;
  /** 主值：等宽字体 + 表格数字，多格并排时数值可对齐 */
  value: ReactNode;
  /** 与 value 同行基线排的补充说明（如「可写」「通过率 92%」） */
  sub?: ReactNode;
  /** 额外的下方行（状态点 / 徽标等）；容器自带 text-xs text-muted-foreground 行样式 */
  children?: ReactNode;
}

export interface StatBandProps {
  children: ReactNode;
  /** 列数：1-4 字面量全断点生效，或断点对象按响应式覆盖 */
  column?: StatColumnCount | Partial<Record<StatBreakpoint, StatColumnCount>>;
  className?: string;
}

/** 响应式列数 → Tailwind 类（字面量映射，保证扫描器可生成，禁止运行时拼接） */
const RESPONSIVE_COLUMN_CLASS: Record<StatBreakpoint, Record<StatColumnCount, string>> = {
  xs: { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' },
  sm: { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' },
  md: { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' },
  lg: { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' },
  xl: { 1: 'xl:grid-cols-1', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4' },
  '2xl': { 1: '2xl:grid-cols-1', 2: '2xl:grid-cols-2', 3: '2xl:grid-cols-3', 4: '2xl:grid-cols-4' },
};

/** 默认列数：xs 单列 → sm 两列 → lg 四列（页首 4 格 KPI 的常见形态） */
const DEFAULT_COLUMN: NonNullable<StatBandProps['column']> = { xs: 1, sm: 2, lg: 4 };

function columnClasses(column: NonNullable<StatBandProps['column']>): string {
  if (typeof column === 'number') {
    return RESPONSIVE_COLUMN_CLASS.xs[column];
  }
  return (Object.entries(column) as [StatBreakpoint, StatColumnCount][])
    .map(([breakpoint, count]) => RESPONSIVE_COLUMN_CLASS[breakpoint]?.[count] ?? '')
    .filter(Boolean)
    .join(' ');
}

export function Stat({ label, value, sub, children }: StatProps) {
  return (
    <div className="flex min-h-24 flex-col gap-1.5 bg-card px-4 py-3.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-base font-medium tabular-nums text-foreground">{value}</span>
        {sub && <span className="min-w-0 truncate text-xs text-muted-foreground">{sub}</span>}
      </div>
      {children && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

export function StatBand({ children, column, className }: StatBandProps) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border border-border bg-border',
        columnClasses(column ?? DEFAULT_COLUMN),
        className,
      )}
    >
      {children}
    </div>
  );
}
