import { useMemo, useState } from 'react';
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

/** 自定义值候选项的内部哨兵（不会与业务取值冲突） */
const CUSTOM_VALUE_SENTINEL = '\u0000__custom__';

/**
 * 可搜索下拉选择：Combobox（Base UI）封装，视觉与 SelectTrigger 对齐。
 * 列表顶部内置搜索输入，输入时按 label 大小写不敏感过滤。
 * allowCustomValue：允许提交列表外的自由文本（替代原生 datalist），输入非匹配值时
 * 列表顶部出现「使用「xxx」」候选项。
 */
export function SearchableSelect<V extends string | number | null>({
  items,
  value,
  onValueChange,
  placeholder = '请选择',
  searchPlaceholder = '输入关键词搜索…',
  emptyText = '没有匹配结果',
  disabled = false,
  allowCustomValue = false,
  customValueLabel = '使用',
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
  /** 允许选择/输入列表之外的自定义值 */
  allowCustomValue?: boolean;
  /** 自定义值候选项的前缀文案，默认「使用」 */
  customValueLabel?: string;
  id?: string;
  ariaLabel?: string;
  /** 追加到触发器的样式（宽度/字号等），如 "w-full text-xs" */
  className?: string;
  /** 追加到弹出层的样式 */
  popupClassName?: string;
}) {
  // 非受控镜像输入值：用于 allowCustomValue 时注入「使用「kw」」候选
  const [inputValue, setInputValue] = useState('');

  const trimmedKeyword = inputValue.trim();
  const keywordIsExactMatch = useMemo(
    () => items.some((item) => item.label === trimmedKeyword || String(item.value) === trimmedKeyword),
    [items, trimmedKeyword],
  );

  type ItemValue = V | typeof CUSTOM_VALUE_SENTINEL;
  const displayItems = useMemo<Array<SearchableSelectOption<ItemValue>>>(() => {
    if (!allowCustomValue || !trimmedKeyword || keywordIsExactMatch) {
      return items as Array<SearchableSelectOption<ItemValue>>;
    }
    const customOption: SearchableSelectOption<ItemValue> = {
      label: `${customValueLabel}「${trimmedKeyword}」`,
      value: CUSTOM_VALUE_SENTINEL,
    };
    return [customOption, ...(items as Array<SearchableSelectOption<ItemValue>>)];
  }, [items, allowCustomValue, trimmedKeyword, keywordIsExactMatch, customValueLabel]);

  const selected = items.find((item) => item.value === value) ?? null;
  const showRawValue = !selected && value != null && value !== '';

  return (
    <Combobox<ItemValue>
      value={(showRawValue ? null : (value ?? null)) as ItemValue | null}
      onValueChange={(v) => {
        if (v === CUSTOM_VALUE_SENTINEL) {
          onValueChange(trimmedKeyword as V);
          return;
        }
        onValueChange((v ?? null) as V | null);
      }}
      items={displayItems}
      disabled={disabled}
      onInputValueChange={(next) => setInputValue(next)}
    >
      <ComboboxTrigger
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          'flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-[4px] border border-input bg-white py-1 pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
          className,
        )}
      >
        <span
          className={cn(
            'flex min-w-0 flex-1 items-center truncate',
            !selected && !showRawValue && 'text-muted-foreground',
          )}
        >
          {showRawValue
            ? String(value)
            : <ComboboxValue placeholder={placeholder} />}
        </span>
      </ComboboxTrigger>
      <ComboboxContent
        className={popupClassName}
        style={{ minWidth: 200 }}
      >
        <ComboboxInput placeholder={searchPlaceholder} showTrigger={false} />
        <ComboboxList>
          {(item: SearchableSelectOption<ItemValue>) => (
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
