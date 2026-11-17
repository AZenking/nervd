import { Accordion as HeroUIAccordion } from "@heroui/react"

/**
 * HeroUI Accordion 薄封装（DESIGN 第三部分 B：可折叠区块）。
 * 触发器底色 / hover 由 `theme.css` 的 `.accordion__trigger` 统一承载，
 * 业务层不再自绘折叠头，也不再用 `<details>`。
 */
const Accordion = Object.assign(HeroUIAccordion, {
  Root: HeroUIAccordion,
  Item: HeroUIAccordion.Item,
  Heading: HeroUIAccordion.Heading,
  Trigger: HeroUIAccordion.Trigger,
  Indicator: HeroUIAccordion.Indicator,
  Panel: HeroUIAccordion.Panel,
  Body: HeroUIAccordion.Body,
})

export { Accordion }
export type { AccordionProps } from "@heroui/react"