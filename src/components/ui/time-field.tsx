import { TimeField as HeroUITimeField } from "@heroui/react"

/**
 * HeroUI TimeField 薄封装（时间输入，RAC 自带段位编辑 / IME / 键盘语义）。
 * `TimeValue` 等领域类型由调用方从 `react-aria-components` 取，不在包装层重复定义。
 */
const TimeField = Object.assign(HeroUITimeField, {
  Root: HeroUITimeField,
  Group: HeroUITimeField.Group,
  Input: HeroUITimeField.Input,
  Segment: HeroUITimeField.Segment,
  Prefix: HeroUITimeField.Prefix,
  Suffix: HeroUITimeField.Suffix,
})

export { TimeField }
export type { TimeFieldProps } from "@heroui/react"
