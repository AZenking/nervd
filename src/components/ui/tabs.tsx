"use client"

import * as React from "react"
import { Tabs as HeroTabs } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface TabsProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroTabs>, "value" | "defaultValue"> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, event?: any) => void
}

function TabsRoot({
  className,
  orientation = "horizontal",
  value,
  defaultValue,
  onValueChange,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  children,
  ...props
}: TabsProps) {
  const resolvedSelectedKey = value !== undefined ? value : selectedKey
  const resolvedDefaultSelectedKey = defaultValue !== undefined ? defaultValue : defaultSelectedKey

  const handleSelectionChange = (key: any) => {
    onSelectionChange?.(key)
    onValueChange?.(String(key), { type: 'change', target: { value: String(key) } })
  }

  return (
    <HeroTabs
      data-slot="tabs"
      orientation={orientation}
      selectedKey={resolvedSelectedKey}
      defaultSelectedKey={resolvedDefaultSelectedKey}
      onSelectionChange={handleSelectionChange}
      className={className}
      {...props}
    >
      {children}
    </HeroTabs>
  )
}

export interface TabsListProps
  extends React.ComponentPropsWithRef<typeof HeroTabs.List> {
  containerClassName?: string
  size?: "default" | "sm" | "xs" | "lg"
  variant?: "default" | "segmented" | "line" | "ghost"
}

function TabsList({
  className,
  containerClassName,
  size,
  variant,
  children,
  ...props
}: TabsListProps) {
  const isGhost = variant === "ghost"
  return (
    <HeroTabs.ListContainer
      className={cn(
        isGhost && "bg-transparent p-0 rounded-none shadow-none",
        containerClassName
      )}
    >
      <HeroTabs.List className={className} {...props}>
        {children}
      </HeroTabs.List>
    </HeroTabs.ListContainer>
  )
}

export interface TabsTriggerProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroTabs.Tab>, "id"> {
  value?: string
  id?: string
}

function TabsTrigger({
  className,
  value,
  id,
  children,
  ...props
}: TabsTriggerProps) {
  const resolvedId = (id ?? value ?? "") as string

  return (
    <HeroTabs.Tab
      id={resolvedId}
      className={cn("whitespace-nowrap gap-1.5", className)}
      {...props}
    >
      {(renderProps: any) => (
        <>
          {typeof children === "function" ? children(renderProps) : children}
          <HeroTabs.Indicator />
        </>
      )}
    </HeroTabs.Tab>
  )
}

export interface TabsContentProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroTabs.Panel>, "id"> {
  value?: string
  id?: string
}

function TabsContent({
  className,
  value,
  id,
  children,
  ...props
}: TabsContentProps) {
  const resolvedId = (id ?? value ?? "") as string
  return (
    <HeroTabs.Panel
      id={resolvedId}
      className={className}
      {...props}
    >
      {children}
    </HeroTabs.Panel>
  )
}

const Tabs = Object.assign(TabsRoot, {
  ListContainer: HeroTabs.ListContainer,
  List: HeroTabs.List,
  Tab: HeroTabs.Tab,
  Indicator: HeroTabs.Indicator,
  Separator: HeroTabs.Separator,
  Panel: HeroTabs.Panel,
})

export { Tabs, TabsList, TabsTrigger, TabsContent }
