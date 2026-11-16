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
  /**
   * 历史遗留的尺寸入参（audit P2-08）：HeroUI v3 的 Tabs 根只接受
   * variant（primary/secondary）与 align，没有 size 维度，故该值既不透传也不改变渲染。
   * 全仓 10+ 调用方仍在使用 `size="sm"`，删除声明会波及本文件之外的类型检查，
   * 因此保留为兼容占位；待调用方统一迁移后再移除。
   */
  size?: "default" | "sm" | "xs" | "lg"
}

function TabsList({
  className,
  containerClassName,
  size: _size,
  children,
  ...props
}: TabsListProps) {
  return (
    <HeroTabs.ListContainer
      className={cn(
        "w-fit",
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
      className={cn("whitespace-nowrap gap-1.5 text-foreground", className)}
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
