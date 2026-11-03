import * as React from "react"
import { Chip as HeroChip } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "soft" | "primary" | "tertiary"
  color?: "default" | "accent" | "success" | "warning" | "danger"
  size?: "sm" | "md" | "lg"
  render?: React.ReactElement | ((props: any) => React.ReactNode)
}

function Badge({
  className,
  variant = "default",
  color,
  size = "sm",
  children,
  render,
  ...props
}: BadgeProps) {
  let resolvedVariant: "primary" | "secondary" | "tertiary" | "soft" = "soft"
  let resolvedColor: "default" | "accent" | "success" | "warning" | "danger" = "default"

  if (variant === "default") {
    resolvedVariant = "primary"
    resolvedColor = "accent"
  } else if (variant === "destructive") {
    resolvedVariant = "soft"
    resolvedColor = "danger"
  } else if (variant === "outline") {
    resolvedVariant = "secondary"
    resolvedColor = "default"
  } else if (variant === "ghost") {
    resolvedVariant = "tertiary"
    resolvedColor = "default"
  } else if (variant === "soft" || variant === "primary" || variant === "secondary" || variant === "tertiary") {
    resolvedVariant = variant
  }

  const finalColor = color ?? resolvedColor

  if (React.isValidElement(render)) {
    const renderEl = render as React.ReactElement<any>
    return React.cloneElement(renderEl, {
      ...props,
      className: cn(className, renderEl.props.className),
      children: children ?? renderEl.props.children,
    })
  }

  if (typeof render === "function") {
    return (render as any)({
      ...props,
      className,
      children,
    })
  }

  return (
    <HeroChip
      color={finalColor}
      variant={resolvedVariant}
      size={size}
      className={className}
      {...(props as any)}
    >
      {children}
    </HeroChip>
  )
}

const badgeVariants = () => ""

export { Badge, badgeVariants }
