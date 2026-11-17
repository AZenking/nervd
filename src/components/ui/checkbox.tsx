import * as React from "react"
import { Checkbox as HeroUICheckbox } from "@heroui/react"
import { cn } from '@/lib/utils'

type BaseHeroUICheckboxProps = Omit<
  React.ComponentPropsWithRef<typeof HeroUICheckbox>,
  "className" | "children" | "onChange"
>

export type CheckboxProps = BaseHeroUICheckboxProps & {
  className?: string
  checked?: boolean | "indeterminate"
  defaultChecked?: boolean | "indeterminate"
  onCheckedChange?: (checked: boolean) => void
  onChange?: (checked: boolean) => void
  disabled?: boolean
  children?: React.ReactNode
  title?: string
  id?: string
}

function Checkbox({
  ref,
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  onChange,
  disabled,
  isDisabled,
  isSelected,
  defaultSelected,
  isIndeterminate: isIndeterminateProp,
  children,
  ...props
}: CheckboxProps) {
  const effectiveSelected = isSelected ?? (checked === "indeterminate" ? undefined : checked)
  const effectiveDefaultSelected =
    defaultSelected ?? (defaultChecked === "indeterminate" ? undefined : defaultChecked)
  const effectiveIndeterminate =
    isIndeterminateProp ?? (checked === "indeterminate" || defaultChecked === "indeterminate")
  const effectiveDisabled = isDisabled ?? disabled

  const handleChange = (selected: boolean) => {
    onChange?.(selected)
    onCheckedChange?.(selected)
  }

  // children 直接放标签内容即可：本组件已内置 Content / Control / Indicator。
  // 调用点不要再嵌套 <Checkbox.Content>，否则会再渲染一个勾选框。
  return (
    <HeroUICheckbox
      ref={ref}
      data-slot="checkbox"
      className={cn("inline-flex", className)}
      isSelected={effectiveSelected}
      defaultSelected={effectiveDefaultSelected}
      isIndeterminate={effectiveIndeterminate}
      isDisabled={effectiveDisabled}
      onChange={handleChange}
      {...(props as any)}
    >
      <HeroUICheckbox.Content className="p-0">
        <HeroUICheckbox.Control>
          <HeroUICheckbox.Indicator />
        </HeroUICheckbox.Control>
        {children}
      </HeroUICheckbox.Content>
    </HeroUICheckbox>
  )
}

const CheckboxWithCompound = Object.assign(Checkbox, {
  Root: HeroUICheckbox.Root,
  Content: HeroUICheckbox.Content,
  Control: HeroUICheckbox.Control,
  Indicator: HeroUICheckbox.Indicator,
})

export { CheckboxWithCompound as Checkbox }
