import * as React from "react"
import {
  Autocomplete as HeroAutocomplete,
  SearchField as HeroSearchField,
  ListBox,
  useFilter,
} from "@heroui/react"
import { cn } from "@/lib/utils"

export interface AutocompleteProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroAutocomplete>, "value" | "defaultValue" | "onChange"> {
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null) => void
  selectedKey?: string | null
  defaultSelectedKey?: string | null
  onSelectionChange?: (key: any) => void
  disabled?: boolean
}

function AutocompleteRoot({
  className,
  value,
  defaultValue,
  onValueChange,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  disabled,
  isDisabled,
  children,
  ...props
}: AutocompleteProps) {
  const resolvedSelectedKey = value !== undefined ? (value ? String(value) : null) : selectedKey
  const resolvedDefaultSelectedKey = defaultValue !== undefined ? (defaultValue ? String(defaultValue) : null) : defaultSelectedKey
  const resolvedDisabled = disabled ?? isDisabled

  const handleSelectionChange = (key: any) => {
    onSelectionChange?.(key)
    if (onValueChange) {
      if (key === null || key === undefined || key === "") {
        onValueChange(null)
      } else {
        onValueChange(String(key))
      }
    }
  }

  return (
    <HeroAutocomplete
      data-slot="autocomplete"
      selectedKey={resolvedSelectedKey}
      defaultSelectedKey={resolvedDefaultSelectedKey}
      onSelectionChange={handleSelectionChange}
      isDisabled={resolvedDisabled}
      className={className}
      {...props}
    >
      {children}
    </HeroAutocomplete>
  )
}

export interface AutocompleteTriggerProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroAutocomplete.Trigger>, "children"> {
  children?: React.ReactNode
  showIndicator?: boolean
}

function AutocompleteTrigger({
  className,
  children,
  showIndicator = true,
  ...props
}: AutocompleteTriggerProps) {
  const hasIndicator =
    typeof children !== "function" &&
    React.Children.toArray(children).some(
      (child) =>
        React.isValidElement(child) &&
        (child.type === HeroAutocomplete.Indicator ||
          (child.props as any)?.["data-slot"] === "autocomplete-indicator" ||
          (child.props as any)?.["data-slot"] === "autocomplete-default-indicator")
    )

  return (
    <HeroAutocomplete.Trigger
      data-slot="autocomplete-trigger"
      className={cn("min-h-0", className)}
      {...props}
    >
      {children}
      {showIndicator && !hasIndicator && <HeroAutocomplete.Indicator />}
    </HeroAutocomplete.Trigger>
  )
}

export interface AutocompleteValueProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroAutocomplete.Value>, "children"> {
  placeholder?: string
  children?: React.ReactNode | ((values: any) => React.ReactNode)
}

function AutocompleteValue({ className, placeholder, children, ...props }: AutocompleteValueProps) {
  if (placeholder && !children) {
    return (
      <HeroAutocomplete.Value
        data-slot="autocomplete-value"
        className={cn("truncate whitespace-nowrap", className)}
        {...props}
      >
        {({ defaultChildren, isPlaceholder }: any) =>
          isPlaceholder ? placeholder : defaultChildren
        }
      </HeroAutocomplete.Value>
    )
  }

  return (
    <HeroAutocomplete.Value
      data-slot="autocomplete-value"
      className={cn("truncate whitespace-nowrap", className)}
      {...props}
    >
      {children as any}
    </HeroAutocomplete.Value>
  )
}

export interface AutocompletePopoverProps
  extends React.ComponentPropsWithRef<typeof HeroAutocomplete.Popover> {}

function AutocompletePopover({ className, children, ...props }: AutocompletePopoverProps) {
  return (
    <HeroAutocomplete.Popover
      data-slot="autocomplete-popover"
      className={cn("overscroll-contain", className)}
      {...props}
    >
      {children}
    </HeroAutocomplete.Popover>
  )
}

export interface AutocompleteItemProps
  extends Omit<React.ComponentPropsWithRef<typeof ListBox.Item>, "id" | "children"> {
  value?: string
  id?: string
  children?: React.ReactNode
}

function AutocompleteItem({
  value,
  id,
  className,
  children,
  ...props
}: AutocompleteItemProps) {
  const resolvedId = (id ?? value ?? "") as string
  const hasIndicator =
    typeof children !== "function" &&
    React.Children.toArray(children).some(
      (child) =>
        React.isValidElement(child) &&
        (child.type === ListBox.ItemIndicator ||
          child.type === (ListBox as any).Item?.Indicator)
    )

  return (
    <ListBox.Item
      id={resolvedId}
      textValue={typeof children === "string" ? children : undefined}
      className={cn("whitespace-nowrap", className)}
      {...props}
    >
      {children}
      {!hasIndicator && <ListBox.ItemIndicator />}
    </ListBox.Item>
  )
}

export interface SearchFieldProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroSearchField>, "value" | "defaultValue" | "onChange"> {
  value?: string | null
  defaultValue?: string | null
  onChange?: (value: string) => void
  onValueChange?: (value: string) => void
}

function SearchFieldRoot({
  value,
  defaultValue,
  onChange,
  onValueChange,
  ...props
}: SearchFieldProps) {
  const resolvedValue = value !== undefined ? (value ?? "") : undefined
  const resolvedDefaultValue = defaultValue !== undefined ? (defaultValue ?? "") : undefined

  const handleChange = (val: string) => {
    onChange?.(val)
    onValueChange?.(val)
  }

  return (
    <HeroSearchField
      value={resolvedValue}
      defaultValue={resolvedDefaultValue}
      onChange={handleChange}
      {...props}
    />
  )
}

export interface SearchFieldInputProps
  extends React.ComponentPropsWithRef<typeof HeroSearchField.Input> {}

function SearchFieldInput({
  onKeyDown,
  onKeyUp,
  ...props
}: SearchFieldInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    // 阻止输入法组合状态 (IME) 及空格键事件向上冒泡，防止被父级容器或全局快捷键监听器拦截/吞噬
    if (e.nativeEvent.isComposing || (e as any).isComposing || e.key === ' ' || e.key === 'Spacebar') {
      e.stopPropagation()
    }
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyUp?.(e)
    if (e.defaultPrevented) return
    if (e.nativeEvent.isComposing || (e as any).isComposing || e.key === ' ' || e.key === 'Spacebar') {
      e.stopPropagation()
    }
  }

  return (
    <HeroSearchField.Input
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      {...props}
    />
  )
}

const SearchField = Object.assign(SearchFieldRoot, {
  Root: HeroSearchField.Root,
  Group: HeroSearchField.Group,
  Input: SearchFieldInput,
  SearchIcon: HeroSearchField.SearchIcon,
  ClearButton: HeroSearchField.ClearButton,
})

const Autocomplete = Object.assign(AutocompleteRoot, {
  Trigger: AutocompleteTrigger,
  Value: AutocompleteValue,
  Indicator: HeroAutocomplete.Indicator,
  ClearButton: HeroAutocomplete.ClearButton,
  Popover: AutocompletePopover,
  Filter: HeroAutocomplete.Filter,
  Item: AutocompleteItem,
})

export {
  Autocomplete,
  AutocompleteTrigger,
  AutocompleteValue,
  AutocompletePopover,
  AutocompleteItem,
  SearchField,
  ListBox,
  useFilter,
}
