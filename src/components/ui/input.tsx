import * as React from "react"
import { Input as HeroUIInput } from "@heroui/react"
import { cn } from '@/lib/utils'

type BaseHeroUIInputProps = Omit<
  React.ComponentPropsWithRef<typeof HeroUIInput>,
  "className" | "size"
>

export type InputProps = BaseHeroUIInputProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, keyof BaseHeroUIInputProps | "className" | "size"> & {
    className?: string
    size?: number | string
    disabled?: boolean
    isDisabled?: boolean
  }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, disabled, isDisabled, ...props }, ref) => {
    return (
      <HeroUIInput
        ref={ref}
        type={type}
        data-slot="input"
        isDisabled={isDisabled ?? disabled}
        className={cn("h-8 text-[13px]", className)}
        {...(props as any)}
      />
    )
  }
)
Input.displayName = "Input"

const InputWithCompound = Object.assign(Input, {
  Root: HeroUIInput.Root,
})

export { InputWithCompound as Input }
