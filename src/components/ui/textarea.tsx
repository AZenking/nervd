import * as React from "react"
import { TextArea as HeroUITextArea } from "@heroui/react"
import { cn } from '@/lib/utils'

type BaseHeroUITextAreaProps = Omit<
  React.ComponentPropsWithRef<typeof HeroUITextArea>,
  "className"
>

export type TextareaProps = BaseHeroUITextAreaProps &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, keyof BaseHeroUITextAreaProps | "className"> & {
    className?: string
    disabled?: boolean
    isDisabled?: boolean
  }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, disabled, isDisabled, ...props }, ref) => {
    return (
      <HeroUITextArea
        ref={ref}
        data-slot="textarea"
        isDisabled={isDisabled ?? disabled}
        className={cn("min-h-16 text-[13px]", className)}
        {...(props as any)}
      />
    )
  }
)
Textarea.displayName = "Textarea"

const TextareaWithCompound = Object.assign(Textarea, {
  Root: HeroUITextArea.Root,
})

export { TextareaWithCompound as Textarea }
