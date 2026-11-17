import { Toolbar as HeroUIToolbar } from "@heroui/react"

/**
 * HeroUI Toolbar 薄封装（行内操作组：列表行/详情头/工具条）。
 * 间距、圆角、分隔由 HeroUI `orientation` / `isAttached` 与 theme.css 决定，
 * 调用点不再自绘 `flex items-center gap-*` 容器后逐个补按钮样式。
 */
const Toolbar = Object.assign(HeroUIToolbar, {
  Root: HeroUIToolbar,
})

export { Toolbar }
export type { ToolbarProps } from "@heroui/react"