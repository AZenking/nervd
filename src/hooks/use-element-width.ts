// 元素宽度订阅 hook：为 NARROW_CONTAINER_WIDTH / SINGLE_COLUMN_WORKSPACE_WIDTH 断点判定提供像素宽度。
// 复用 use-measure（ResizeObserver + jsdom/SSR 回退 + callback ref 节点更换 + 卸载 disconnect 均已覆盖），
// 仅收窄为宽度语义；返回元组签名固定为 [ref, width]，width 初始为 0。
// 回退策略（继承 use-measure）：ResizeObserver 不存在时读一次 getBoundingClientRect 后不再监听——
// jsdom 下该值为 0，测试环境安全；真实浏览器（含 Tauri WebView）恒有 ResizeObserver。
import { useMeasure } from './use-measure';

export function useElementWidth<T extends HTMLElement>(): [
  ref: (node: T | null) => void,
  width: number,
] {
  const [ref, rect] = useMeasure<T>();
  return [ref, rect.width];
}
