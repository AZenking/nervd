import * as React from "react"
import { Avatar as HeroAvatar, AvatarGroup as HeroAvatarGroup } from "@heroui/react"
import { UserIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

export function getAvatarColorClass(name?: string, isAssigned?: boolean): string {
  if (isAssigned) {
    return 'bg-primary/15 text-primary border-primary/30 font-semibold'
  }
  if (!name) {
    return 'bg-muted/50 text-muted-foreground border-border/40'
  }
  const colors = [
    'bg-(--avatar-indigo)/15 text-(--avatar-indigo) border-(--avatar-indigo)/30 font-medium',
    'bg-(--avatar-sky)/15 text-(--avatar-sky) border-(--avatar-sky)/30 font-medium',
    'bg-(--avatar-emerald)/15 text-(--avatar-emerald) border-(--avatar-emerald)/30 font-medium',
    'bg-(--avatar-amber)/15 text-(--avatar-amber) border-(--avatar-amber)/30 font-medium',
    'bg-(--avatar-rose)/15 text-(--avatar-rose) border-(--avatar-rose)/30 font-medium',
    'bg-(--avatar-purple)/15 text-(--avatar-purple) border-(--avatar-purple)/30 font-medium',
    'bg-(--avatar-teal)/15 text-(--avatar-teal) border-(--avatar-teal)/30 font-medium',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export interface AvatarProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroAvatar>, "size"> {
  size?: "default" | "sm" | "md" | "lg"
}

function Avatar({
  className,
  size = "default",
  children,
  ...props
}: AvatarProps) {
  const heroSize = size === "default" ? "md" : size
  return (
    <HeroAvatar
      data-slot="avatar"
      data-size={size}
      size={heroSize}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 rounded-full select-none overflow-hidden",
        className
      )}
      {...props}
    >
      {children}
    </HeroAvatar>
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof HeroAvatar.Image>) {
  return (
    <HeroAvatar.Image
      data-slot="avatar-image"
      className={cn(
        "aspect-square size-full rounded-full object-cover",
        className
      )}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<typeof HeroAvatar.Fallback>) {
  return (
    <HeroAvatar.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted/60 text-sm font-medium text-foreground/90 group-data-[size=sm]/avatar:text-xs",
        className
      )}
      {...props}
    >
      {children}
    </HeroAvatar.Fallback>
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof HeroAvatarGroup>) {
  return (
    <HeroAvatarGroup
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof HeroAvatarGroup.Count>) {
  return (
    <HeroAvatarGroup.Count
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export interface UserAvatarProps {
  name?: string
  avatarUrl?: string
  isAssigned?: boolean
  size?: "xs" | "sm" | "md" | "lg"
  showName?: boolean
  className?: string
}

export function UserAvatar({
  name,
  avatarUrl,
  isAssigned = false,
  size = "sm",
  showName = true,
  className,
}: UserAvatarProps) {
  const colorClass = getAvatarColorClass(name, isAssigned)
  const initial = name ? name.trim().charAt(0) : '?'
  const sizeMap = {
    xs: { root: 'size-4 text-[9px]', nameText: 'text-[11px]' },
    sm: { root: 'size-5 text-[10px]', nameText: 'text-xs' },
    md: { root: 'size-7 text-xs', nameText: 'text-xs' },
    lg: { root: 'size-9 text-sm', nameText: 'text-sm' },
  }
  const currentSize = sizeMap[size] || sizeMap.sm

  if (!name || name === '待分配' || name === '未分配' || name === '—') {
    const unassignedBadge = (
      <span className={cn('flex items-center justify-center rounded-full border border-dashed border-border/80 bg-muted/20 shrink-0', currentSize.root)}>
        <UserIcon className="size-3 opacity-60" />
      </span>
    )
    if (showName) {
      return (
        <span className={cn('inline-flex items-center gap-1.5 text-muted-foreground/60 transition-colors', className)}>
          {unassignedBadge}
          <span className={cn('hidden lg:inline text-muted-foreground/70 font-normal', currentSize.nameText)}>待分配</span>
        </span>
      )
    }
    // 姓名未展示时以 Tooltip 补齐语义
    return (
      <Tooltip delay={300}>
        <TooltipTrigger
          render={<span className="inline-flex cursor-default items-center select-none" aria-label="待分配" />}
          className={className}
        >
          {unassignedBadge}
        </TooltipTrigger>
        <TooltipContent>待分配</TooltipContent>
      </Tooltip>
    )
  }

  const avatarEl = (
    <Avatar
      size={size === 'xs' ? 'sm' : size}
      className={cn('shrink-0 rounded-full border', currentSize.root, colorClass)}
    >
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className="size-full flex items-center justify-center font-medium bg-transparent">
        {initial}
      </AvatarFallback>
    </Avatar>
  )

  if (showName) {
    return (
      <span
        className={cn(
          'group/user-badge inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 transition-colors',
          'bg-muted/40 border border-transparent',
          isAssigned && 'bg-primary/10 border-primary/25',
          className
        )}
      >
        {avatarEl}
        <span
          className={cn(
            'truncate max-w-24 select-none',
            currentSize.nameText,
            isAssigned ? 'font-medium text-foreground' : 'text-foreground/85'
          )}
        >
          {name}
        </span>
      </span>
    )
  }

  // 仅展示姓氏首字，全名通过 Tooltip 呈现（hover / 键盘 focus）
  return (
    <Tooltip delay={300}>
      <TooltipTrigger
        render={<span className="inline-flex cursor-default items-center select-none" aria-label={name} />}
        className={className}
      >
        {avatarEl}
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  )
}

Avatar.Image = AvatarImage
Avatar.Fallback = AvatarFallback
Avatar.Badge = AvatarBadge
Avatar.Group = AvatarGroup
Avatar.GroupCount = AvatarGroupCount

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
