"use client"

import * as React from "react"
import { Tabs as HeroTabs } from "@heroui/react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

export interface TabsProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroTabs>, "value" | "defaultValue"> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, event?: any) => void
}

function Tabs({
  className,
  orientation = "horizontal",
  value,
  defaultValue,
  onValueChange,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
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
      data-orientation={orientation}
      orientation={orientation}
      selectedKey={resolvedSelectedKey}
      defaultSelectedKey={resolvedDefaultSelectedKey}
      onSelectionChange={handleSelectionChange}
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
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-full text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none data-[variant=ghost]:rounded-md",
  {
    variants: {
      variant: {
        default: "border border-transparent bg-muted/60 p-0.5 shadow-none",
        segmented: "border border-transparent bg-muted/60 p-0.5 shadow-none",
        line: "border-transparent bg-transparent p-0",
        ghost: "border-transparent bg-transparent p-0",
      },
      size: {
        default: "h-7.5",
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

export interface TabsListProps
  extends React.ComponentPropsWithRef<typeof HeroTabs.List>,
    VariantProps<typeof tabsListVariants> {}

function TabsList({
  className,
  variant = "default",
  size = "default",
  ...props
}: TabsListProps) {
  const resolvedVariant = variant ?? "default"
  const resolvedSize = size ?? "default"

  return (
    <TabsContext.Provider value={{ variant: resolvedVariant, size: resolvedSize }}>
      <HeroTabs.List
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
  "relative inline-flex h-full group-data-vertical/tabs:h-auto flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-transparent font-medium whitespace-nowrap text-muted-foreground shadow-none transition-all duration-150 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      size: {
        default: "px-3.5 py-1 text-xs",
        sm: "px-3 py-0.5 text-xs",
        xs: "px-2.5 py-0 text-[11px]",
        lg: "px-4 py-1 text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

export interface TabsTriggerProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroTabs.Tab>, "id">,
    VariantProps<typeof tabsTriggerVariants> {
  value?: string
  id?: string
}

function TabsTrigger({
  className,
  size,
  value,
  id,
  children,
  render,
  ...props
}: TabsTriggerProps) {
  const context = React.useContext(TabsContext)
  const resolvedSize = size ?? context.size ?? "default"
  const resolvedId = (id ?? value ?? "") as string

  return (
    <HeroTabs.Tab
      id={resolvedId}
      data-slot="tabs-trigger"
      render={(renderProps: any) => {
        const isSelected = renderProps["data-selected"] === true || renderProps["data-selected"] === "true"
        if (render) {
          const custom = (render as any)(renderProps)
          if (React.isValidElement(custom)) {
            return React.cloneElement(custom, {
              "data-active": isSelected ? "" : undefined,
            } as any)
          }
          return custom
        }
        return <div {...renderProps} data-active={isSelected ? "" : undefined} />
      }}
      className={cn(
        tabsTriggerVariants({ size: resolvedSize }),
        // 1. Line 变体
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:shadow-none group-data-[variant=line]/tabs-list:rounded-none",
        "after:absolute after:bg-primary after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        // 2. Ghost 变体（如侧栏纵向导航）
        "group-data-[variant=ghost]/tabs-list:data-active:bg-accent group-data-[variant=ghost]/tabs-list:data-active:text-foreground group-data-[variant=ghost]/tabs-list:data-active:shadow-none group-data-[variant=ghost]/tabs-list:data-active:border-transparent group-data-[variant=ghost]/tabs-list:rounded-md",
        // 3. Segmented / Default 胶囊变体 (HeroUI Floating Pill)
        "data-active:border-transparent data-active:bg-background data-active:text-foreground data-active:shadow-xs data-active:font-semibold rounded-full dark:data-active:border-transparent dark:data-active:bg-neutral-800 dark:data-active:text-foreground data-[selected=true]:border-transparent data-[selected=true]:bg-background data-[selected=true]:text-foreground data-[selected=true]:shadow-xs data-[selected=true]:font-semibold dark:data-[selected=true]:bg-neutral-800 dark:data-[selected=true]:text-foreground",
        className
      )}
      {...props}
    >
      {children}
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
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    >
      {children}
    </HeroTabs.Panel>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants }
