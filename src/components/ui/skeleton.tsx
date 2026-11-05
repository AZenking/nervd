import * as React from "react"
import { Skeleton as HeroSkeleton } from "@heroui/react"
import { cn } from "@/lib/utils"

export type SkeletonProps = React.ComponentPropsWithRef<typeof HeroSkeleton>

function Skeleton({
  className,
  animationType = "pulse",
  ...props
}: SkeletonProps) {
  return (
    // 底色交给 HeroUI .skeleton 基类（bg-surface-tertiary/70，随明暗主题切换）；
    // 勿在此追加 bg-muted —— 本主题 --muted 是文字灰，utilities 层会盖掉基类浅灰底
    <HeroSkeleton
      data-slot="skeleton"
      animationType={animationType}
      className={cn("rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
