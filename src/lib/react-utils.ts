/**
 * 极简本地 React 渲染工具，行为对齐上游 headless 库 v1.8.0 的
 * `mergeProps`（merge-props）与 `useRender`（use-render → internals/useRenderElement）。
 *
 * 仅覆盖 src/components/ui/sidebar.tsx 用到的能力路径：
 * - mergeProps(a, b)：两个普通对象合并（不支持上游库的 props-getter 函数入参，sidebar 未使用）。
 *   · 事件处理器（onXxx）：合并后外部处理器先执行、内部处理器后执行，返回外部处理器的返回值；
 *     sidebar 内部 props 仅含 className，链式分支实际不会触发。
 *   · className：合并为 `外部类名 内部类名`（外部在前，与上游库逐字节一致）。
 *   · style：浅合并，外部覆盖内部；其余属性外部直接覆盖内部。
 *   · `ref` 不做特殊合并（与上游库一致，作为普通属性由外部覆盖）。
 * - useRender({ defaultTagName, props, render, state })：
 *   · state → data-* 属性：true → `data-key=""`，truthy → 字符串化，falsy → 省略；
 *   · 外部 props.ref 与 render 元素自身 ref 合并成一个回调 ref 后挂到输出元素上；
 *   · render 为 ReactElement：cloneElement（render 自身 props 覆盖外部 props，
 *     className 拼接时 render 自身的在前，render 元素的 children 优先保留）；
 *   · render 为函数：以 (mergedProps, state) 直调并返回其结果；
 *   · 否则按 defaultTagName 渲染（button 默认补 type="button"，img 默认补 alt=""，
 *     外部显式传入时覆盖默认值）。
 */
import * as React from "react"

type AnyProps = Record<string, any>

/* --------------------------------- mergeProps --------------------------------- */

function mergeObjects(
  a: AnyProps | null | undefined,
  b: AnyProps | null | undefined
): AnyProps | undefined {
  if (a && !b) return a
  if (!a && b) return b
  if (a || b) return { ...a, ...b }
  return undefined
}

function mergeClassNames(ourClassName: unknown, theirClassName: unknown): unknown {
  if (theirClassName) {
    return ourClassName ? `${theirClassName} ${ourClassName}` : theirClassName
  }
  return ourClassName
}

function isEventHandler(key: string, value: unknown): boolean {
  // 'o'(111) 'n'(110) + 第三个字符为大写字母（如 onClick、onOpenChange），且值为函数/undefined。
  return (
    key.charCodeAt(0) === 111 /* o */ &&
    key.charCodeAt(1) === 110 /* n */ &&
    key.charCodeAt(2) >= 65 /* A */ &&
    key.charCodeAt(2) <= 90 /* Z */ &&
    (typeof value === "function" || typeof value === "undefined")
  )
}

function mergeEventHandlers(ourHandler: unknown, theirHandler: unknown): unknown {
  if (!theirHandler) return ourHandler
  if (!ourHandler) return theirHandler
  return (...args: unknown[]) => {
    const result = (theirHandler as (...cbArgs: unknown[]) => unknown)(...args)
    ;(ourHandler as (...cbArgs: unknown[]) => void)(...args)
    return result
  }
}

export function mergeProps<A extends AnyProps = AnyProps, B extends AnyProps = A>(
  a?: A,
  b?: B
): A & B {
  const merged: AnyProps = { ...a }
  if (!b) return merged as A & B
  for (const key in b) {
    const value = (b as AnyProps)[key]
    switch (key) {
      case "style":
        merged.style = mergeObjects(merged.style, value)
        break
      case "className":
        merged.className = mergeClassNames(merged.className, value)
        break
      default:
        merged[key] = isEventHandler(key, value)
          ? mergeEventHandlers(merged[key], value)
          : value
    }
  }
  return merged as A & B
}

/* ---------------------------------- useRender --------------------------------- */

export type UseRenderRenderProp =
  | React.ReactElement
  | ((props: AnyProps, state: AnyProps) => React.ReactElement)

export type UseRenderParameters = {
  /** 无 render 时渲染的元素标签，缺省 "div" */
  defaultTagName?: keyof React.JSX.IntrinsicElements
  /** 透传到渲染元素上的 props */
  props?: AnyProps
  /** 用 ReactElement 或渲染函数覆盖默认元素 */
  render?: UseRenderRenderProp
  /** 状态对象，自动转换为 data-* 属性 */
  state?: Record<string, unknown>
}

export namespace useRender {
  export type ComponentProps<T extends React.ElementType> =
    React.ComponentPropsWithRef<T> & {
      render?: UseRenderRenderProp
    }
}

function getStateAttributesProps(state?: Record<string, unknown>): AnyProps {
  const props: AnyProps = {}
  if (!state) return props
  for (const key in state) {
    const value = state[key]
    if (value === true) {
      props[`data-${key.toLowerCase()}`] = ""
    } else if (value) {
      props[`data-${key.toLowerCase()}`] = String(value)
    }
  }
  return props
}

function getReactElementRef(element: unknown): React.Ref<any> | null {
  if (!React.isValidElement(element)) return null
  // React 19：ref 是元素的普通 prop
  return (element.props as AnyProps)?.ref ?? null
}

/** 把两个 ref 合并为一个回调 ref（对齐上游库 useMergedRefs 的核心语义） */
function useMergedRefs(
  a: React.Ref<any> | null | undefined,
  b: React.Ref<any> | null | undefined
) {
  const cleanupRef = React.useRef<(() => void) | null>(null)
  const refsRef = React.useRef([a, b])
  if (refsRef.current[0] !== a || refsRef.current[1] !== b) {
    refsRef.current = [a, b]
  }
  const refs = refsRef.current
  return React.useCallback((instance: unknown) => {
    const cleanup = cleanupRef.current
    if (cleanup) {
      cleanup()
      cleanupRef.current = null
    }
    if (instance == null) return
    const cleanups: Array<() => void> = []
    for (const ref of refs) {
      if (ref == null) continue
      if (typeof ref === "function") {
        const returned = ref(instance)
        if (typeof returned === "function") {
          cleanups.push(returned)
        } else {
          // 传统回调 ref：卸载时以 null 回调
          cleanups.push(() => {
            ref(null)
          })
        }
      } else {
        ;(ref as React.RefObject<unknown>).current = instance
        cleanups.push(() => {
          ;(ref as React.RefObject<unknown>).current = null
        })
      }
    }
    cleanupRef.current = () => {
      for (const c of cleanups) c()
    }
  }, refs)
}

export function useRender(params: UseRenderParameters): React.ReactElement {
  const { render, defaultTagName = "div", props: otherProps, state } = params

  // 与上游库一致：外部 props.ref 与 render 元素自身 ref 合并后再挂到输出元素上
  const mergedRef = useMergedRefs(
    otherProps?.ref as React.Ref<any> | undefined,
    getReactElementRef(render)
  )

  const outProps: AnyProps = {
    ...getStateAttributesProps(state),
    ...otherProps,
  }
  outProps.ref = mergedRef

  if (render) {
    if (typeof render === "function") {
      return render(outProps, (state ?? {}) as AnyProps)
    }
    // render 是元素：其自身 props 覆盖外部 props（className 拼接时 render 自身的在前），
    // 最终 ref 以合并 ref 为准（render 元素自身 ref 已并入 mergedRef）。
    const mergedProps = mergeProps(outProps, render.props as AnyProps)
    mergedProps.ref = outProps.ref
    return React.cloneElement(render, mergedProps)
  }

  if (defaultTagName === "button") {
    return React.createElement("button", { type: "button", ...outProps, key: outProps.key })
  }
  if (defaultTagName === "img") {
    return React.createElement("img", { alt: "", ...outProps, key: outProps.key })
  }
  return React.createElement(defaultTagName, outProps)
}
