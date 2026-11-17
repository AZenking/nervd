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
  }

function SheetTrigger({
  className,
  children,
  render,
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
}

function SheetClose({
  className,
  children,
  render,
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
        "fixed inset-0 z-50 bg-backdrop transition-opacity duration-150",
        className
      )}
      {...props}
    />
  )
}

/**
 * 描述元素 id 注册（同 dialog.tsx）：RAC `useDialog` 不会为 role="dialog" 的 Sheet
 * 自动接线 aria-describedby（sheet.mdx 只声明了该 prop 的存在），故由容器用 useId
 * 生成稳定 id 并在渲染到描述时回填。
 */
const SheetDescriptionContext = React.createContext<{
  id: string
  register: (present: boolean) => void
} | null>(null)

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
  const descriptionId = React.useId()
  const [hasDescription, setHasDescription] = React.useState(false)
  const descriptionContext = React.useMemo(
    () => ({ id: descriptionId, register: (present: boolean) => setHasDescription(present) }),
    [descriptionId]
  )

  return (
    <SheetHero.Backdrop
      data-slot="sheet-overlay"
      className="fixed inset-0 z-50 bg-backdrop transition-opacity duration-150"
    >
      <SheetHero.Content>
        <SheetHero.Dialog
          data-slot="sheet-content"
          data-side={side}
          // 调用方显式传入的 aria-describedby 优先；否则仅在确实渲染了描述时接线
          aria-describedby={props["aria-describedby"] ?? (hasDescription ? descriptionId : undefined)}
          className={cn(
            // 可聚焦 Dialog 容器：outline-none 保留，焦点环替代之。环必须走 inset ——
            // 外扩环会被 .sheet__content 的 overflow-clip 裁掉（[data-has-descendants] 带
            // transform，fixed 的 Dialog 同受裁剪），inset 环才能真实可见（DESIGN §Interaction / C7）
            "fixed z-50 flex flex-col gap-4 border-border bg-popover bg-clip-padding text-[13px] text-popover-foreground shadow-level-2 transition duration-200 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
            side === "bottom" && "inset-x-0 bottom-0 h-auto border-t rounded-t-xl",
            side === "top" && "inset-x-0 top-0 h-auto border-b rounded-b-xl",
            side === "left" && "inset-y-0 left-0 h-full w-3/4 border-r rounded-r-xl sm:max-w-sm",
            side === "right" && "inset-y-0 right-0 h-full w-3/4 border-l rounded-l-xl sm:max-w-sm",
            className
          )}
          {...props}
        >
          <SheetDescriptionContext.Provider value={descriptionContext}>
            {typeof children === "function" ? (children as any) : children}
            {showCloseButton && (
              <SheetHero.CloseTrigger
                data-slot="sheet-close"
                aria-label="Close"
                className="absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:opacity-100 hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <XIcon className="size-4" />
                <span className="sr-only">Close</span>
              </SheetHero.CloseTrigger>
            )}
          </SheetDescriptionContext.Provider>
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
  id,
  ...props
}: React.ComponentProps<"p">) {
  const descriptionContext = React.useContext(SheetDescriptionContext)
  const generatedId = React.useId()
  const descriptionId = id ?? descriptionContext?.id ?? generatedId

  // 在 paint 前完成注册，确保读屏在 Sheet 获得焦点时已能解析 aria-describedby
  React.useLayoutEffect(() => {
    if (!descriptionContext) return
    descriptionContext.register(true)
    return () => descriptionContext.register(false)
  }, [descriptionContext])

  return (
    <p
      id={descriptionId}
      data-slot="sheet-description"
      className={cn("text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * 非模态底部 Sheet 条（Sheet 形态、无遮罩、无焦点陷阱）：
 *
 * 为什么不用 `<Sheet>`：HeroUI / React Aria 的 Sheet 建立在 Modal 之上——会加遮罩、抢焦点，
 * 并把后方内容 `aria-hidden`。常驻的批量操作条必须在打开时仍能操作背后的列表（继续勾选工作项、
 * j/k 移动光标），否则多选流程被打断。因此这里复用 Sheet 的**视觉契约**（贴底、顶部圆角、
 * 抓手、level-2 阴影、底部上滑入场），但不引入 Modal 语义与行为。
 *
 * 打开态由调用方控制：关闭时调用方直接不渲染（不保留 inert 节点，避免污染可访问性树与测试断言）。
 */
interface SheetBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 无障碍名称（读屏播报为普通 region，而不是 dialog） */
  label: string;
  className?: string;
  children?: React.ReactNode;
}

function SheetBar({ label, className, children, ...props }: SheetBarProps) {
  return (
    <div
      data-slot="sheet-bar"
      role="region"
      aria-label={label}
      {...props}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-col',
        'rounded-t-xl border border-b-0 border-border bg-popover bg-clip-padding text-popover-foreground shadow-level-2',
        'px-3.5 pb-3 pt-2.5',
        'animate-in fade-in slide-in-from-bottom-4 duration-200 ease-out',
        className,
      )}
    >
      {/* 抓手：Sheet 形态标识（本组件不含下滑手势，仅作视觉锚点） */}
      <span
        aria-hidden="true"
        className="mx-auto mb-2 h-1 w-8 shrink-0 rounded-full bg-border"
      />
      {children}
    </div>
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
  SheetBar,
}
