import * as React from "react"
import { Switch as HeroUISwitch } from "@heroui/react"
import { cn } from '@/lib/utils'

type BaseHeroUISwitchProps = Omit<
  React.ComponentPropsWithRef<typeof HeroUISwitch>,
  "className" | "children" | "onChange" | "size"
>

export type SwitchProps = BaseHeroUISwitchProps & {
  className?: string
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  onChange?: (checked: boolean) => void
  disabled?: boolean
  size?: "sm" | "default" | "md" | "lg"
  children?: React.ReactNode
  title?: string
  id?: string
}

function Switch({
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
  size = "default",
  children,
  ...props
}: SwitchProps) {
  const effectiveSelected = isSelected ?? checked
  const effectiveDefaultSelected = defaultSelected ?? defaultChecked
  const effectiveDisabled = isDisabled ?? disabled

  const herouiSize: "sm" | "md" | "lg" =
    size === "default" || size === "sm" ? "sm" : (size as "md" | "lg")

  const handleChange = (selected: boolean) => {
    onChange?.(selected)
    onCheckedChange?.(selected)
  }

  return (
    <HeroUISwitch
      ref={ref}
      data-slot="switch"
      data-size={size}
      className={cn("inline-flex", className)}
      isSelected={effectiveSelected}
      defaultSelected={effectiveDefaultSelected}
      isDisabled={effectiveDisabled}
      size={herouiSize}
      onChange={handleChange}
      {...(props as any)}
    >
      <HeroUISwitch.Content className="p-0">
        <HeroUISwitch.Control>
          <HeroUISwitch.Thumb />
        </HeroUISwitch.Control>
        {children}
      </HeroUISwitch.Content>
    </HeroUISwitch>
  )
}

const SwitchWithCompound = Object.assign(Switch, {
  Root: HeroUISwitch.Root,
  Content: HeroUISwitch.Content,
  Control: HeroUISwitch.Control,
  Thumb: HeroUISwitch.Thumb,
  Icon: HeroUISwitch.Icon,
})

export { SwitchWithCompound as Switch }
