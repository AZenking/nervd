"use client"

import * as React from "react"
import { Disclosure as HeroDisclosure } from "@heroui/react"
import { cn } from "@/lib/utils"

function normalizeRender(render: any) {
  if (!render) return undefined
  if (typeof render === "function") return render
  if (React.isValidElement(render)) {
    const renderEl = render as React.ReactElement<any>
    return (domProps: any) =>
      React.cloneElement(renderEl, {
        ...domProps,
        className: cn(renderEl.props?.className, domProps.className),
      })
  }
  return undefined
}

interface CollapsibleContextValue {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const CollapsibleContext = React.createContext<CollapsibleContextValue>({
  isOpen: false,
  setIsOpen: () => {},
})

export interface CollapsibleProps
  extends Omit<
    React.ComponentPropsWithRef<typeof HeroDisclosure>,
    "isExpanded" | "defaultExpanded" | "onExpandedChange" | "render"
  > {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  isExpanded?: boolean
  defaultExpanded?: boolean
  onExpandedChange?: (isExpanded: boolean) => void
  disabled?: boolean
  render?: React.ReactElement | ((props: any) => React.ReactNode)
}

function Collapsible({
  open,
  defaultOpen,
  onOpenChange,
  isExpanded,
  defaultExpanded,
  onExpandedChange,
  disabled,
  isDisabled,
  className,
  render,
  children,
  ...props
}: CollapsibleProps) {
  const isControlled = open !== undefined || isExpanded !== undefined
  const resolvedOpen = open !== undefined ? open : isExpanded
  const resolvedDefaultOpen = defaultOpen !== undefined ? defaultOpen : defaultExpanded

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(resolvedDefaultOpen ?? false)
  const currentOpen = isControlled ? Boolean(resolvedOpen) : uncontrolledOpen

  const handleExpandedChange = (expanded: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(expanded)
    }
    onOpenChange?.(expanded)
    onExpandedChange?.(expanded)
  }

  const effectiveDisabled = disabled ?? isDisabled

  return (
    <CollapsibleContext.Provider value={{ isOpen: currentOpen, setIsOpen: handleExpandedChange }}>
      <HeroDisclosure
        data-slot="collapsible"
        data-state={currentOpen ? "open" : "closed"}
        data-open={currentOpen ? "" : undefined}
        isExpanded={currentOpen}
        onExpandedChange={handleExpandedChange}
        isDisabled={effectiveDisabled}
        render={normalizeRender(render)}
        className={className}
        {...props}
      >
        {children}
      </HeroDisclosure>
    </CollapsibleContext.Provider>
  )
}

export interface CollapsibleTriggerProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroDisclosure.Trigger>, "render"> {
  render?: React.ReactElement | ((props: any) => React.ReactNode)
  nativeButton?: boolean
}

function CollapsibleTrigger({
  className,
  render,
  children,
  nativeButton: _nativeButton,
  ...props
}: CollapsibleTriggerProps) {
  const { isOpen } = React.useContext(CollapsibleContext)

  return (
    <HeroDisclosure.Trigger
      data-slot="collapsible-trigger"
      data-state={isOpen ? "open" : "closed"}
      data-open={isOpen ? "" : undefined}
      render={normalizeRender(render)}
      className={className}
      {...props}
    >
      {children}
    </HeroDisclosure.Trigger>
  )
}

export interface CollapsibleContentProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroDisclosure.Content>, "render"> {
  render?: React.ReactElement | ((props: any) => React.ReactNode)
}

function CollapsibleContent({
  className,
  render,
  children,
  ...props
}: CollapsibleContentProps) {
  const { isOpen } = React.useContext(CollapsibleContext)

  return (
    <HeroDisclosure.Content
      data-slot="collapsible-content"
      data-state={isOpen ? "open" : "closed"}
      data-open={isOpen ? "" : undefined}
      render={normalizeRender(render)}
      className={className}
      {...props}
    >
      {children}
    </HeroDisclosure.Content>
  )
}

Collapsible.Trigger = CollapsibleTrigger
Collapsible.Content = CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
