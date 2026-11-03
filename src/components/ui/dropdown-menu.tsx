import * as React from "react"
import { Dropdown as DropdownHero, Separator } from "@heroui/react"
import { RootMenuTriggerStateContext } from "react-aria-components"
import { cn } from "@/lib/utils"
import { ChevronRightIcon, CheckIcon } from "lucide-react"

interface DropdownMenuProps {
  open?: boolean
  isOpen?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function DropdownMenu({
  open,
  isOpen,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: DropdownMenuProps & Omit<React.ComponentPropsWithoutRef<typeof DropdownHero>, "isOpen" | "defaultOpen" | "onOpenChange">) {
  const controlledOpen = open !== undefined ? open : isOpen
  return (
    <DropdownHero
      isOpen={controlledOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      {...props}
    >
      {children}
    </DropdownHero>
  )
}

type DropdownMenuTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.HTMLAttributes<HTMLDivElement> & {
    render?: any
    asChild?: boolean
  }

function DropdownMenuTrigger({
  className,
  children,
  render,
  asChild: _asChild,
  ...props
}: DropdownMenuTriggerProps) {
  const triggerState = React.useContext(RootMenuTriggerStateContext)

  if (render) {
    if (typeof render === "function") {
      return render({
        "data-slot": "dropdown-menu-trigger",
        onClick: (_e: any) => {
          triggerState?.toggle()
        },
        "aria-expanded": triggerState?.isOpen,
        "aria-haspopup": true,
        ...props,
        className,
      })
    }
    if (React.isValidElement(render)) {
      const renderProps = (render as React.ReactElement<any>).props
      return React.cloneElement(render as React.ReactElement<any>, {
        "data-slot": "dropdown-menu-trigger",
        ...props,
        className: cn(renderProps.className, className),
        onClick: (e: any) => {
          triggerState?.toggle()
          props.onClick?.(e)
          renderProps.onClick?.(e)
        },
        "aria-expanded": triggerState?.isOpen ?? props["aria-expanded"],
        "aria-haspopup": true,
        children: renderProps.children ?? children,
      })
    }
  }
  return (
    <DropdownHero.Trigger
      data-slot="dropdown-menu-trigger"
      className={className}
      {...(props as any)}
    >
      {children}
    </DropdownHero.Trigger>
  )
}

function DropdownMenuPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

type DropdownSide = "top" | "bottom" | "left" | "right"
type DropdownAlign = "start" | "center" | "end"

function resolveDropdownPlacement(side?: DropdownSide, align?: DropdownAlign) {
  if (!side) return undefined
  if (!align || align === "center") return side
  return `${side} ${align}` as const
}

type DropdownMenuContentProps = React.HTMLAttributes<HTMLDivElement> & {
  side?: DropdownSide
  align?: DropdownAlign
  sideOffset?: number
  alignOffset?: number
  placement?: any
  children?: React.ReactNode
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  placement: placementProp,
  children,
  ...props
}: DropdownMenuContentProps) {
  const placement = placementProp ?? resolveDropdownPlacement(side, align)
  return (
    <DropdownHero.Popover
      data-slot="dropdown-menu-content"
      placement={placement}
      offset={sideOffset}
      crossOffset={alignOffset}
      className={cn(
        "z-50 max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-level-2 ring-1 ring-black/5 duration-100 outline-none",
        className
      )}
      {...(props as any)}
    >
      <DropdownHero.Menu
        data-slot="dropdown-menu"
        aria-label="Menu"
        className="outline-none"
      >
        {children}
      </DropdownHero.Menu>
    </DropdownHero.Popover>
  )
}

function DropdownMenuGroup({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-group"
      className={className}
      {...props}
    >
      {children}
    </div>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean
}) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground",
        inset && "pl-8",
        className
      )}
      {...props}
    />
  )
}

interface DropdownMenuItemProps extends Omit<React.ComponentPropsWithoutRef<typeof DropdownHero.Item>, "variant" | "children"> {
  inset?: boolean
  variant?: "default" | "destructive"
  disabled?: boolean
  title?: string
  onSelect?: (e: any) => void
  children?: React.ReactNode
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  disabled,
  onSelect,
  onClick,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownHero.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      variant={variant === "destructive" ? "danger" : undefined}
      isDisabled={disabled ?? props.isDisabled}
      onAction={() => {
        onSelect?.({} as any)
      }}
      onClick={onClick}
      className={cn(
        "group/dropdown-menu-item relative flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-muted-foreground [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        inset && "pl-8",
        className
      )}
      {...props}
    >
      {children}
    </DropdownHero.Item>
  )
}

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof DropdownHero.SubmenuTrigger>) {
  return <DropdownHero.SubmenuTrigger data-slot="dropdown-menu-sub" {...props} />
}

interface DropdownMenuSubTriggerProps extends Omit<React.ComponentPropsWithoutRef<typeof DropdownHero.Item>, "children"> {
  inset?: boolean
  children?: React.ReactNode
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <DropdownHero.Item
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-8 data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
        inset && "pl-8",
        className
      )}
      {...props}
    >
      {typeof children === "function" ? (children as any) : children}
      <ChevronRightIcon className="ml-auto" />
    </DropdownHero.Item>
  )
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "w-auto min-w-[96px] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-level-2 ring-1 ring-black/5 duration-100",
        className
      )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

interface DropdownMenuCheckboxItemProps extends Omit<React.ComponentPropsWithoutRef<typeof DropdownHero.Item>, "children"> {
  children?: React.ReactNode
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  closeOnClick?: boolean
  inset?: boolean
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onCheckedChange,
  closeOnClick: _closeOnClick,
  inset,
  onClick,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <DropdownHero.Item
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      data-checked={checked}
      onClick={(e) => {
        onClick?.(e)
        onCheckedChange?.(!checked)
      }}
      className={cn(
        "relative flex h-8 cursor-pointer items-center gap-2 rounded-md py-0 pr-8 pl-2 text-[13px] outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground focus:**:text-accent-foreground data-highlighted:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        inset && "pl-8",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        {checked && <CheckIcon className="size-4" />}
      </span>
      {children}
    </DropdownHero.Item>
  )
}

function DropdownMenuRadioGroup({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-radio-group"
      className={className}
      {...props}
    >
      {children}
    </div>
  )
}

interface DropdownMenuRadioItemProps extends Omit<React.ComponentPropsWithoutRef<typeof DropdownHero.Item>, "children"> {
  children?: React.ReactNode
  checked?: boolean
  inset?: boolean
}

function DropdownMenuRadioItem({
  className,
  children,
  checked,
  inset,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <DropdownHero.Item
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      data-checked={checked}
      className={cn(
        "relative flex h-8 cursor-pointer items-center gap-2 rounded-md py-0 pr-8 pl-2 text-[13px] outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground focus:**:text-accent-foreground data-highlighted:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        inset && "pl-8",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        {checked && <CheckIcon className="size-4" />}
      </span>
      {children}
    </DropdownHero.Item>
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Separator>) {
  return (
    <Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
