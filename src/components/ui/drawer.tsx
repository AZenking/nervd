import * as React from "react"
import { Drawer as DrawerHero } from "@heroui/react"
import { cn } from "@/lib/utils"

type DrawerPlacement = "top" | "bottom" | "left" | "right"

interface DrawerContextProps {
  placement: DrawerPlacement
  modal?: boolean
  showSwipeHandle?: boolean
}

const DrawerContext = React.createContext<DrawerContextProps>({
  placement: "right",
  modal: true,
  showSwipeHandle: false,
})

function useDrawer() {
  return React.useContext(DrawerContext)
}

interface DrawerProps {
  open?: boolean
  isOpen?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details?: any) => void
  placement?: DrawerPlacement
  swipeDirection?: "down" | "up" | "left" | "right"
  modal?: boolean
  showSwipeHandle?: boolean
  snapPoints?: number[]
  children?: React.ReactNode
}

function Drawer({
  open,
  isOpen,
  defaultOpen,
  onOpenChange,
  placement: placementProp,
  swipeDirection = "right",
  modal = true,
  showSwipeHandle = false,
  snapPoints: _snapPoints,
  children,
  ...props
}: DrawerProps & Omit<React.ComponentPropsWithoutRef<typeof DrawerHero>, "isOpen" | "defaultOpen" | "onOpenChange">) {
  const controlledOpen = open !== undefined ? open : isOpen

  let placement: DrawerPlacement = "right"
  if (placementProp) {
    placement = placementProp
  } else if (swipeDirection === "left") {
    placement = "left"
  } else if (swipeDirection === "up") {
    placement = "top"
  } else if (swipeDirection === "down") {
    placement = "bottom"
  }

  const contextValue = React.useMemo(
    () => ({ placement, modal, showSwipeHandle }),
    [placement, modal, showSwipeHandle]
  )

  return (
    <DrawerContext.Provider value={contextValue}>
      <DrawerHero
        isOpen={controlledOpen}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        {...props}
      >
        {children}
      </DrawerHero>
    </DrawerContext.Provider>
  )
}

type DrawerTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.HTMLAttributes<HTMLDivElement> & {
    render?: any
    asChild?: boolean
  }

function DrawerTrigger({
  className,
  children,
  render,
  asChild: _asChild,
  ...props
}: DrawerTriggerProps) {
  if (render) {
    if (typeof render === "function") {
      return render({ "data-slot": "drawer-trigger", ...props, className })
    }
    if (React.isValidElement(render)) {
      return React.cloneElement(render as React.ReactElement<any>, {
        "data-slot": "drawer-trigger",
        ...props,
        className: cn((render.props as { className?: string }).className, className),
        children: (render.props as { children?: React.ReactNode }).children ?? children,
      })
    }
  }
  return (
    <DrawerHero.Trigger
      data-slot="drawer-trigger"
      className={className}
      {...(props as any)}
    >
      {children}
    </DrawerHero.Trigger>
  )
}

function DrawerPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

type DrawerCloseProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  render?: any
  asChild?: boolean
}

function DrawerClose({
  className,
  children,
  render,
  asChild: _asChild,
  ...props
}: DrawerCloseProps) {
  if (render) {
    if (typeof render === "function") {
      return render({ "data-slot": "drawer-close", ...props, className })
    }
    if (React.isValidElement(render)) {
      return React.cloneElement(render as React.ReactElement<any>, {
        "data-slot": "drawer-close",
        ...props,
        className: cn((render.props as { className?: string }).className, className),
        children: (render.props as { children?: React.ReactNode }).children ?? children,
      })
    }
  }
  return (
    <DrawerHero.CloseTrigger
      data-slot="drawer-close"
      className={className}
      {...(props as any)}
    >
      {children}
    </DrawerHero.CloseTrigger>
  )
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DrawerHero.Backdrop>) {
  return (
    <DrawerHero.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 min-h-dvh bg-black/40 duration-200",
        className
      )}
      {...props}
    />
  )
}

function DrawerSwipeHandle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-swipe-handle"
      aria-hidden="true"
      className={cn("relative z-10 flex shrink-0 cursor-grab items-center justify-center p-2", className)}
      {...props}
    >
      <div className="h-1.5 w-12 rounded-full bg-muted" />
    </div>
  )
}

interface DrawerContentProps extends Omit<React.ComponentPropsWithoutRef<typeof DrawerHero.Dialog>, "children"> {
  placement?: DrawerPlacement
  showSwipeHandle?: boolean
  children?: React.ReactNode | ((opts: any) => React.ReactNode)
}

function DrawerContent({
  className,
  children,
  placement: placementProp,
  showSwipeHandle: showSwipeHandleProp,
  ...props
}: DrawerContentProps) {
  const { placement: ctxPlacement, showSwipeHandle: ctxShowSwipeHandle, modal } = useDrawer()
  const placement = placementProp ?? ctxPlacement
  const showSwipeHandle = showSwipeHandleProp ?? ctxShowSwipeHandle

  return (
    <DrawerHero.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 min-h-dvh bg-black/40 duration-200",
        modal === false && "pointer-events-none bg-transparent"
      )}
    >
      <DrawerHero.Content placement={placement}>
        <DrawerHero.Dialog
          data-slot="drawer-popup"
          data-placement={placement}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full flex-col border-l border-border bg-popover text-[13px] text-popover-foreground shadow-level-2 outline-none",
            className
          )}
          {...props}
        >
          {showSwipeHandle && <DrawerSwipeHandle />}
          <div data-slot="drawer-content" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {typeof children === "function" ? (children as any) : children}
          </div>
        </DrawerHero.Dialog>
      </DrawerHero.Content>
    </DrawerHero.Backdrop>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<typeof DrawerHero.Header>) {
  return (
    <DrawerHero.Header
      data-slot="drawer-header"
      className={cn(
        "flex shrink-0 flex-col gap-0.5 p-4 pb-0 text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<typeof DrawerHero.Footer>) {
  return (
    <DrawerHero.Footer
      data-slot="drawer-footer"
      className={cn("mt-auto flex shrink-0 flex-col gap-2 p-4 pt-0", className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerHero.Heading>) {
  return (
    <DrawerHero.Heading
      data-slot="drawer-title"
      className={cn(
        "text-base font-semibold text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="drawer-description"
      className={cn("text-[13px] text-balance text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerSwipeHandle,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
