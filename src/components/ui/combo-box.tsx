import * as React from "react"
import { ComboBox as HeroComboBox } from "@heroui/react"
import { cn } from "@/lib/utils"

/**
 * HeroUI ComboBox 薄封装（可搜索选择器）：
 * 与 Select 的差别是「输入框 + 下拉列表」——输入即过滤，适合仓库 / 分支模板这类长列表。
 *
 * 受控口子与 ui/select、ui/autocomplete 对齐：
 * - `value` / `onValueChange(value: string | null)`：业务侧以字符串 key 读写；
 * - `selectedKey` / `onSelectionChange`：React Aria 原生口子，直接透传；
 * - 组合件：`ComboBox.InputGroup` + `ComboBox.Trigger` + `ComboBox.Popover`，
 *   列表内容用 `ui/list-box` 的 ListBox 渲染（自带键盘漫游与类型前置匹配）。
 */
export interface ComboBoxProps
  extends Omit<
    React.ComponentPropsWithRef<typeof HeroComboBox>,
    "selectedKey" | "defaultSelectedKey" | "onSelectionChange"
  > {
  value?: string | null
  onValueChange?: (value: string | null) => void
  selectedKey?: string | null
  defaultSelectedKey?: string | null
  onSelectionChange?: (key: React.Key | null) => void
}

function ComboBoxRoot({
  className,
  value,
  onValueChange,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  ...props
}: ComboBoxProps) {
  const resolvedSelectedKey = value !== undefined ? (value ? String(value) : null) : selectedKey

  const handleSelectionChange = (key: React.Key | null) => {
    onSelectionChange?.(key)
    onValueChange?.(key === null || key === undefined || key === "" ? null : String(key))
  }

  return (
    <HeroComboBox
      data-slot="combo-box"
      className={cn("w-full", className)}
      selectedKey={resolvedSelectedKey}
      defaultSelectedKey={defaultSelectedKey ?? undefined}
      onSelectionChange={handleSelectionChange}
      {...props}
    />
  )
}

const ComboBox = Object.assign(ComboBoxRoot, {
  Root: HeroComboBox,
  InputGroup: HeroComboBox.InputGroup,
  Trigger: HeroComboBox.Trigger,
  Popover: HeroComboBox.Popover,
  Value: HeroComboBox.Value,
})

export { ComboBox }