import * as React from "react"
import { Sheet as SheetHero } from "@heroui/react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"

type SheetSide = "top" | "right" | "bottom" | "left"

interface SheetContextProps {
  side: SheetSide
}

const SheetContext = React.createContext<SheetContextProps>({
  side: "right",
})

function useSheet() {
  return React.useContext(SheetContext)
}

interface SheetProps {
  open?: boolean
  isOpen?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details?: any) => void
  side?: SheetSide
  placement?: SheetSide
  onAnimationEnd?: any
  children?: React.ReactNode
}

function Sheet({
  open,
  isOpen,
  defaultOpen,
  onOpenChange,
  side = "right",
  placement: placementProp,
  onAnimationEnd: _onAnimationEnd,
  children,
  ...props
}: SheetProps & Omit<React.ComponentPropsWithoutRef<typeof SheetHero>, "isOpen" | "defaultOpen" | "onOpenChange" | "onAnimationEnd">) {
  const controlledOpen = open !== undefined ? open : isOpen
  const resolvedSide = placementProp ?? side
  const contextValue = React.useMemo(() => ({ side: resolvedSide }), [resolvedSide])

  return (
    <SheetContext.Provider value={contextValue}>
      <SheetHero
        isOpen={controlledOpen}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        placement={resolvedSide}
        {...props}
      >
        {children}
      </SheetHero>
    </SheetContext.Provider>
  )
}

type SheetTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.HTMLAttributes<HTMLDivElement> & {
    render?: any
    asChild?: boolean
  }

function SheetTrigger({
  className,
  children,
  render,
  asChild: _asChild,
  ...props
}: SheetTriggerProps) {
  if (render) {
    if (typeof render === "function") {
      return render({ "data-slot": "sheet-trigger", ...props, className })
    }
    if (React.isValidElement(render)) {
      return React.cloneElement(render as React.ReactElement<any>, {
        "data-slot": "sheet-trigger",
        ...props,
        className: cn((render.props as { className?: string }).className, className),
        children: (render.props as { children?: React.ReactNode }).children ?? children,
      })
    }
  }
  return (
    <SheetHero.Trigger
      data-slot="sheet-trigger"
      className={className}
      {...(props as any)}
    >
      {children}
    </SheetHero.Trigger>
  )
}

function SheetPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

type SheetCloseProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  render?: any
  asChild?: boolean
}

function SheetClose({
  className,
  children,
  render,
  asChild: _asChild,
  ...props
}: SheetCloseProps) {
  if (render) {
    if (typeof render === "function") {
      return render({ "data-slot": "sheet-close", ...props, className })
    }
    if (React.isValidElement(render)) {
      return React.cloneElement(render as React.ReactElement<any>, {
        "data-slot": "sheet-close",
        ...props,
        className: cn((render.props as { className?: string }).className, className),
        children: (render.props as { children?: React.ReactNode }).children ?? children,
      })
    }
  }
  return (
    <SheetHero.CloseTrigger
      data-slot="sheet-close"
      className={className}
      {...(props as any)}
    >
      {children}
    </SheetHero.CloseTrigger>
  )
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetHero.Backdrop>) {
  return (
    <SheetHero.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 transition-opacity duration-150",
        className
      )}
      {...props}
    />
  )
}

interface SheetContentProps extends Omit<React.ComponentPropsWithoutRef<typeof SheetHero.Dialog>, "children"> {
  side?: SheetSide
  showCloseButton?: boolean
  children?: React.ReactNode | ((opts: any) => React.ReactNode)
}

function SheetContent({
  className,
  children,
  side: sideProp,
  showCloseButton = true,
  ...props
}: SheetContentProps) {
  const { side: ctxSide } = useSheet()
  const side = sideProp ?? ctxSide

  return (
    <SheetHero.Backdrop
      data-slot="sheet-overlay"
      className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150"
    >
      <SheetHero.Content>
        <SheetHero.Dialog
          data-slot="sheet-content"
          data-side={side}
          className={cn(
            "fixed z-50 flex flex-col gap-4 border-border bg-popover bg-clip-padding text-[13px] text-popover-foreground shadow-level-2 transition duration-200 ease-in-out outline-none",
            side === "bottom" && "inset-x-0 bottom-0 h-auto border-t rounded-t-xl",
            side === "top" && "inset-x-0 top-0 h-auto border-b rounded-b-xl",
            side === "left" && "inset-y-0 left-0 h-full w-3/4 border-r rounded-r-xl sm:max-w-sm",
            side === "right" && "inset-y-0 right-0 h-full w-3/4 border-l rounded-l-xl sm:max-w-sm",
            className
          )}
          {...props}
        >
          {typeof children === "function" ? (children as any) : children}
          {showCloseButton && (
            <SheetHero.CloseTrigger
              data-slot="sheet-close"
              aria-label="Close"
              className="absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:opacity-100 hover:bg-muted focus:outline-none"
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </SheetHero.CloseTrigger>
          )}
        </SheetHero.Dialog>
      </SheetHero.Content>
    </SheetHero.Backdrop>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<typeof SheetHero.Header>) {
  return (
    <SheetHero.Header
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<typeof SheetHero.Footer>) {
  return (
    <SheetHero.Footer
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetHero.Heading>) {
  return (
    <SheetHero.Heading
      data-slot="sheet-title"
      className={cn(
        "text-base font-semibold text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="sheet-description"
      className={cn("text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetPortal,
  SheetOverlay,
}
