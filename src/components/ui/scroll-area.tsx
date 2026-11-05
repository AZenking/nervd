import * as React from "react"
import { ScrollShadow } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface ScrollAreaProps
  extends React.ComponentPropsWithRef<typeof ScrollShadow> {
  orientation?: "vertical" | "horizontal"
}

function ScrollArea({
  className,
  children,
  orientation = "vertical",
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollShadow
      data-slot="scroll-area"
      orientation={orientation}
      className={cn("relative overflow-auto", className)}
      {...props}
    >
      {children}
    </ScrollShadow>
  )
}

export interface ScrollBarProps extends React.ComponentProps<"div"> {
  orientation?: "vertical" | "horizontal"
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollBarProps) {
  return (
    <div
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      className={cn("hidden", className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { ScrollArea, ScrollBar }
