import { TagGroup as HeroUITagGroup, Tag as HeroUITag } from "@heroui/react"

/**
 * HeroUI TagGroup 薄封装（多值标签集合，如变量占位符、筛选项）。
 * 与 `Chip` 的分工：Chip 是只读语义徽标，Tag 是可选中/可移除的集合项。
 */
const TagGroup = Object.assign(HeroUITagGroup, {
  Root: HeroUITagGroup,
  List: HeroUITagGroup.List,
})

const Tag = HeroUITag

export { TagGroup, Tag }
export type { TagGroupProps } from "@heroui/react"
