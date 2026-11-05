import * as React from "react"
import { breadcrumbsVariants } from "@heroui/styles"
import { cn } from "@/lib/utils"
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

export interface BreadcrumbProps extends React.ComponentPropsWithRef<"nav"> {
  separator?: React.ReactNode
}

function Breadcrumb({ className, ...props }: BreadcrumbProps) {
  return (
    <nav
      aria-label="breadcrumb"
      data-slot="breadcrumb"
      className={cn(className)}
      {...props}
    />
  )
}

function BreadcrumbList({ className, ...props }: React.ComponentPropsWithRef<"ol">) {
  const slots = breadcrumbsVariants()
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        slots.base(),
        "flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentPropsWithRef<"li">) {
  const slots = breadcrumbsVariants()
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn(slots.item(), "inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export interface BreadcrumbLinkProps extends React.ComponentPropsWithRef<"a"> {
  render?: React.ReactElement | ((props: any) => React.ReactNode)
}

function BreadcrumbLink({
  className,
  render,
  children,
  ...props
}: BreadcrumbLinkProps) {
  const slots = breadcrumbsVariants()
  const linkClassName = cn(
    slots.link(),
    "transition-colors hover:text-foreground",
    className
  )

  if (React.isValidElement(render)) {
    const renderElement = render as React.ReactElement<any>
    return React.cloneElement(renderElement, {
      ...props,
      className: cn(linkClassName, renderElement.props.className),
      children: children ?? renderElement.props.children,
      "data-slot": "breadcrumb-link",
    })
  }

  if (typeof render === "function") {
    return (render as any)({
      ...props,
      className: linkClassName,
      children,
      "data-slot": "breadcrumb-link",
    })
  }

  return (
    <a
      data-slot="breadcrumb-link"
      className={linkClassName}
      {...props}
    >
      {children}
    </a>
  )
}

function BreadcrumbPage({ className, ...props }: React.ComponentPropsWithRef<"span">) {
  const slots = breadcrumbsVariants()
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn(slots.link(), "font-normal text-foreground", className)}
      {...props}
    />
  )
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentPropsWithRef<"li">) {
  const slots = breadcrumbsVariants()
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn(slots.separator(), "[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  )
}

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentPropsWithRef<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn(
        "flex size-5 items-center justify-center [&>svg]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">More</span>
    </span>
  )
}

Breadcrumb.List = BreadcrumbList
Breadcrumb.Item = BreadcrumbItem
Breadcrumb.Link = BreadcrumbLink
Breadcrumb.Page = BreadcrumbPage
Breadcrumb.Separator = BreadcrumbSeparator
Breadcrumb.Ellipsis = BreadcrumbEllipsis

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
