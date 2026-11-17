import * as React from "react"
import { Spinner as HeroSpinner } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface SpinnerProps
  extends React.ComponentPropsWithRef<typeof HeroSpinner> {}

function Spinner({ className, size = "sm", ...props }: SpinnerProps) {
  return (
    <HeroSpinner
      data-slot="spinner"
      role="status"
      aria-label="加载中"
      size={size}
      className={cn("inline-flex items-center justify-center", className)}
      {...props}
    />
  )
}

export { Spinner }
