import * as React from "react"
import { Popover as PopoverHero } from "@heroui/react"
import { cn } from "@/lib/utils"

interface PopoverProps {
  open?: boolean
  isOpen?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function Popover({
  open,
  isOpen,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: PopoverProps & Omit<React.ComponentPropsWithoutRef<typeof PopoverHero>, "isOpen" | "defaultOpen" | "onOpenChange">) {
  const controlledOpen = open !== undefined ? open : isOpen
  return (
    <PopoverHero
      isOpen={controlledOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      {...props}
    >
      {children}
    </PopoverHero>
  )
}

type PopoverTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.HTMLAttributes<HTMLDivElement> & {
    render?: any
  }

function PopoverTrigger({
  className,
  children,
  render,
  ...props
}: PopoverTriggerProps) {
  if (render) {
    if (typeof render === "function") {
      return render({ "data-slot": "popover-trigger", ...props, className })
    }
    if (React.isValidElement(render)) {
      return React.cloneElement(render as React.ReactElement<any>, {
        "data-slot": "popover-trigger",
        ...props,
        className: cn((render.props as { className?: string }).className, className),
        children: (render.props as { children?: React.ReactNode }).children ?? children,
      })
    }
  }
  return (
    <PopoverHero.Trigger
      data-slot="popover-trigger"
      className={className}
      {...(props as any)}
    >
      {children}
    </PopoverHero.Trigger>
  )
}

type PopoverSide = "top" | "bottom" | "left" | "right"
type PopoverAlign = "start" | "center" | "end"

function resolvePopoverPlacement(side?: PopoverSide, align?: PopoverAlign) {
  if (!side) return undefined
  if (!align || align === "center") return side
  return `${side} ${align}` as const
}

type PopoverContentProps = React.HTMLAttributes<HTMLDivElement> & {
  align?: PopoverAlign
  alignOffset?: number
  side?: PopoverSide
  sideOffset?: number
  placement?: any
  children?: React.ReactNode
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  placement: placementProp,
  children,
  ...props
}: PopoverContentProps) {
  const placement = placementProp ?? resolvePopoverPlacement(side, align)
  return (
    <PopoverHero.Content
      data-slot="popover-content"
      placement={placement}
      offset={sideOffset}
      crossOffset={alignOffset}
      className={cn(
        "z-50 flex w-72 flex-col gap-1 rounded-lg border border-border bg-popover p-1 text-[13px] text-popover-foreground outline-hidden duration-100",
        className
      )}
      {...(props as any)}
    >
      <PopoverHero.Dialog className="outline-none">
        {children}
      </PopoverHero.Dialog>
    </PopoverHero.Content>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 px-2 pt-1.5 text-[13px]", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<typeof PopoverHero.Heading>) {
  return (
    <PopoverHero.Heading
      data-slot="popover-title"
      className={cn("text-[13px] font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
