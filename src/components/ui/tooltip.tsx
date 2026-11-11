import * as React from "react"
import { Tooltip as TooltipHero } from "@heroui/react"
import { cn } from "@/lib/utils"

type TooltipSide = "top" | "bottom" | "left" | "right"
type TooltipAlign = "start" | "center" | "end"

function resolveTooltipPlacement(side?: TooltipSide, align?: TooltipAlign) {
  if (!side) return undefined
  if (!align || align === "center") return side
  return `${side} ${align}` as const
}

function TooltipProvider({
  children,
  delay: _delay,
}: {
  children?: React.ReactNode
  delay?: number
}) {
  return <>{children}</>
}

interface TooltipProps {
  open?: boolean
  isOpen?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  delay?: number
  closeDelay?: number
  children?: React.ReactNode
}

function Tooltip({
  open,
  isOpen,
  defaultOpen,
  onOpenChange,
  delay,
  children,
  ...props
}: TooltipProps & Omit<React.ComponentPropsWithoutRef<typeof TooltipHero>, "isOpen" | "defaultOpen" | "onOpenChange">) {
  const controlledOpen = open !== undefined ? open : isOpen
  return (
    <TooltipHero
      isOpen={controlledOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      delay={delay}
      {...props}
    >
      {children}
    </TooltipHero>
  )
}

type TooltipTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.HTMLAttributes<HTMLDivElement> & {
    render?: any
    ref?: React.Ref<any>
  }

function mergeRefs<T>(...refs: (React.Ref<T> | undefined | null)[]): React.RefCallback<T> {
  return (node: T | null) => {
    for (const r of refs) {
      if (!r) continue
      if (typeof r === "function") {
        r(node)
      } else if (typeof r === "object" && "current" in r) {
        ;(r as any).current = node
      }
    }
  }
}

function composeEventHandlers<E extends React.SyntheticEvent | Event>(
  ...handlers: (((event: E) => void) | undefined)[]
) {
  return (event: E) => {
    for (const handler of handlers) {
      if (handler) {
        handler(event)
      }
    }
  }
}

const INHERENTLY_INTERACTIVE_TAGS = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
])

function TooltipTrigger({
  className,
  children,
  render,
  ref,
  ...props
}: TooltipTriggerProps) {
  if (render) {
    return (
      <TooltipHero.Trigger
        {...(props as any)}
        className={className}
        render={(domProps: any) => {
          // HeroUI TooltipHero.Trigger calls useFocusable({}, triggerRef) internally and supplies
          // triggerRef inside domProps.ref to this custom render prop. By connecting domProps.ref
          // to the rendered element, HeroUI / React Aria successfully identifies the anchor element
          // for Tooltip overlay positioning, avoiding positioning at (0,0) with opacity: 0 and clip-path: inset(50%).
          const renderIsFunction = typeof render === "function"
          const renderElement = !renderIsFunction && React.isValidElement(render) ? (render as React.ReactElement<any>) : null
          const renderProps = renderElement ? (renderElement.props as Record<string, any>) : undefined
          const renderType = renderElement ? (typeof renderElement.type === "string" ? renderElement.type : "") : ""

          const mergedRef = mergeRefs(
            domProps.ref,
            ref,
            renderElement ? (renderElement as any).ref : undefined
          )

          const explicitTabIndex =
            (renderProps && "tabIndex" in renderProps ? renderProps.tabIndex : undefined) ??
            ("tabIndex" in props ? props.tabIndex : undefined)

          const resolvedTabIndex =
            explicitTabIndex !== undefined
              ? explicitTabIndex
              : INHERENTLY_INTERACTIVE_TAGS.has(renderType)
                ? domProps.tabIndex
                : undefined

          const resolvedRole =
            renderProps?.role ??
            props.role ??
            (renderType === "button"
              ? undefined
              : !INHERENTLY_INTERACTIVE_TAGS.has(renderType)
                ? undefined
                : domProps.role)

          const resolvedClassName = cn(
            domProps.className,
            className,
            renderProps?.className
          )

          const resolvedTitle = renderProps?.title ?? props.title ?? domProps.title

          const mergedHandlers = {
            onMouseEnter: composeEventHandlers(domProps.onMouseEnter, props.onMouseEnter, renderProps?.onMouseEnter),
            onMouseLeave: composeEventHandlers(domProps.onMouseLeave, props.onMouseLeave, renderProps?.onMouseLeave),
            onFocus: composeEventHandlers(domProps.onFocus, props.onFocus, renderProps?.onFocus),
            onBlur: composeEventHandlers(domProps.onBlur, props.onBlur, renderProps?.onBlur),
            onKeyDown: composeEventHandlers(domProps.onKeyDown, props.onKeyDown, renderProps?.onKeyDown),
            onKeyUp: composeEventHandlers(domProps.onKeyUp, props.onKeyUp, renderProps?.onKeyUp),
            onPointerDown: composeEventHandlers(domProps.onPointerDown, props.onPointerDown, renderProps?.onPointerDown),
            onPointerUp: composeEventHandlers(domProps.onPointerUp, props.onPointerUp, renderProps?.onPointerUp),
          }

          const resolvedChildren = renderProps?.children ?? children ?? domProps.children

          const elementProps = {
            ...domProps,
            ...props,
            ...renderProps,
            ...mergedHandlers,
            ref: mergedRef,
            "data-slot": "tooltip-trigger",
            className: resolvedClassName,
            title: resolvedTitle,
            role: resolvedRole,
            tabIndex: resolvedTabIndex,
            children: resolvedChildren,
          }

          if (renderIsFunction) {
            return render(elementProps)
          }

          return React.cloneElement(renderElement!, elementProps)
        }}
      >
        {children}
      </TooltipHero.Trigger>
    )
  }

  return (
    <TooltipHero.Trigger
      ref={ref}
      data-slot="tooltip-trigger"
      className={className}
      {...(props as any)}
    >
      {children}
    </TooltipHero.Trigger>
  )
}

interface TooltipContentProps extends React.HTMLAttributes<HTMLElement> {
  side?: TooltipSide
  align?: TooltipAlign
  sideOffset?: number
  alignOffset?: number
  placement?: any
  id?: string
  role?: string
  children?: React.ReactNode
  [key: string]: any
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  placement: placementProp,
  children,
  ...props
}: TooltipContentProps) {
  const placement = placementProp ?? resolveTooltipPlacement(side, align)
  return (
    <TooltipHero.Content
      data-slot="tooltip-content"
      placement={placement}
      offset={sideOffset}
      crossOffset={alignOffset}
      className={cn(
        "z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground duration-100",
        className
      )}
      {...(props as any)}
    >
      {children}
    </TooltipHero.Content>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
