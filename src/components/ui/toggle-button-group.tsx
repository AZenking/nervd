import { ToggleButtonGroup as HeroUIToggleButtonGroup } from "@heroui/react"

/**
 * HeroUI ToggleButtonGroup 薄封装（分段选择器唯一落地件）。
 *
 * 业务层不再直连上游并拼 `rounded-* / gap / border` 版式：外缘圆角、内角直角、
 * 分段间距由 `theme.css` 的 `.toggle-button-group` 与 HeroUI `isDetached` 决定。
 * 选项用 `@/components/ui/button` 的 `ToggleButton`（`@heroui/react` 的 ToggleButton 尚未有独立出口，
 * 需要时用 `ToggleButtonGroup.Item` 的语义：`<ToggleButton id="x">文案</ToggleButton>`）。
 */
const ToggleButtonGroup = Object.assign(HeroUIToggleButtonGroup, {
  Root: HeroUIToggleButtonGroup,
  Separator: HeroUIToggleButtonGroup.Separator,
})

export { ToggleButtonGroup }
export type { ToggleButtonGroupProps } from "@heroui/react"