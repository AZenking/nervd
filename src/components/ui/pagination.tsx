import { Pagination as HeroUIPagination } from "@heroui/react"

/**
 * HeroUI Pagination 薄封装（DESIGN 第三部分 B：列表分页唯一落地件）。
 *
 * 业务层不再直连上游并在调用点拼 20 行版式；页脚密度、分隔线、字号由 `theme.css`
 * 的 `.pagination*` 承载。部件与 HeroUI 同名，按 parts 组合：
 *
 * ```tsx
 * <Pagination size="sm" aria-label="列表分页">
 *   <Pagination.Summary>第 1-30 条，共 120 条</Pagination.Summary>
 *   <Pagination.Content>
 *     <Pagination.Item><Pagination.Previous onPress={prev} /></Pagination.Item>
 *     <Pagination.Item><Pagination.Link isActive onPress={() => go(1)}>1</Pagination.Link></Pagination.Item>
 *     <Pagination.Item><Pagination.Next onPress={next} /></Pagination.Item>
 *   </Pagination.Content>
 * </Pagination>
 * ```
 */
const Pagination = Object.assign(HeroUIPagination, {
  Root: HeroUIPagination,
  Content: HeroUIPagination.Content,
  Item: HeroUIPagination.Item,
  Link: HeroUIPagination.Link,
  Previous: HeroUIPagination.Previous,
  PreviousIcon: HeroUIPagination.PreviousIcon,
  Next: HeroUIPagination.Next,
  NextIcon: HeroUIPagination.NextIcon,
  Ellipsis: HeroUIPagination.Ellipsis,
  Summary: HeroUIPagination.Summary,
})

export { Pagination }
export type { PaginationProps } from "@heroui/react"