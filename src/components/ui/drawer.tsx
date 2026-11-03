import * as React from "react"
import { Drawer as HeroUIDrawer } from "@heroui/react"
import { cn } from "@/lib/utils"

type DrawerPlacement = "top" | "bottom" | "left" | "right"

interface DrawerContextProps {
  placement: DrawerPlacement
  isDismissable?: boolean
}

const DrawerContext = React.createContext<DrawerContextProps>({
  placement: "right",
  isDismissable: true,
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
  isDismissable?: boolean
  children?: React.ReactNode
}

function DrawerRoot({
  open,
  isOpen,
  defaultOpen,
  onOpenChange,
  placement: placementProp,
  swipeDirection = "right",
  modal: _modal = true,
  isDismissable = true,
  children,
  ...props
}: DrawerProps & Omit<React.ComponentPropsWithoutRef<typeof HeroUIDrawer>, "isOpen" | "defaultOpen" | "onOpenChange">) {
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
    () => ({ placement, isDismissable }),
    [placement, isDismissable]
  )

  return (
    <DrawerContext.Provider value={contextValue}>
      <HeroUIDrawer
        isOpen={controlledOpen}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        {...props}
      >
        {children}
      </HeroUIDrawer>
    </DrawerContext.Provider>
  )
}

/**
 * HeroUI 原生复合抽屉组件
 * 支持 `<Drawer.Backdrop>`, `<Drawer.Content>`, `<Drawer.Dialog>`, `<Drawer.Header>`, `<Drawer.Heading>`, `<Drawer.Body>`, `<Drawer.Footer>`
 */
const Drawer = Object.assign(DrawerRoot, {
  Root: DrawerRoot,
  Trigger: HeroUIDrawer.Trigger,
  Backdrop: HeroUIDrawer.Backdrop,
  Content: HeroUIDrawer.Content,
  Dialog: HeroUIDrawer.Dialog,
  Header: HeroUIDrawer.Header,
  Heading: HeroUIDrawer.Heading,
  Body: HeroUIDrawer.Body,
  Footer: HeroUIDrawer.Footer,
  Handle: HeroUIDrawer.Handle,
  CloseTrigger: HeroUIDrawer.CloseTrigger,
})

function DrawerTrigger({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof HeroUIDrawer.Trigger>) {
  return (
    <HeroUIDrawer.Trigger className={className} {...props}>
      {children}
    </HeroUIDrawer.Trigger>
  )
}

function DrawerPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DrawerClose({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof HeroUIDrawer.CloseTrigger>) {
  return (
    <HeroUIDrawer.CloseTrigger className={className} {...props}>
      {children}
    </HeroUIDrawer.CloseTrigger>
  )
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof HeroUIDrawer.Backdrop>) {
  return <HeroUIDrawer.Backdrop className={className} {...props} />
}

function DrawerSwipeHandle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof HeroUIDrawer.Handle>) {
  return <HeroUIDrawer.Handle className={className} {...props} />
}

interface DrawerContentProps extends Omit<React.ComponentPropsWithoutRef<typeof HeroUIDrawer.Dialog>, "children"> {
  placement?: DrawerPlacement
  isDismissable?: boolean
  backdropVariant?: React.ComponentPropsWithoutRef<typeof HeroUIDrawer.Backdrop>["variant"]
  children?: React.ReactNode | ((opts: any) => React.ReactNode)
}

function DrawerContent({
  className,
  children,
  placement: placementProp,
  isDismissable: isDismissableProp,
  backdropVariant,
  ...props
}: DrawerContentProps) {
  const { placement: ctxPlacement, isDismissable: ctxIsDismissable } = useDrawer()
  const placement = placementProp ?? ctxPlacement
  const isDismissable = isDismissableProp ?? ctxIsDismissable

  return (
    <HeroUIDrawer.Backdrop isDismissable={isDismissable} variant={backdropVariant}>
      <HeroUIDrawer.Content placement={placement}>
        <HeroUIDrawer.Dialog
          className={cn(
            "p-0 border-l border-border",
            className
          )}
          {...props}
        >
          <div data-slot="drawer-content" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {typeof children === "function" ? (children as any) : children}
          </div>
        </HeroUIDrawer.Dialog>
      </HeroUIDrawer.Content>
    </HeroUIDrawer.Backdrop>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<typeof HeroUIDrawer.Header>) {
  return <HeroUIDrawer.Header className={className} {...props} />
}

function DrawerFooter({ className, ...props }: React.ComponentProps<typeof HeroUIDrawer.Footer>) {
  return <HeroUIDrawer.Footer className={className} {...props} />
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof HeroUIDrawer.Heading>) {
  return <HeroUIDrawer.Heading className={className} {...props} />
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

function DrawerBody({ className, ...props }: React.ComponentProps<typeof HeroUIDrawer.Body>) {
  return <HeroUIDrawer.Body className={className} {...props} />
}

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerOverlay,
  DrawerSwipeHandle,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
}
