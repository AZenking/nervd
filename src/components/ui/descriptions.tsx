import { useState, type KeyboardEvent, type Key, type ReactNode } from 'react';
import { CheckIcon, PencilIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * 描述列表（antd Descriptions 模式的 Tailwind 实现，无样式引擎依赖）：
 * - items 声明式配置（对齐 antd v5+ items API）：label / children / span / copyable / editable；
 * - column 支持 number（全断点）或断点对象（响应式列数），静态类名映射保证 Tailwind v4 可扫描生成；
 * - variant：card（信息卡栅格，接替 InfoItem）/ plain（属性行）/ bordered（antd 经典单元格分栏，单列）；
 * - label 对齐：card 为同栅格行基线对齐；plain / bordered 为固定宽 label 列对齐（可用 labelClassName 覆盖）；
 * - copyable / editable 为 hover 显现的值操作位；拷贝反馈用图标切换，不依赖全局状态。
 */

type ColumnCount = 1 | 2 | 3 | 4;
export type DescriptionsBreakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type DescriptionsVariant = 'card' | 'plain' | 'bordered';

export interface DescriptionsItem {
  key?: Key;
  label: ReactNode;
  /** 值；纯字符串在 card 形态下自动截断并用 Tooltip 呈现全量（沿袭 InfoItem 的 UX A12 行为） */
  children: ReactNode;
  /** 拷贝 / 编辑用的纯文本；children 为 ReactNode 且需要 copyable / editable 时必填 */
  text?: string;
  /** 跨列数（sm 起生效，避免 xs 单列时越界产生隐式轨道；需 ≤ 对应断点列数） */
  span?: 2 | 3 | 4;
  /** hover 显现拷贝位；传字符串可自定义拷贝内容 */
  copyable?: boolean | string;
  /** hover 显现编辑位（Enter 保存 / Esc 取消）；保存失败的提示由调用方自行处理 */
  editable?: { onSave: (text: string) => void | Promise<void> };
  labelClassName?: string;
  contentClassName?: string;
}

export interface DescriptionsProps {
  items: DescriptionsItem[];
  /** 列数：card 形态生效（plain / bordered 固定单列） */
  column?: ColumnCount | Partial<Record<DescriptionsBreakpoint, ColumnCount>>;
  variant?: DescriptionsVariant;
  /** 统一追加到所有 label（如覆盖固定列宽） */
  labelClassName?: string;
  /** 统一追加到所有值 */
  contentClassName?: string;
  className?: string;
}

/** 响应式列数 → Tailwind 类（字面量映射，保证扫描器可生成，禁止运行时拼接） */
const RESPONSIVE_COLUMN_CLASS: Record<DescriptionsBreakpoint, Record<ColumnCount, string>> = {
  xs: { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' },
  sm: { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' },
  md: { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' },
  lg: { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' },
  xl: { 1: 'xl:grid-cols-1', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4' },
  '2xl': { 1: '2xl:grid-cols-1', 2: '2xl:grid-cols-2', 3: '2xl:grid-cols-3', 4: '2xl:grid-cols-4' },
};

/** span 从 sm 起生效（xs 单列时跨列无意义且会产生隐式轨道） */
const SPAN_CLASS: Record<NonNullable<DescriptionsItem['span']>, string> = {
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
};

const DEFAULT_COLUMN: NonNullable<DescriptionsProps['column']> = { xs: 1, sm: 2, md: 3 };

function columnClasses(column: NonNullable<DescriptionsProps['column']>): string {
  if (typeof column === 'number') {
    return RESPONSIVE_COLUMN_CLASS.xs[column];
  }
  return (Object.entries(column) as [DescriptionsBreakpoint, ColumnCount][])
    .map(([breakpoint, count]) => RESPONSIVE_COLUMN_CLASS[breakpoint]?.[count] ?? '')
    .filter(Boolean)
    .join(' ');
}

function resolveText(item: DescriptionsItem): string {
  if (typeof item.text === 'string') return item.text;
  if (typeof item.children === 'string' || typeof item.children === 'number') return String(item.children);
  return '';
}

const ACTION_BUTTON_CLASS =
  'flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/** 行内编辑态（antd Typography editable 交互：Enter 保存 / Esc 取消），替换值区域展示 */
function EditControl({
  initial,
  label,
  onSave,
  onCancel,
}: {
  initial: string;
  label: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== initial) onSave(next);
    else onCancel();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') onCancel();
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(event) => event.target.select()}
        autoFocus
        aria-label={`编辑${label}`}
        className="h-7 flex-1 text-sm"
      />
      <button type="button" aria-label="保存" title="保存（Enter）" className={ACTION_BUTTON_CLASS} onClick={commit}>
        <CheckIcon className="size-3.5" />
      </button>
      <button type="button" aria-label="取消" title="取消（Esc）" className={ACTION_BUTTON_CLASS} onClick={onCancel}>
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

function DescriptionCell({
  item,
  variant,
  labelClassName,
  contentClassName,
  last,
}: {
  item: DescriptionsItem;
  variant: DescriptionsVariant;
  labelClassName?: string;
  contentClassName?: string;
  /** bordered 形态：末行去掉下边框 */
  last?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const text = resolveText(item);
  const copySource = typeof item.copyable === 'string' ? item.copyable : text;
  const showCopy = Boolean(item.copyable) && copySource !== '';
  const showEdit = Boolean(item.editable);
  const label = typeof item.label === 'string' ? item.label : '字段';

  const actions = !editing && (showCopy || showEdit) ? (
    <span className="ml-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      {showCopy && <CopyButton text={copySource} />}
      {showEdit && (
        <button
          type="button"
          aria-label="编辑"
          title="编辑"
          className={ACTION_BUTTON_CLASS}
          onClick={() => setEditing(true)}
        >
          <PencilIcon className="size-3.5" />
        </button>
      )}
    </span>
  ) : null;

  const content = editing ? (
    <EditControl
      initial={text}
      label={label}
      onSave={(next) => {
        setEditing(false);
        void item.editable?.onSave(next);
      }}
      onCancel={() => setEditing(false)}
    />
  ) : (
    <>
      {variant === 'card' && typeof item.children === 'string' ? (
        <Tooltip>
          <TooltipTrigger
            render={<span className={cn('min-w-0 flex-1 truncate text-sm text-foreground', contentClassName)} />}
          >
            {item.children}
          </TooltipTrigger>
          <TooltipContent className="max-w-96 break-all">{item.children}</TooltipContent>
        </Tooltip>
      ) : typeof item.children === 'string' || typeof item.children === 'number' ? (
        <span className={cn('min-w-0 flex-1 truncate text-sm text-foreground', contentClassName)}>
          {item.children}
        </span>
      ) : (
        <div className={cn('min-w-0 flex-1 text-sm text-foreground', contentClassName)}>{item.children}</div>
      )}
      {actions}
    </>
  );

  if (variant === 'card') {
    return (
      <div
        className={cn(
          'group min-w-0 rounded-lg border border-border bg-muted/30 px-3.5 py-3',
          item.span && SPAN_CLASS[item.span],
        )}
      >
        <p className={cn('text-xs font-medium text-muted-foreground', labelClassName)}>{item.label}</p>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5">{content}</div>
      </div>
    );
  }

  if (variant === 'plain') {
    return (
      <div className="group -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
        <span className={cn('flex w-28 shrink-0 items-center gap-1.5 text-xs text-muted-foreground', labelClassName)}>
          {item.label}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">{content}</div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          'border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground',
          last && 'border-b-0',
          labelClassName,
        )}
      >
        {item.label}
      </div>
      <div
        className={cn(
          'flex min-w-0 items-center gap-1.5 border-b border-border px-3 py-2 text-sm text-foreground',
          last && 'border-b-0',
          contentClassName,
        )}
      >
        {content}
      </div>
    </>
  );
}

export function Descriptions({
  items,
  column,
  variant = 'card',
  labelClassName,
  contentClassName,
  className,
}: DescriptionsProps) {
  if (variant === 'bordered') {
    return (
      <div
        className={cn(
          'grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] overflow-hidden rounded-lg border border-border',
          className,
        )}
      >
        {items.map((item, index) => (
          <DescriptionCell
            key={item.key ?? index}
            item={item}
            variant="bordered"
            labelClassName={labelClassName}
            contentClassName={contentClassName}
            last={index === items.length - 1}
          />
        ))}
      </div>
    );
  }

  if (variant === 'plain') {
    return (
      <div className={cn('flex flex-col', className)}>
        {items.map((item, index) => (
          <DescriptionCell
            key={item.key ?? index}
            item={item}
            variant="plain"
            labelClassName={labelClassName}
            contentClassName={contentClassName}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid gap-3', columnClasses(column ?? DEFAULT_COLUMN), className)}>
      {items.map((item, index) => (
        <DescriptionCell
          key={item.key ?? index}
          item={item}
          variant="card"
          labelClassName={labelClassName}
          contentClassName={contentClassName}
        />
      ))}
    </div>
  );
}
