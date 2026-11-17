import { Kbd as HeroUIKbd } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface KbdProps extends React.ComponentPropsWithoutRef<typeof HeroUIKbd> {
  /** 键帽密度档：xs 用于表格/徽标行内，sm 为默认 */
  size?: "xs" | "sm"
}

/**
 * HeroUI Kbd 包装：快捷键键帽统一展示原语。
 * - 等宽字体由 theme.css 的 `.kbd` 统一注入（DESIGN §2.3 快捷键标识一律等宽），
 *   调用点不再写 `font-mono`；
 * - 密度走 `size` 档（xs：表格/徽标行内；sm：默认），不再用 `h-5! px-1.5! text-[11px]!` 覆写；
 * - 其余 props 透传。
 */
function Kbd({ className, size = "sm", ...props }: KbdProps) {
  return (
    <HeroUIKbd
      data-slot="kbd"
      data-size={size}
      className={cn(size === "xs" && "kbd--xs", className)}
      {...props}
    />
  )
}

export { Kbd }