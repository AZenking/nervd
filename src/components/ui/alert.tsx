import { Alert as HeroUIAlert } from "@heroui/react"

/**
 * HeroUI Alert 薄封装（DESIGN 第一部分「Status: 用语义状态色，且与文本配对」）。
 *
 * 业务层不再直接 `import { Alert } from '@heroui/react'`，也不再在调用点写
 * `className="rounded-md px-2.5 py-2 shadow-none"`：紧凑密度与圆角由 theme.css 承载。
 *
 * 用法：
 * ```tsx
 * <Alert status="danger">
 *   <Alert.Indicator />
 *   <Alert.Content>
 *     <Alert.Title>CI 查询失败</Alert.Title>
 *     <Alert.Description>{message}</Alert.Description>
 *   </Alert.Content>
 * </Alert>
 * ```
 */
const Alert = Object.assign(HeroUIAlert, {
  Root: HeroUIAlert,
  Indicator: HeroUIAlert.Indicator,
  Content: HeroUIAlert.Content,
  Title: HeroUIAlert.Title,
  Description: HeroUIAlert.Description,
})

export { Alert }
export type { AlertProps, AlertRootProps } from "@heroui/react"