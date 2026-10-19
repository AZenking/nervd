import { useEffect, useMemo, useRef, useState } from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import { fuzzyFilter } from '@/lib/fuzzy';
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
  badge?: React.ReactNode;
  className?: string;
}

/** 自定义值候选项的内部哨兵（不会与业务取值冲突） */
const CUSTOM_VALUE_SENTINEL = '\u0000__custom__';

export const VIRTUAL_ITEM_HEIGHT = 32;
export const VIRTUAL_CONTAINER_HEIGHT = 252;
export const VIRTUAL_OVERSCAN = 4;
export const AUTO_VIRTUALIZE_THRESHOLD = 30;

/** 计算虚拟滚动可视切片索引与偏移量 */
export function computeVirtualSlice(
  totalCount: number,
  scrollTop: number,
  itemHeight = VIRTUAL_ITEM_HEIGHT,
  containerHeight = VIRTUAL_CONTAINER_HEIGHT,
  overscan = VIRTUAL_OVERSCAN,
): { startIndex: number; endIndex: number; translateY: number; totalHeight: number } {
  const totalHeight = totalCount * itemHeight;
  if (totalCount === 0) {
    return { startIndex: 0, endIndex: 0, translateY: 0, totalHeight: 0 };
  }
  const maxStartIndex = Math.max(0, totalCount - 1);
  const rawStartIndex = Math.floor(scrollTop / itemHeight) - overscan;
  const startIndex = Math.max(0, Math.min(maxStartIndex, rawStartIndex));

  const rawEndIndex = Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan;
  const endIndex = Math.max(startIndex, Math.min(totalCount, rawEndIndex));

  const translateY = startIndex * itemHeight;
  return { startIndex, endIndex, translateY, totalHeight };
}

/** 虚拟滚动列表组件：支持大体量数据（如成百上千的 Jenkins Job）的轻量视口渲染 */
function VirtualComboboxList<T extends SearchableSelectOption<any>>({
  emptyText,
}: {
  emptyText: string;
}) {
  const filteredItems = ComboboxPrimitive.useFilteredItems<T>() || [];
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 当搜索过滤结果集变化时，平滑复位滚动条至顶部
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [filteredItems.length]);

  const totalCount = filteredItems.length;

  if (totalCount === 0) {
    return <ComboboxEmpty>{emptyText}</ComboboxEmpty>;
  }

  const { startIndex, endIndex, translateY, totalHeight } = computeVirtualSlice(
    totalCount,
    scrollTop,
  );
  const visibleItems = filteredItems.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="no-scrollbar max-h-[min(calc(var(--spacing)*72-var(--spacing)*9),calc(var(--available-height)-var(--spacing)*9))] scroll-py-1 overflow-y-auto overscroll-contain p-1"
      style={{ maxHeight: `${VIRTUAL_CONTAINER_HEIGHT}px` }}
      tabIndex={-1}
    >
      <div style={{ height: `${totalHeight}px`, width: '100%', position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${translateY}px)`,
          }}
        >
          {visibleItems.map((item, localIdx) => {
            const actualIndex = startIndex + localIdx;
            return (
              <ComboboxItem
                key={String(item.value)}
                value={item.value}
                index={actualIndex}
                disabled={item.disabled}
                title={item.label}
                className={item.className}
              >
                {item.badge ? (
                  <span className="flex items-center justify-between gap-2 w-full min-w-0">
                    <span className="truncate">{item.label}</span>
                    <span className="shrink-0">{item.badge}</span>
                  </span>
                ) : (
                  item.label
                )}
              </ComboboxItem>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * 可搜索下拉选择：Combobox（Base UI）封装，视觉与 SelectTrigger 对齐。
 * 列表顶部内置搜索输入，输入时按 label 大小写不敏感过滤。
 * allowCustomValue：允许提交列表外的自由文本（替代原生 datalist），输入非匹配值时
 * 列表顶部出现「使用「xxx」」候选项。
 * virtualized：开启虚拟滚动（默认在大数据量 items >= 30 时自动启用，显著提升长列表渲染与滚动流畅度）。
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
  virtualized,
  fuzzy = true,
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
  /** 是否启用虚拟滚动（默认在 items >= 30 时自动启用） */
  virtualized?: boolean;
  /** 是否启用智能模糊搜索（默认开启，支持分词、缩写、符号容错与相似度智能排序） */
  fuzzy?: boolean;
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
    let list = items as Array<SearchableSelectOption<ItemValue>>;
    if (fuzzy && trimmedKeyword) {
      list = fuzzyFilter(list, trimmedKeyword, (item) => item.label);
    }
    if (!allowCustomValue || !trimmedKeyword || keywordIsExactMatch) {
      return list;
    }
    const customOption: SearchableSelectOption<ItemValue> = {
      label: `${customValueLabel}「${trimmedKeyword}」`,
      value: CUSTOM_VALUE_SENTINEL,
    };
    return [customOption, ...list];
  }, [items, fuzzy, allowCustomValue, trimmedKeyword, keywordIsExactMatch, customValueLabel]);

  const selected = items.find((item) => item.value === value) ?? null;
  const showRawValue = !selected && value != null && value !== '';
  const isVirtualized = virtualized ?? displayItems.length >= AUTO_VIRTUALIZE_THRESHOLD;

  return (
    <Combobox<ItemValue>
      virtualized={isVirtualized}
      filter={fuzzy ? null : undefined}
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
          'flex h-8 w-full min-w-0 cursor-pointer items-center justify-between gap-1.5 rounded-md border border-border bg-background py-1 pr-2 pl-2.5 text-left text-[13px] whitespace-nowrap transition-colors outline-none select-none hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
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
        className={cn(
          'min-w-[max(var(--anchor-width),300px)] max-w-[min(var(--available-width),560px)]',
          popupClassName,
        )}
        style={{ minWidth: 'max(var(--anchor-width, 0px), 300px)' }}
      >
        <ComboboxInput placeholder={searchPlaceholder} showTrigger={false} />
        {isVirtualized ? (
          <VirtualComboboxList<SearchableSelectOption<ItemValue>> emptyText={emptyText} />
        ) : (
          <>
            <ComboboxList>
              {(item: SearchableSelectOption<ItemValue>) => (
                <ComboboxItem
                  key={String(item.value)}
                  value={item.value}
                  disabled={item.disabled}
                  title={item.label}
                  className={item.className}
                >
                  {item.badge ? (
                    <span className="flex items-center justify-between gap-2 w-full min-w-0">
                      <span className="truncate">{item.label}</span>
                      <span className="shrink-0">{item.badge}</span>
                    </span>
                  ) : (
                    item.label
                  )}
                </ComboboxItem>
              )}
            </ComboboxList>
            <ComboboxEmpty>{emptyText}</ComboboxEmpty>
          </>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
