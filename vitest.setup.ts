// Vitest 全局测试环境补丁（经 vitest.config.ts test.setupFiles 注入）
//
// jsdom 未实现 ResizeObserver：HeroUI v3 ScrollShadow（use-scroll-shadow）在挂载
// 效果中会 `new ResizeObserver(...)` 监听滚动容器尺寸，任何渲染 ScrollArea /
// ScrollShadow 的组件测试在无桩环境下都会抛 ReferenceError。
// 这里提供空实现桩：滚动渐隐的可见性断言不在单测职责内（属视觉层，由 e2e 走查覆盖）。
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
