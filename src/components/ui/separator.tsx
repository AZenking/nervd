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
        // 底色 / 粗细交回上游 `.separator`（theme.css 已把 --separator 对齐 hairline），
        // 这里只保留主轴自适应的结构性约束
        "shrink-0 data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
