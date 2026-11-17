import { ButtonGroup as HeroUIButtonGroup } from "@heroui/react"

/**
 * HeroUI ButtonGroup 薄封装（相邻操作组唯一落地件）：
 * 分组内按钮的圆角合并（外缘 6px / 内角直角）由 theme.css 的
 * `.button-group .button` 规则承载，调用点只传语义变体与 `size` 档，
 * 不再自绘 `flex items-center gap-*` 容器逐个补样式。
 */
const ButtonGroup = Object.assign(HeroUIButtonGroup, {
  Root: HeroUIButtonGroup,
  Separator: HeroUIButtonGroup.Separator,
})

export { ButtonGroup }
export type { ButtonGroupProps } from "@heroui/react"