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

function TooltipTrigger({
  className,
  children,
  render,
  ref,
  ...props
}: TooltipTriggerProps) {
  if (render) {
    if (typeof render === "function") {
      return render({ ref, "data-slot": "tooltip-trigger", ...props, className })
    }
    if (React.isValidElement(render)) {
      return React.cloneElement(render as React.ReactElement<any>, {
        ref,
        "data-slot": "tooltip-trigger",
        ...props,
        className: cn((render.props as { className?: string }).className, className),
        children: (render.props as { children?: React.ReactNode }).children ?? children,
      })
    }
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
        "z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md duration-100",
        className
      )}
      {...(props as any)}
    >
      {children}
    </TooltipHero.Content>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
