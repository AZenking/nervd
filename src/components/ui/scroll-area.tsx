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
      // overflow 轴向与 ScrollShadow orientation 严格一致：既不依赖组件层默认值，
      // 也不会以双向 overflow-auto 覆盖调用方传入的 overflow-x-hidden 等单轴约束
      className={cn(
        "relative",
        orientation === "horizontal" ? "overflow-x-auto" : "overflow-y-auto",
        className
      )}
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
