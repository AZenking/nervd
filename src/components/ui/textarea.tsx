import * as React from "react"
import { TextArea as HeroUITextArea } from "@heroui/react"

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

function Textarea({
  ref,
  className,
  disabled,
  isDisabled,
  ...props
}: TextareaProps) {
  return (
    <HeroUITextArea
      ref={ref}
      data-slot="textarea"
      isDisabled={isDisabled ?? disabled}
      // 尺寸与字号由 theme.css 的 `.textarea` 统一承载（保底 64px / 13px）
      className={className}
      {...(props as any)}
    />
  )
}

const TextareaWithCompound = Object.assign(Textarea, {
  Root: HeroUITextArea.Root,
})

export { TextareaWithCompound as Textarea }
