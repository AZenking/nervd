import * as React from "react"
import { Modal as HeroUIModal } from "@heroui/react"
import { cn } from "@/lib/utils"

interface DialogProps {
  open?: boolean
  isOpen?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function DialogRoot({
  open,
  isOpen,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: DialogProps & Omit<React.ComponentPropsWithoutRef<typeof HeroUIModal>, "isOpen" | "defaultOpen" | "onOpenChange">) {
  const controlledOpen = open !== undefined ? open : isOpen
  return (
    <HeroUIModal
      isOpen={controlledOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      {...props}
    >
      {children}
    </HeroUIModal>
  )
}

/**
 * HeroUI 原生复合模态弹窗组件
 * 支持 `<Dialog.Backdrop>`, `<Dialog.Container>`, `<Dialog.Dialog>`, `<Dialog.Header>`, `<Dialog.Heading>`, `<Dialog.Body>`, `<Dialog.Footer>`, `<Dialog.CloseTrigger>`
 */
const Dialog = Object.assign(DialogRoot, {
  Root: DialogRoot,
  Trigger: HeroUIModal.Trigger,
  Backdrop: HeroUIModal.Backdrop,
  Container: HeroUIModal.Container,
  Dialog: HeroUIModal.Dialog,
  Header: HeroUIModal.Header,
  Heading: HeroUIModal.Heading,
  Body: HeroUIModal.Body,
  Footer: HeroUIModal.Footer,
  CloseTrigger: HeroUIModal.CloseTrigger,
  Icon: HeroUIModal.Icon,
})

interface DialogTriggerProps extends Omit<React.ComponentPropsWithoutRef<typeof HeroUIModal.Trigger>, "render"> {
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
      return render({ ...props, className })
    }
    if (React.isValidElement(render)) {
      return React.cloneElement(render as React.ReactElement<any>, {
        ...props,
        className: cn((render.props as { className?: string }).className, className),
        children: (render.props as { children?: React.ReactNode }).children ?? children,
      })
    }
  }
  return (
    <HeroUIModal.Trigger
      className={className}
      {...(props as any)}
    >
      {children}
    </HeroUIModal.Trigger>
  )
}

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof HeroUIModal.Backdrop>) {
  return <HeroUIModal.Backdrop className={className} {...props} />
}

interface DialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof HeroUIModal.Dialog>, "children"> {
  size?: React.ComponentPropsWithoutRef<typeof HeroUIModal.Container>["size"]
  placement?: React.ComponentPropsWithoutRef<typeof HeroUIModal.Container>["placement"]
  scroll?: React.ComponentPropsWithoutRef<typeof HeroUIModal.Container>["scroll"]
  showCloseButton?: boolean
  children?: React.ReactNode | ((opts: any) => React.ReactNode)
}

function DialogContent({
  className,
  children,
  size,
  placement = "center",
  scroll = "inside",
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  return (
    <HeroUIModal.Backdrop>
      <HeroUIModal.Container placement={placement} size={size} scroll={scroll}>
        <HeroUIModal.Dialog
          className={cn("relative flex flex-col", className)}
          {...props}
        >
          {showCloseButton && (
            <HeroUIModal.CloseTrigger
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            />
          )}
          {typeof children === "function" ? (children as any) : children}
        </HeroUIModal.Dialog>
      </HeroUIModal.Container>
    </HeroUIModal.Backdrop>
  )
}

function DialogClose({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof HeroUIModal.CloseTrigger>) {
  return (
    <HeroUIModal.CloseTrigger
      className={className}
      {...props}
    >
      {children}
    </HeroUIModal.CloseTrigger>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<typeof HeroUIModal.Header>) {
  return (
    <HeroUIModal.Header
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<typeof HeroUIModal.Footer> & {
  showCloseButton?: boolean
}) {
  return (
    <HeroUIModal.Footer
      className={cn("mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose>
          取消
        </DialogClose>
      )}
    </HeroUIModal.Footer>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof HeroUIModal.Heading>) {
  return (
    <HeroUIModal.Heading
      className={cn("text-base font-semibold leading-normal", className)}
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
      className={cn("text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<typeof HeroUIModal.Body>) {
  return <HeroUIModal.Body className={className} {...props} />
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
  DialogBody,
}
