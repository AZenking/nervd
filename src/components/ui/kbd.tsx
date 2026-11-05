import { Kbd as HeroUIKbd } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface KbdProps extends React.ComponentPropsWithoutRef<typeof HeroUIKbd> {}

/**
 * HeroUI Kbd 包装：快捷键键帽统一展示原语。
 * - 默认注入 font-mono（上游 .kbd 默认 font-sans；DESIGN.md 2.3 规定快捷键标识一律等宽），
 *   调用方传 className 可覆盖（cn 后者优先）；其余 props 透传。
 * - 默认（default）：bg-default 键帽，用于独立行内提示；
 * - variant="light"：透明底，用于嵌入按钮 / 文本行内。
 */
function Kbd({ className, ...props }: KbdProps) {
  return <HeroUIKbd className={cn("font-mono", className)} {...props} />
}

export { Kbd }
