import * as React from "react"
import { Chip as HeroChip } from "@heroui/react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "border-transparent bg-transparent text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  render?: React.ReactElement | ((props: any) => React.ReactNode)
}

function Badge({
  className,
  variant = "default",
  children,
  render,
  ...props
}: BadgeProps) {
  const badgeClassName = cn(badgeVariants({ variant }), className)

  if (React.isValidElement(render)) {
    const renderEl = render as React.ReactElement<any>
    return React.cloneElement(renderEl, {
      ...props,
      className: cn(badgeClassName, renderEl.props.className),
      children: children ?? renderEl.props.children,
      "data-slot": "badge",
    })
  }

  if (typeof render === "function") {
    return (render as any)({
      ...props,
      className: badgeClassName,
      children,
      "data-slot": "badge",
    })
  }

  return (
    <HeroChip
      data-slot="badge"
      className={badgeClassName}
      {...(props as any)}
    >
      {children}
    </HeroChip>
  )
}

export { Badge, badgeVariants }
