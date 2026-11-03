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
    <HeroSkeleton
      data-slot="skeleton"
      animationType={animationType}
      className={cn("rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
