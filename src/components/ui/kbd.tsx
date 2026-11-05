import { Kbd as HeroUIKbd } from "@heroui/react"

export interface KbdProps extends React.ComponentPropsWithoutRef<typeof HeroUIKbd> {}

/**
 * HeroUI Kbd 薄封装：快捷键键帽统一展示原语。
 * - 默认（default）：bg-default 键帽，用于独立行内提示；
 * - variant="light"：透明底，用于嵌入按钮 / 文本行内。
 */
const Kbd = HeroUIKbd

export { Kbd }
