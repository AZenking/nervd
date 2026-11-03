"use client"

import * as React from "react"
import { ToggleButton as HeroUIToggleButton } from "@heroui/react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from '@/lib/utils'

const toggleVariants = cva(
  "",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-border bg-transparent hover:bg-foreground/5",
      },
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type BaseHeroUIToggleButtonProps = Omit<
  React.ComponentPropsWithRef<typeof HeroUIToggleButton>,
  "variant" | "size" | "color" | "className" | "children"
>

export type ToggleProps = BaseHeroUIToggleButtonProps &
  VariantProps<typeof toggleVariants> & {
    className?: string
    disabled?: boolean
    pressed?: boolean
    defaultPressed?: boolean
    onPressedChange?: (pressed: boolean) => void
    title?: string
    id?: string
    children?: React.ReactNode
  } & Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    keyof BaseHeroUIToggleButtonProps | "children" | "className" | "color"
  >

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      pressed,
      defaultPressed,
      onPressedChange,
      onChange,
      disabled,
      isDisabled,
      isSelected,
      defaultSelected,
      children,
      ...props
    },
    ref
  ) => {
    const effectiveSelected = isSelected ?? pressed
    const effectiveDefaultSelected = defaultSelected ?? defaultPressed
    const effectiveDisabled = isDisabled ?? disabled

    const herouiSize: "sm" | "md" | "lg" =
      size === "lg" ? "lg" : "sm"

    const herouiVariant: "default" | "ghost" =
      variant === "outline" || variant === "default" ? "ghost" : "default"

    const handleChange = (selected: boolean) => {
      onChange?.(selected)
      onPressedChange?.(selected)
    }

    return (
      <HeroUIToggleButton
        ref={ref}
        data-slot="toggle"
        variant={herouiVariant}
        size={herouiSize}
        isSelected={effectiveSelected}
        defaultSelected={effectiveDefaultSelected}
        isDisabled={effectiveDisabled}
        onChange={handleChange}
        className={cn(toggleVariants({ variant, size }), className)}
        {...(props as any)}
      >
        {children}
      </HeroUIToggleButton>
    )
  }
)
Toggle.displayName = "Toggle"

const ToggleWithCompound = Object.assign(Toggle, {
  Root: HeroUIToggleButton.Root,
})

export { ToggleWithCompound as Toggle, toggleVariants }
