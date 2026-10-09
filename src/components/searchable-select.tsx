import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption<V extends string | number | null> {
  label: string;
  value: V;
  disabled?: boolean;
}

/**
 * 可搜索下拉选择：Combobox（Base UI）封装，视觉与 SelectTrigger 对齐。
 * 列表顶部内置搜索输入，输入时按 label 大小写不敏感过滤。
 */
export function SearchableSelect<V extends string | number | null>({
  items,
  value,
  onValueChange,
  placeholder = '请选择',
  searchPlaceholder = '输入关键词搜索…',
  emptyText = '没有匹配结果',
  disabled = false,
  id,
  ariaLabel,
  className,
  popupClassName,
}: {
  items: SearchableSelectOption<V>[];
  value: V | null | undefined;
  onValueChange: (value: V | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  /** 追加到触发器的样式（宽度/字号等），如 "w-full text-xs" */
  className?: string;
  /** 追加到弹出层的样式 */
  popupClassName?: string;
}) {
  const selected = items.find((item) => item.value === value) ?? null;
  return (
    <Combobox<V>
      value={value ?? null}
      onValueChange={(v) => onValueChange(v)}
      items={items}
      disabled={disabled}
    >
      <ComboboxTrigger
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          'flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
          className,
        )}
      >
        <span
          className={cn(
            'flex min-w-0 flex-1 items-center truncate',
            !selected && 'text-muted-foreground',
          )}
        >
          <ComboboxValue placeholder={placeholder} />
        </span>
      </ComboboxTrigger>
      <ComboboxContent
        className={popupClassName}
        style={{ minWidth: 200 }}
      >
        <ComboboxInput placeholder={searchPlaceholder} showTrigger={false} />
        <ComboboxList>
          {(item: SearchableSelectOption<V>) => (
            <ComboboxItem
              key={String(item.value)}
              value={item.value}
              disabled={item.disabled}
            >
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
