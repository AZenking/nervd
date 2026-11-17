import { Surface as HeroUISurface } from "@heroui/react"

/**
 * HeroUI Surface 薄封装：非浮层容器的语义面（DESIGN 第一部分 Card/Surfaces）。
 * 变体交回 HeroUI（default / secondary / tertiary / transparent），调用点只传布局类。
 */
const Surface = Object.assign(HeroUISurface, {
  Root: HeroUISurface,
})

export { Surface }
export type { SurfaceProps, SurfaceVariants } from "@heroui/react"