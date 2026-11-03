import * as React from "react"
import { ToggleButtonGroup as HeroUIToggleButtonGroup } from "@heroui/react"
import { type VariantProps } from "class-variance-authority"
import { cn } from '@/lib/utils'

import { Toggle, toggleVariants } from "@/components/ui/toggle"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: "horizontal" | "vertical"
  }
>({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
})

type BaseHeroUIToggleButtonGroupProps = Omit<
  React.ComponentPropsWithRef<typeof HeroUIToggleButtonGroup>,
  "className" | "children" | "orientation" | "size"
>

export type ToggleGroupProps = BaseHeroUIToggleButtonGroupProps &
  VariantProps<typeof toggleVariants> & {
    className?: string
    spacing?: number
    orientation?: "horizontal" | "vertical"
    disabled?: boolean
    children?: React.ReactNode
  }

function ToggleGroup({
  className,
  variant = "default",
  size = "default",
  spacing = 2,
  orientation = "horizontal",
  disabled,
  isDisabled,
  children,
  ...props
}: ToggleGroupProps) {
  const herouiSize: "sm" | "md" | "lg" =
    size === "lg" ? "lg" : "sm"

  return (
    <HeroUIToggleButtonGroup
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      orientation={orientation}
      size={herouiSize}
      isDetached={spacing > 0}
      isDisabled={isDisabled ?? disabled}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-vertical:flex-col data-vertical:items-stretch",
        className
      )}
      {...(props as any)}
    >
      <ToggleGroupContext.Provider
        value={{ variant, size, spacing, orientation }}
      >
        {children}
      </ToggleGroupContext.Provider>
    </HeroUIToggleButtonGroup>
  )
}

export type ToggleGroupItemProps = React.ComponentProps<typeof Toggle>

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: ToggleGroupItemProps) {
  const context = React.useContext(ToggleGroupContext)
  const resolvedVariant = variant ?? context.variant ?? "default"
  const resolvedSize = size ?? context.size ?? "default"

  return (
    <Toggle
      data-slot="toggle-group-item"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      data-spacing={context.spacing}
      variant={resolvedVariant}
      size={resolvedSize}
      className={cn(
        "shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        className
      )}
      {...props}
    >
      {children}
    </Toggle>
  )
}

const ToggleGroupWithCompound = Object.assign(ToggleGroup, {
  Item: ToggleGroupItem,
  Root: HeroUIToggleButtonGroup.Root,
  Separator: HeroUIToggleButtonGroup.Separator,
})

export { ToggleGroupWithCompound as ToggleGroup, ToggleGroupItem }
