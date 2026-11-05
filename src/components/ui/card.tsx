import { Card as HeroUICard } from "@heroui/react"

/**
 * HeroUI 原生复合卡片组件
 * 提供 `<Card>`, `<Card.Header>`, `<Card.Title>`, `<Card.Description>`, `<Card.Content>`, `<Card.Footer>`
 * 支持 variant: "default" | "secondary" | "tertiary" | "transparent"
 * 零自定义 CSS 复写，完全遵循 HeroUI v3 设计系统规范
 */
const Card = Object.assign(HeroUICard, {
  Root: HeroUICard,
  Header: HeroUICard.Header,
  Title: HeroUICard.Title,
  Description: HeroUICard.Description,
  Content: HeroUICard.Content,
  Footer: HeroUICard.Footer,
})

const CardHeader = HeroUICard.Header
const CardTitle = HeroUICard.Title
const CardDescription = HeroUICard.Description
const CardContent = HeroUICard.Content
const CardFooter = HeroUICard.Footer

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
}
