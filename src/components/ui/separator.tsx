import * as React from "react"
import { Separator as HeroSeparator } from "@heroui/react"
import { cn } from "@/lib/utils"

export type SeparatorProps = React.ComponentPropsWithRef<typeof HeroSeparator>

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorProps) {
  return (
    <HeroSeparator
      data-slot="separator"
      orientation={orientation}
      data-horizontal={orientation === "horizontal" ? "" : undefined}
      data-vertical={orientation === "vertical" ? "" : undefined}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
