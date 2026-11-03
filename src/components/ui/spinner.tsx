import * as React from "react"
import { Spinner as HeroSpinner } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface SpinnerProps
  extends React.ComponentPropsWithRef<typeof HeroSpinner> {}

function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <HeroSpinner
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 inline-flex items-center justify-center", className)}
      {...props}
    />
  )
}

export { Spinner }
