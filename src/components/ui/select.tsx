import * as React from "react"
import {
  Select as HeroSelect,
  ListBox,
} from "@heroui/react"
import { cn } from "@/lib/utils"

export interface SelectProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroSelect>, "value" | "defaultValue" | "onChange"> {
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string) => void
  disabled?: boolean
}

function SelectRoot({
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
}: SelectProps) {
  const resolvedSelectedKey = value !== undefined ? (value ? String(value) : null) : selectedKey
  const resolvedDefaultSelectedKey = defaultValue !== undefined ? (defaultValue ? String(defaultValue) : null) : defaultSelectedKey
  const resolvedDisabled = disabled ?? isDisabled

  const handleSelectionChange = (key: any) => {
    onSelectionChange?.(key)
    if (key !== null && key !== undefined) {
      onValueChange?.(String(key))
    }
  }

  return (
    <HeroSelect
      data-slot="select"
      selectedKey={resolvedSelectedKey}
      defaultSelectedKey={resolvedDefaultSelectedKey}
      onSelectionChange={handleSelectionChange}
      isDisabled={resolvedDisabled}
      className={className}
      {...props}
    >
      {children}
    </HeroSelect>
  )
}

export interface SelectTriggerProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroSelect.Trigger>, "children"> {
  children?: React.ReactNode
  showIndicator?: boolean
}

function SelectTrigger({
  className,
  children,
  showIndicator = true,
  ...props
}: SelectTriggerProps) {
  const hasIndicator =
    typeof children !== "function" &&
    React.Children.toArray(children).some(
      (child) =>
        React.isValidElement(child) &&
        (child.type === HeroSelect.Indicator ||
          (child.props as any)?.["data-slot"] === "select-indicator" ||
          (child.props as any)?.["data-slot"] === "select-default-indicator")
    )

  return (
    <HeroSelect.Trigger
      data-slot="select-trigger"
      className={cn("min-h-0", className)}
      {...props}
    >
      {children}
      {showIndicator && !hasIndicator && <HeroSelect.Indicator />}
    </HeroSelect.Trigger>
  )
}

export interface SelectValueProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroSelect.Value>, "children"> {
  placeholder?: string
  children?: React.ReactNode | ((values: any) => React.ReactNode)
}

function SelectValue({ className, placeholder, children, ...props }: SelectValueProps) {
  if (placeholder && !children) {
    return (
      <HeroSelect.Value
        data-slot="select-value"
        className={cn("truncate whitespace-nowrap", className)}
        {...props}
      >
        {({ defaultChildren, isPlaceholder }: any) =>
          isPlaceholder ? placeholder : defaultChildren
        }
      </HeroSelect.Value>
    )
  }

  return (
    <HeroSelect.Value
      data-slot="select-value"
      className={cn("truncate whitespace-nowrap", className)}
      {...props}
    >
      {children as any}
    </HeroSelect.Value>
  )
}

export interface SelectContentProps
  extends React.ComponentPropsWithRef<typeof HeroSelect.Popover> {
  listBoxProps?: React.ComponentPropsWithRef<typeof ListBox>
}

function SelectContent({
  className,
  children,
  listBoxProps,
  ...props
}: SelectContentProps) {
  return (
    <HeroSelect.Popover
      data-slot="select-popover"
      className={className}
      {...props}
    >
      <ListBox data-slot="select-listbox" {...listBoxProps}>
        {children}
      </ListBox>
    </HeroSelect.Popover>
  )
}

export interface SelectItemProps
  extends Omit<React.ComponentPropsWithRef<typeof ListBox.Item>, "id" | "children"> {
  value?: string
  id?: string
  children?: React.ReactNode
}

function SelectItem({
  value,
  id,
  className,
  children,
  ...props
}: SelectItemProps) {
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

export interface SelectSectionProps
  extends React.ComponentPropsWithRef<typeof ListBox.Section> {}

function SelectSection({ className, children, ...props }: SelectSectionProps) {
  return (
    <ListBox.Section className={className} {...props}>
      {children}
    </ListBox.Section>
  )
}

const Select = Object.assign(SelectRoot, {
  Trigger: SelectTrigger,
  Value: SelectValue,
  Indicator: HeroSelect.Indicator,
  ClearButton: HeroSelect.ClearButton,
  Popover: HeroSelect.Popover,
  Content: SelectContent,
  Item: SelectItem,
  Section: SelectSection,
})

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectSection,
}
