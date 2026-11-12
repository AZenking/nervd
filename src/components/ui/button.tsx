import * as React from "react"
import { Button as HeroUIButton } from "@heroui/react"
import { tv, type VariantProps } from "tailwind-variants"
import { cn } from '@/lib/utils'

const buttonVariants = tv(
  {
    // 圆角规范：HeroUI v3 的 .button 默认 rounded-3xl（24px，h-8 下即胶囊），
    // 按 DESIGN.md §2.2 收紧到 rounded-md（6px）；link 变体无背景形状，不受影响。
    base: "rounded-md",
    variants: {
      variant: {
        default: "",
        primary: "",
        secondary: "",
        outline: "",
        ghost: "",
        destructive: "",
        danger: "",
        "danger-soft": "",
        tertiary: "",
        link: "!bg-transparent text-primary underline-offset-4 hover:underline !shadow-none !h-auto !p-0",
      },
      size: {
        default: "h-8 px-3 text-[13px]",
        xs: "h-6 px-1.5 text-xs gap-1 in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 px-2.5 text-xs gap-1 in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        lg: "h-9 px-4 gap-2",
        icon: "size-8 p-0",
        "icon-xs": "size-6 p-0 rounded-sm in-data-[slot=button-group]:rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 p-0 rounded-sm in-data-[slot=button-group]:rounded-sm",
        "icon-lg": "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
  { twMerge: false }
)

function mapHeroUIVariant(
  variant?: string | null
): "primary" | "secondary" | "tertiary" | "outline" | "ghost" | "danger" | "danger-soft" {
  switch (variant) {
    case "primary":
    case "default":
      return "primary"
    case "secondary":
      return "secondary"
    case "tertiary":
      return "tertiary"
    case "outline":
      return "outline"
    case "ghost":
      return "ghost"
    case "destructive":
    case "danger":
      return "danger"
    case "danger-soft":
      return "danger-soft"
    case "link":
      return "ghost"
    default:
      return "primary"
  }
}

function mapHeroUISize(
  size?: string | null
): { herouiSize: "sm" | "md" | "lg"; isIconOnly?: boolean } {
  switch (size) {
    case "lg":
      return { herouiSize: "lg" }
    case "icon":
      return { herouiSize: "sm", isIconOnly: true }
    case "icon-xs":
    case "icon-sm":
      return { herouiSize: "sm", isIconOnly: true }
    case "icon-lg":
      return { herouiSize: "lg", isIconOnly: true }
    case "xs":
    case "sm":
    case "default":
    default:
      return { herouiSize: "sm" }
  }
}

type BaseHeroUIButtonProps = Omit<
  React.ComponentPropsWithRef<typeof HeroUIButton>,
  "variant" | "size" | "color" | "children" | "className" | "render"
>

export type ButtonProps = BaseHeroUIButtonProps &
  VariantProps<typeof buttonVariants> & {
    disabled?: boolean
    className?: string
    children?: React.ReactNode
    render?: React.ReactNode | ((props: any, state: any) => React.ReactNode)
    title?: string
    tabIndex?: number
    id?: string
  } & Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    keyof BaseHeroUIButtonProps | "children" | "className" | "color"
  >

function Button({
  ref,
  className,
  variant = "default",
  size = "default",
  disabled,
  isDisabled,
  isIconOnly: isIconOnlyProp,
  render,
  children,
  ...props
}: ButtonProps) {
  const { herouiSize, isIconOnly: isIconOnlyCalculated } = mapHeroUISize(size)
  const herouiVariant = mapHeroUIVariant(variant)
  const effectiveIsIconOnly = isIconOnlyProp ?? isIconOnlyCalculated
  const effectiveDisabled = isDisabled ?? disabled

  const resolvedRender = React.useMemo(() => {
    if (React.isValidElement(render)) {
      return (domProps: any) =>
        React.cloneElement(render as React.ReactElement<any>, {
          ...domProps,
          ...(render as React.ReactElement<any>).props,
          title: props.title ?? (render as React.ReactElement<any>).props?.title,
          className: cn(domProps?.className, (render as React.ReactElement<any>).props?.className),
        })
    }
    if (typeof render === "function") {
      return (domProps: any, state: any) => {
        const res = (render as any)(domProps, state)
        if (React.isValidElement(res) && props.title) {
          return React.cloneElement(res as React.ReactElement<any>, { title: props.title })
        }
        return res
      }
    }
    if (props.title) {
      return (domProps: any) =>
        React.createElement(
          "button",
          {
            ...domProps,
            title: props.title,
          },
          domProps.children
        )
    }
    return undefined
  }, [render, props.title])

  return (
    <HeroUIButton
      ref={ref}
      variant={herouiVariant}
      size={herouiSize}
      isIconOnly={effectiveIsIconOnly}
      isDisabled={effectiveDisabled}
      render={resolvedRender}
      className={cn(buttonVariants({ variant, size }), className)}
      {...(props as any)}
    >
      {children}
    </HeroUIButton>
  )
}

const ButtonWithCompound = Object.assign(Button, {
  Root: HeroUIButton.Root,
})

export { ButtonWithCompound as Button, buttonVariants }
