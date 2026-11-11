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

function Input({
  ref,
  className,
  type,
  disabled,
  isDisabled,
  onKeyDown,
  onKeyUp,
  ...props
}: InputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    // 阻止输入法组合状态 (IME) 及空格键事件向上冒泡，防止被父级容器或全局快捷键监听器拦截/吞噬
    if (e.nativeEvent.isComposing || (e as any).isComposing || e.key === ' ' || e.key === 'Spacebar') {
      e.stopPropagation()
    }
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyUp?.(e)
    if (e.defaultPrevented) return
    if (e.nativeEvent.isComposing || (e as any).isComposing || e.key === ' ' || e.key === 'Spacebar') {
      e.stopPropagation()
    }
  }

  return (
    <HeroUIInput
      ref={ref}
      type={type}
      data-slot="input"
      isDisabled={isDisabled ?? disabled}
      className={cn("h-8 text-[13px]", className)}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      {...(props as any)}
    />
  )
}

function InputRoot({
  onKeyDown,
  onKeyUp,
  ...props
}: React.ComponentPropsWithRef<typeof HeroUIInput.Root>) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (e.nativeEvent.isComposing || (e as any).isComposing || e.key === ' ' || e.key === 'Spacebar') {
      e.stopPropagation()
    }
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyUp?.(e)
    if (e.defaultPrevented) return
    if (e.nativeEvent.isComposing || (e as any).isComposing || e.key === ' ' || e.key === 'Spacebar') {
      e.stopPropagation()
    }
  }

  return (
    <HeroUIInput.Root
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      {...props}
    />
  )
}

const InputWithCompound = Object.assign(Input, {
  Root: InputRoot,
})

export { InputWithCompound as Input }
