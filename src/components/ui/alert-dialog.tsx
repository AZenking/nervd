import * as React from "react"
import { AlertDialog as HeroUIAlertDialog } from "@heroui/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AlertDialogProps {
  open?: boolean
  isOpen?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function AlertDialogRoot({
  open,
  isOpen,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: AlertDialogProps & Omit<React.ComponentPropsWithoutRef<typeof HeroUIAlertDialog>, "isOpen" | "defaultOpen" | "onOpenChange">) {
  const controlledOpen = open !== undefined ? open : isOpen
  return (
    <HeroUIAlertDialog
      isOpen={controlledOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      {...props}
    >
      {children}
    </HeroUIAlertDialog>
  )
}

/**
 * HeroUI 原生复合确认弹窗组件
 * 支持 `<AlertDialog.Backdrop>`, `<AlertDialog.Container>`, `<AlertDialog.Dialog>`, `<AlertDialog.Header>`, `<AlertDialog.Heading>`, `<AlertDialog.Body>`, `<AlertDialog.Footer>`, `<AlertDialog.Icon>`
 */
const AlertDialog = Object.assign(AlertDialogRoot, {
  Root: AlertDialogRoot,
  Trigger: HeroUIAlertDialog.Trigger,
  Backdrop: HeroUIAlertDialog.Backdrop,
  Container: HeroUIAlertDialog.Container,
  Dialog: HeroUIAlertDialog.Dialog,
  Header: HeroUIAlertDialog.Header,
  Heading: HeroUIAlertDialog.Heading,
  Body: HeroUIAlertDialog.Body,
  Footer: HeroUIAlertDialog.Footer,
  Icon: HeroUIAlertDialog.Icon,
  CloseTrigger: HeroUIAlertDialog.CloseTrigger,
})

interface AlertDialogTriggerProps extends Omit<React.ComponentPropsWithoutRef<typeof HeroUIAlertDialog.Trigger>, "render"> {
  render?: React.ReactNode | ((props: any) => React.ReactNode)
}

function AlertDialogTrigger({
  className,
  children,
  render,
  ...props
}: AlertDialogTriggerProps) {
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
    <HeroUIAlertDialog.Trigger
      className={className}
      {...props}
    >
      {children}
    </HeroUIAlertDialog.Trigger>
  )
}

function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof HeroUIAlertDialog.Backdrop>) {
  return <HeroUIAlertDialog.Backdrop className={className} {...props} />
}

/**
 * 描述元素 id 注册（同 dialog.tsx）：role="alertdialog" 虽由 RAC 自动接线，
 * 但容器显式接线可让「调用方自定义 aria-describedby / 内部 <p> 描述」两种形态一致，
 * 且不依赖 HeroUI `Description`（会引入额外 .description 样式，改变视觉）。
 */
const AlertDialogDescriptionContext = React.createContext<{
  id: string
  register: (present: boolean) => void
} | null>(null)

interface AlertDialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof HeroUIAlertDialog.Dialog>, "children"> {
  size?: React.ComponentPropsWithoutRef<typeof HeroUIAlertDialog.Container>["size"]
  placement?: React.ComponentPropsWithoutRef<typeof HeroUIAlertDialog.Container>["placement"]
  children?: React.ReactNode | ((opts: any) => React.ReactNode)
}

function AlertDialogContent({
  className,
  size = "sm",
  placement = "center",
  children,
  ...props
}: AlertDialogContentProps) {
  const descriptionId = React.useId()
  const [hasDescription, setHasDescription] = React.useState(false)
  const descriptionContext = React.useMemo(
    () => ({ id: descriptionId, register: (present: boolean) => setHasDescription(present) }),
    [descriptionId]
  )

  return (
    <HeroUIAlertDialog.Backdrop>
      <HeroUIAlertDialog.Container placement={placement} size={size}>
        <HeroUIAlertDialog.Dialog
          role="alertdialog"
          // 调用方显式传入的 aria-describedby 优先；否则仅在确实渲染了描述时接线
          aria-describedby={props["aria-describedby"] ?? (hasDescription ? descriptionId : undefined)}
          className={cn("relative flex flex-col", className)}
          {...props}
        >
          <AlertDialogDescriptionContext.Provider value={descriptionContext}>
            {typeof children === "function" ? (children as any) : children}
          </AlertDialogDescriptionContext.Provider>
        </HeroUIAlertDialog.Dialog>
      </HeroUIAlertDialog.Container>
    </HeroUIAlertDialog.Backdrop>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<typeof HeroUIAlertDialog.Header>) {
  return (
    <HeroUIAlertDialog.Header
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof HeroUIAlertDialog.Footer>) {
  return (
    <HeroUIAlertDialog.Footer
      className={cn("mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof HeroUIAlertDialog.Heading>) {
  return (
    <HeroUIAlertDialog.Heading
      className={cn("text-base font-semibold leading-normal", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  id,
  ...props
}: React.ComponentProps<"p">) {
  const descriptionContext = React.useContext(AlertDialogDescriptionContext)
  const generatedId = React.useId()
  const descriptionId = id ?? descriptionContext?.id ?? generatedId

  React.useLayoutEffect(() => {
    if (!descriptionContext) return
    descriptionContext.register(true)
    return () => descriptionContext.register(false)
  }, [descriptionContext])

  return (
    <p
      id={descriptionId}
      data-slot="alert-dialog-description"
      className={cn("text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = "destructive",
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant={variant}
      className={className}
      {...props}
    >
      {children}
    </Button>
  )
}

function AlertDialogCancel({
  className,
  variant = "outline",
  children = "取消",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant={variant}
      className={className}
      {...props}
    >
      {children}
    </Button>
  )
}

function AlertDialogBody({ className, ...props }: React.ComponentProps<typeof HeroUIAlertDialog.Body>) {
  return <HeroUIAlertDialog.Body className={className} {...props} />
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogBody,
}
