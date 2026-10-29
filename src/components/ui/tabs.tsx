"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from '@/lib/utils'

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

type TabsListVariant = "default" | "segmented" | "line" | "ghost"
type TabsListSize = "default" | "sm" | "xs" | "lg"

const TabsContext = React.createContext<{
  variant?: TabsListVariant
  size?: TabsListSize
}>({
  variant: "default",
  size: "default",
})

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-md text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "border border-transparent bg-muted/60 p-0.5 shadow-none",
        segmented: "border border-transparent bg-muted/60 p-0.5 shadow-none",
        line: "border-transparent bg-transparent p-0",
        ghost: "border-transparent bg-transparent p-0",
      },
      size: {
        default: "h-7",
        sm: "h-7",
        xs: "h-6",
        lg: "h-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  size = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const resolvedVariant = variant ?? "default"
  const resolvedSize = size ?? "default"

  return (
    <TabsContext.Provider value={{ variant: resolvedVariant, size: resolvedSize }}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={resolvedVariant}
        data-size={resolvedSize}
        className={cn(tabsListVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
        {...props}
      />
    </TabsContext.Provider>
  )
}

const tabsTriggerVariants = cva(
  "relative inline-flex h-full group-data-vertical/tabs:h-auto flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-transparent font-medium whitespace-nowrap text-muted-foreground shadow-none transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2.5 py-0.5 text-xs",
        xs: "px-2 py-0 text-[11px]",
        lg: "px-3 py-1 text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

export interface TabsTriggerProps
  extends TabsPrimitive.Tab.Props,
    VariantProps<typeof tabsTriggerVariants> {}

function TabsTrigger({
  className,
  size,
  ...props
}: TabsTriggerProps) {
  const context = React.useContext(TabsContext)
  const resolvedSize = size ?? context.size ?? "default"

  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        tabsTriggerVariants({ size: resolvedSize }),
        // 1. Line 变体
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:shadow-none group-data-[variant=line]/tabs-list:rounded-none",
        "after:absolute after:bg-primary after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        // 2. Ghost 变体（如侧栏纵向导航）
        "group-data-[variant=ghost]/tabs-list:data-active:bg-accent group-data-[variant=ghost]/tabs-list:data-active:text-foreground group-data-[variant=ghost]/tabs-list:data-active:shadow-none group-data-[variant=ghost]/tabs-list:data-active:border-transparent",
        // 3. Segmented / Default 胶囊变体
        "data-active:border-border/40 data-active:bg-background data-active:text-foreground data-active:shadow-xs dark:data-active:border-transparent dark:data-active:bg-accent dark:data-active:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants }
