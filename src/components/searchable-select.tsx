import { useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyFilter } from '@/lib/fuzzy';
import {
  Autocomplete,
  SearchField,
  ListBox,
} from '@/components/ui/autocomplete';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OverflowTooltip } from '@/components/overflow-tooltip';

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
function VirtualAutocompleteList<T extends SearchableSelectOption<any>>({
  items,
  emptyText,
}: {
  items: T[];
  emptyText: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 当搜索过滤结果集变化时，平滑复位滚动条至顶部
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [items.length]);

  const totalCount = items.length;

  if (totalCount === 0) {
    return (
      <div className="py-3 text-center text-xs text-muted-foreground select-none">
        {emptyText}
      </div>
    );
  }

  const { startIndex, endIndex, translateY, totalHeight } = computeVirtualSlice(
    totalCount,
    scrollTop,
  );
  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <ScrollArea
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      hideScrollBar
      className="max-h-[min(calc(var(--spacing)*72-var(--spacing)*9),calc(var(--available-height)-var(--spacing)*9))] scroll-py-1 overscroll-contain p-1"
      style={{ maxHeight: `${VIRTUAL_CONTAINER_HEIGHT}px` }}
      tabIndex={-1}
    >
      {/* ListBox.Item 必须存活于 ListBox 集合上下文（react-aria CollectionBuilder 强约束）：
          视口窗口 div 平移承载真正的 ListBox，仅渲染可见切片 */}
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
          <ListBox className="w-full">
            {visibleItems.map((item) => (
              <ListBox.Item
                key={String(item.value)}
                id={String(item.value)}
                textValue={item.label}
                isDisabled={item.disabled}
                className={cn(
                  'cursor-pointer text-xs py-1.5 px-2 flex items-center justify-between gap-2',
                  item.className,
                )}
              >
                {item.badge ? (
                  <span className="flex items-center justify-between gap-2 w-full min-w-0">
                    <OverflowTooltip text={item.label} className="min-w-0 flex-1 truncate" />
                    <span className="shrink-0">{item.badge}</span>
                  </span>
                ) : (
                  <OverflowTooltip text={item.label} className="block min-w-0 max-w-full truncate" />
                )}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </div>
      </div>
    </ScrollArea>
  );
}

/**
 * 可搜索下拉选择：HeroUI Autocomplete 封装，视觉与 SelectTrigger 对齐。
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

  const resolvedValue = showRawValue ? null : (value != null ? String(value) : null);

  return (
    <Autocomplete
      value={resolvedValue}
      onValueChange={(v) => {
        if (v === CUSTOM_VALUE_SENTINEL) {
          onValueChange(trimmedKeyword as V);
          return;
        }
        if (v === null || v === undefined) {
          onValueChange(null);
          return;
        }
        const matched = items.find((item) => String(item.value) === v);
        onValueChange((matched ? matched.value : v) as V);
      }}
      disabled={disabled}
      className={className}
    >
      <Autocomplete.Trigger
        id={id}
        aria-label={ariaLabel}
        // 视觉对齐 HeroUI 原生 field 触发器（rounded-field / bg-field / 悬停聚焦态由
        // .autocomplete__trigger 提供），仅保留宽度与透传样式，严禁叠加 HeroUI 原生形态之外的样式。
        className={cn('w-full', className)}
      >
        {selected || showRawValue ? (
          <OverflowTooltip
            text={selected?.label ?? String(value)}
            className="flex min-w-0 flex-1 items-center truncate"
          >
            {showRawValue ? String(value) : selected?.label}
          </OverflowTooltip>
        ) : (
          <Autocomplete.Value placeholder={placeholder} />
        )}
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover
        className={cn(
          'min-w-[max(var(--anchor-width),300px)] max-w-[min(var(--available-width),560px)]',
          popupClassName,
        )}
        style={{ minWidth: 'max(var(--anchor-width, 0px), 300px)' }}
      >
        <SearchField aria-label={searchPlaceholder}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input
              placeholder={searchPlaceholder}
              value={inputValue}
              onChange={(e: any) => setInputValue(typeof e === 'string' ? e : e?.target?.value ?? '')}
            />
            {inputValue && (
              <SearchField.ClearButton onPress={() => setInputValue('')} />
            )}
          </SearchField.Group>
        </SearchField>
        {isVirtualized ? (
          <VirtualAutocompleteList<SearchableSelectOption<ItemValue>>
            items={displayItems}
            emptyText={emptyText}
          />
        ) : (
          <ScrollArea size={24} className="max-h-60 p-1">
          <ListBox className="w-full">
            {displayItems.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground select-none">
                {emptyText}
              </div>
            ) : (
              displayItems.map((item) => (
                <ListBox.Item
                  key={String(item.value)}
                  id={String(item.value)}
                  textValue={item.label}
                  isDisabled={item.disabled}
                  className={cn(
                    'cursor-pointer text-xs py-1.5 px-2 flex items-center justify-between gap-2',
                    item.className,
                  )}
                >
                  {item.badge ? (
                    <span className="flex items-center justify-between gap-2 w-full min-w-0">
                      <OverflowTooltip text={item.label} className="min-w-0 flex-1 truncate" />
                      <span className="shrink-0">{item.badge}</span>
                    </span>
                  ) : (
                    <OverflowTooltip text={item.label} className="block min-w-0 max-w-full truncate" />
                  )}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))
            )}
          </ListBox>
          </ScrollArea>
        )}
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
