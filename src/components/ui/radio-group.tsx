import { RadioGroup as HeroUIRadioGroup, Radio as HeroUIRadio } from "@heroui/react"

/**
 * HeroUI RadioGroup 薄封装（单选组）：选项用 `Radio`，由组统一管理方向键与 roving tabindex。
 * 业务层不再 `import { RadioGroup, Radio } from '@heroui/react'`。
 */
const RadioGroup = Object.assign(HeroUIRadioGroup, {
  Root: HeroUIRadioGroup,
  Item: HeroUIRadio,
})

const Radio = HeroUIRadio

export { RadioGroup, Radio }
export type { RadioGroupProps } from "@heroui/react"
