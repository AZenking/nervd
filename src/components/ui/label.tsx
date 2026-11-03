import * as React from "react"
import { Label as HeroUILabel } from "@heroui/react"
import { cn } from '@/lib/utils'

type BaseHeroUILabelProps = Omit<
  React.ComponentPropsWithRef<typeof HeroUILabel>,
  "className"
>

export type LabelProps = BaseHeroUILabelProps &
  Omit<React.LabelHTMLAttributes<HTMLLabelElement>, keyof BaseHeroUILabelProps | "className"> & {
    className?: string
    disabled?: boolean
    isDisabled?: boolean
  }

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, disabled, isDisabled, ...props }, ref) => {
    return (
      <HeroUILabel
        ref={ref}
        data-slot="label"
        isDisabled={isDisabled ?? disabled}
        className={cn(
          "flex items-center gap-2 text-[13px] leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          className
        )}
        {...(props as any)}
      />
    )
  }
)
Label.displayName = "Label"

const LabelWithCompound = Object.assign(Label, {
  Root: HeroUILabel.Root,
})

export { LabelWithCompound as Label }
