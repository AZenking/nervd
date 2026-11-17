import * as React from "react"
import { Button as HeroUIButton } from "@heroui/react"
import { tv, type VariantProps } from "tailwind-variants"
import { cn } from '@/lib/utils'

const buttonVariants = tv(
  {
    // 圆角规范：HeroUI v3 的 .button 默认 rounded-3xl（24px，h-8 下即胶囊），
    // 按 DESIGN.md §2.2 收紧到 6px —— 该覆盖统一在 theme.css 的 `@layer components .button`
    // 中承载（避免包装层与事实源双写）；本层只负责密度档位。
    base: "",
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
        // 2xs：表格/徽标行内的微型图标或文字按钮（原调用点靠 h-5/h-6 + text-[11px] 手拼）
        "2xs": "h-5 px-1 text-[11px] gap-1 [&_svg:not([class*='size-'])]:size-3",
        // 分组内圆角一律交回 theme.css 的 .button-group 规则（内角直角 / 只修外缘两角），
        // 这里不得再写 in-data-[slot=button-group]:rounded-* —— 那会把每个按钮重新描成独立圆角块。
        xs: "h-6 px-1.5 text-xs gap-1 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 px-2.5 text-xs gap-1 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-9 px-4 gap-2",
        // inline：把状态徽标/文本当作按钮内容时不占固定行高（原调用点靠 h-auto py-1 手拼）
        inline: "h-auto px-1.5 py-1 font-normal",
        // bare：按钮只作为「可点击容器」包住 Chip / 整行内容（零内距、零字重），
        // 取代调用点手写 `p-0 font-normal` 这类覆盖
        bare: "h-auto p-0 font-normal",
        icon: "size-8 p-0",
        "icon-xs": "size-6 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 p-0",
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

/**
 * DESIGN.md Part 1 · Components（Buttons）语义变体映射：
 * - `primary`    主操作（唯一强调动作；一个上下文只允许一个 primary）→ HeroUI primary
 * - `secondary`  备选动作 → HeroUI secondary
 * - `tertiary`   低强调 / 消解性动作 → HeroUI tertiary
 * - `outline`    描边低强调 → HeroUI outline
 * - `ghost`      无底色低强调（含文字链 `link`，视觉上只保留文字）→ HeroUI ghost
 * - `danger`     破坏性动作 → HeroUI danger（`destructive` 为历史别名，同义）
 * - `danger-soft` 较轻的破坏性动作 → HeroUI danger-soft
 *
 * 兼容别名：`default` 等价于 `primary`（历史调用点大量使用 `variant="default"`），
 * 未识别的取值同样回落到 `primary`。语义以变体名为准，不按颜色自造新档位
 * （DESIGN：reach for an existing variant instead of restyling a button）。
 * "一个上下文只一个 primary" 属调用点约定，原语层不做运行时拦截。
 */
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
