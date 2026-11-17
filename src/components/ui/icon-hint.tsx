import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * 图标提示（DESIGN §F.1：说明性小字一律收敛为「图标 + Tooltip」）。
 *
 * 统一保证三件事，避免各调用点各写一套导致图标不居中 / 可访问名缺失：
 * 1. 尺寸档位固定为方形 icon 档，内部图标 `shrink-0` 且垂直居中；
 * 2. 始终带 `aria-label`（Tooltip 文案同时作为可访问名）；
 * 3. 默认不参与文本流（`inline-flex` + `align-middle`），可以安全地嵌在文字行里。
 */
export function IconHint({
  label,
  icon,
  onPress,
  size = "xs",
  variant = "ghost",
  side = "top",
  className,
  contentClassName,
  ariaLabel,
}: {
  /** Tooltip 文案（同时作为可访问名）。 */
  label: ReactNode;
  icon: ReactNode;
  onPress?: () => void;
  /** 按钮档位：2xs / xs / icon-xs / icon-sm / icon */
  size?: "2xs" | "xs" | "icon-xs" | "icon-sm" | "icon";
  variant?: "ghost" | "tertiary" | "secondary";
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
}) {
  const trigger = (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      onPress={onPress}
      className={cn("shrink-0 align-middle", onPress ? "cursor-pointer" : "cursor-help", className)}
    >
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
    </Button>
  )

  if (!onPress) {
    // 纯说明：用 span 承载，避免出现「看起来能点但没反应」的按钮语义
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="img"
              aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
              className={cn(
                "inline-flex size-6 shrink-0 cursor-help items-center justify-center rounded-sm align-middle text-muted-foreground/70 hover:text-foreground",
                className,
              )}
            />
          }
        >
          <span className="inline-flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
        </TooltipTrigger>
        <TooltipContent side={side} className={contentClassName}>{label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent side={side} className={contentClassName}>{label}</TooltipContent>
    </Tooltip>
  )
}
