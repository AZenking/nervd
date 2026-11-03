import * as React from "react"
import { AlertDialog as AlertDialogHero } from "@heroui/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AlertDialogProps {
  open?: boolean
  isOpen?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function AlertDialog({
  open,
  isOpen,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: AlertDialogProps & Omit<React.ComponentPropsWithoutRef<typeof AlertDialogHero>, "isOpen" | "defaultOpen" | "onOpenChange">) {
  const controlledOpen = open !== undefined ? open : isOpen
  return (
    <AlertDialogHero
      isOpen={controlledOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      {...props}
    >
      {children}
    </AlertDialogHero>
  )
}

interface AlertDialogTriggerProps extends Omit<React.ComponentPropsWithoutRef<typeof AlertDialogHero.Trigger>, "render"> {
  render?: React.ReactNode | ((props: any) => React.ReactNode)
  asChild?: boolean
}

function AlertDialogTrigger({
  className,
  children,
  render,
  asChild: _asChild,
  ...props
}: AlertDialogTriggerProps) {
  if (render) {
    if (typeof render === "function") {
      return render({ "data-slot": "alert-dialog-trigger", ...props, className })
    }
    if (React.isValidElement(render)) {
      return React.cloneElement(render as React.ReactElement<any>, {
        "data-slot": "alert-dialog-trigger",
        ...props,
        className: cn((render.props as { className?: string }).className, className),
        children: (render.props as { children?: React.ReactNode }).children ?? children,
      })
    }
  }
  return (
    <AlertDialogHero.Trigger
      data-slot="alert-dialog-trigger"
      className={className}
      {...props}
    >
      {children}
    </AlertDialogHero.Trigger>
  )
}

function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogHero.Backdrop>) {
  return (
    <AlertDialogHero.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/40 duration-100",
        className
      )}
      {...props}
    />
  )
}

interface AlertDialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof AlertDialogHero.Dialog>, "children"> {
  size?: "default" | "sm"
  children?: React.ReactNode | ((opts: any) => React.ReactNode)
}

function AlertDialogContent({
  className,
  size = "default",
  children,
  ...props
}: AlertDialogContentProps) {
  return (
    <AlertDialogHero.Backdrop
      data-slot="alert-dialog-overlay"
      className="fixed inset-0 isolate z-50 bg-black/40 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
    >
      <AlertDialogHero.Container className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <AlertDialogHero.Dialog
          role="alertdialog"
          data-slot="alert-dialog-content"
          data-size={size}
          className={cn(
            "group/alert-dialog-content relative grid w-full gap-4 rounded-xl border border-border bg-popover p-5 text-[13px] text-popover-foreground shadow-level-2 ring-1 ring-black/8 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {typeof children === "function" ? (children as any) : children}
        </AlertDialogHero.Dialog>
      </AlertDialogHero.Container>
    </AlertDialogHero.Backdrop>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogHero.Header>) {
  return (
    <AlertDialogHero.Header
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogHero.Footer>) {
  return (
    <AlertDialogHero.Footer
      data-slot="alert-dialog-footer"
      className={cn(
        "-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-5 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogHero.Heading>) {
  return (
    <AlertDialogHero.Heading
      data-slot="alert-dialog-title"
      className={cn(
        "text-base leading-[1.4] font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="alert-dialog-description"
      className={cn(
        "text-[13px] text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="alert-dialog-action"
      className={cn(className)}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  children = "取消",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      slot="close"
      variant={variant}
      size={size}
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      {...props}
    >
      {children}
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
