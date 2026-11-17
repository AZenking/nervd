import { ToggleButton as HeroUIToggleButton } from "@heroui/react"

/**
 * HeroUI ToggleButton 薄封装（可切换的单段控件）。
 * 分组成组用 `@/components/ui/toggle-button-group`；尺寸/变体走 HeroUI `size`/`variant`。
 */
const ToggleButton = Object.assign(HeroUIToggleButton, {
  Root: HeroUIToggleButton,
})

export { ToggleButton }
export type { ToggleButtonProps } from "@heroui/react"
