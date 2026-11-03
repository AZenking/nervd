import * as React from "react"
import { Modal } from "@heroui/react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"

interface DialogProps {
  open?: boolean
  isOpen?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function Dialog({
  open,
  isOpen,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: DialogProps & Omit<React.ComponentPropsWithoutRef<typeof Modal>, "isOpen" | "defaultOpen" | "onOpenChange">) {
  const controlledOpen = open !== undefined ? open : isOpen
  return (
    <Modal
      isOpen={controlledOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      {...props}
    >
      {children}
    </Modal>
  )
}

interface DialogTriggerProps extends Omit<React.ComponentPropsWithoutRef<typeof Modal.Trigger<"div">>, "render"> {
  render?: React.ReactNode | ((props: any) => React.ReactNode)
  asChild?: boolean
}

function DialogTrigger({
  className,
  children,
  render,
  asChild: _asChild,
  ...props
}: DialogTriggerProps) {
  if (render) {
    if (typeof render === "function") {
      return render({ "data-slot": "dialog-trigger", ...props, className })
    }
    if (React.isValidElement(render)) {
      return React.cloneElement(render as React.ReactElement<any>, {
        "data-slot": "dialog-trigger",
        ...props,
        className: cn((render.props as { className?: string }).className, className),
        children: (render.props as { children?: React.ReactNode }).children ?? children,
      })
    }
  }
  return (
    <Modal.Trigger
      data-slot="dialog-trigger"
      className={className}
      {...props}
    >
      {children}
    </Modal.Trigger>
  )
}

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Modal.Backdrop>) {
  return (
    <Modal.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/40 duration-100",
        className
      )}
      {...props}
    />
  )
}

interface DialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof Modal.Dialog>, "children"> {
  showCloseButton?: boolean
  children?: React.ReactNode | ((opts: any) => React.ReactNode)
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  return (
    <Modal.Backdrop
      data-slot="dialog-overlay"
      className="fixed inset-0 isolate z-50 bg-black/40 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
    >
      <Modal.Container className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Modal.Dialog
          data-slot="dialog-content"
          className={cn(
            "relative grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-xl border border-border bg-popover p-5 text-[13px] text-popover-foreground shadow-level-2 ring-1 ring-black/8 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {typeof children === "function" ? (children as any) : children}
          {showCloseButton && (
            <Modal.CloseTrigger
              data-slot="dialog-close"
              aria-label="Close"
              className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:opacity-100 hover:bg-muted focus:outline-none"
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </Modal.CloseTrigger>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

interface DialogCloseProps extends Omit<React.ComponentPropsWithoutRef<typeof Modal.CloseTrigger>, "render"> {
  render?: React.ReactNode | ((props: any) => React.ReactNode)
  asChild?: boolean
}

function DialogClose({
  className,
  children,
  render,
  asChild: _asChild,
  ...props
}: DialogCloseProps) {
  if (render) {
    if (typeof render === "function") {
      return render({ "data-slot": "dialog-close", ...props, className })
    }
    if (React.isValidElement(render)) {
      return React.cloneElement(render as React.ReactElement<any>, {
        "data-slot": "dialog-close",
        ...props,
        className: cn((render.props as { className?: string }).className, className),
        children: (render.props as { children?: React.ReactNode }).children ?? children,
      })
    }
  }
  return (
    <Modal.CloseTrigger
      data-slot="dialog-close"
      className={className}
      {...props}
    >
      {children}
    </Modal.CloseTrigger>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<typeof Modal.Header>) {
  return (
    <Modal.Header
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<typeof Modal.Footer> & {
  showCloseButton?: boolean
}) {
  return (
    <Modal.Footer
      data-slot="dialog-footer"
      className={cn(
        "-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-popover p-5 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
          Close
        </DialogClose>
      )}
    </Modal.Footer>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof Modal.Heading>) {
  return (
    <Modal.Heading
      data-slot="dialog-title"
      className={cn("text-base leading-[1.4] font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn(
        "text-[13px] text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
