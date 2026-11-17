import { ProgressBar as HeroUIProgressBar } from "@heroui/react"

/**
 * HeroUI ProgressBar 薄封装（DESIGN 第一部分 Feedback：进度必须带可见数值/标签）。
 *
 * 业务层不再自绘 `div` 进度条（无 role/aria 会丢读屏进度），也不在调用点改
 * Track/Fill 的高度与圆角 —— 档位由 HeroUI `size` / `color` 变体决定。
 *
 * ```tsx
 * <ProgressBar value={62} color="accent" size="sm">
 *   <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
 * </ProgressBar>
 * ```
 */
const ProgressBar = Object.assign(HeroUIProgressBar, {
  Root: HeroUIProgressBar,
  Track: HeroUIProgressBar.Track,
  Fill: HeroUIProgressBar.Fill,
  Output: HeroUIProgressBar.Output,
})

export { ProgressBar }
export type { ProgressBarProps } from "@heroui/react"