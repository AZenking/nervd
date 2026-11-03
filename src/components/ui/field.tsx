"use client"

import * as React from "react"
import {
  TextField as HeroUITextField,
  Fieldset as HeroUIFieldset,
  FieldError as HeroUIFieldError,
} from "@heroui/react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from '@/lib/utils'

import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

export interface FieldSetProps
  extends React.ComponentPropsWithRef<typeof HeroUIFieldset.Root> {}

const FieldSet = React.forwardRef<HTMLFieldSetElement, FieldSetProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <HeroUIFieldset.Root
        ref={ref}
        data-slot="field-set"
        className={cn(
          "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
          className
        )}
        {...(props as any)}
      >
        {children}
      </HeroUIFieldset.Root>
    )
  }
)
FieldSet.displayName = "FieldSet"

export interface FieldLegendProps
  extends React.ComponentPropsWithRef<typeof HeroUIFieldset.Legend> {
  variant?: "legend" | "label"
}

const FieldLegend = React.forwardRef<HTMLLegendElement, FieldLegendProps>(
  ({ className, variant = "legend", children, ...props }, ref) => {
    return (
      <HeroUIFieldset.Legend
        ref={ref}
        data-slot="field-legend"
        data-variant={variant}
        className={cn(
          "mb-1.5 font-medium data-[variant=label]:text-[13px] data-[variant=legend]:text-[13px]",
          className
        )}
        {...(props as any)}
      >
        {children}
      </HeroUIFieldset.Legend>
    )
  }
)
FieldLegend.displayName = "FieldLegend"

export interface FieldGroupProps
  extends React.ComponentPropsWithRef<typeof HeroUIFieldset.Group> {}

const FieldGroup = React.forwardRef<HTMLDivElement, FieldGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <HeroUIFieldset.Group
        ref={ref}
        data-slot="field-group"
        className={cn(
          "group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",
          className
        )}
        {...(props as any)}
      >
        {children}
      </HeroUIFieldset.Group>
    )
  }
)
FieldGroup.displayName = "FieldGroup"

const fieldVariants = cva(
  "group/field flex w-full gap-2 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
        horizontal:
          "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
)

export interface FieldProps
  extends Omit<React.ComponentPropsWithRef<typeof HeroUITextField>, "orientation">,
    VariantProps<typeof fieldVariants> {
  orientation?: "vertical" | "horizontal" | "responsive"
}

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, orientation = "vertical", children, ...props }, ref) => {
    return (
      <HeroUITextField
        ref={ref}
        role="group"
        data-slot="field"
        data-orientation={orientation}
        className={cn(fieldVariants({ orientation }), className)}
        {...(props as any)}
      >
        {children}
      </HeroUITextField>
    )
  }
)
Field.displayName = "Field"

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "group/field-content flex flex-1 flex-col gap-0.5 leading-snug",
        className
      )}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 has-[>[data-slot=field]]:has-[:focus-visible]:border-ring has-[>[data-slot=field]]:has-[:focus-visible]:ring-3 has-[>[data-slot=field]]:has-[:focus-visible]:ring-ring/20 *:data-[slot=field]:p-2.5 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-[13px] font-medium group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "description text-left text-[13px] leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "relative -my-2 h-5 text-[13px] group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  )
}

export interface FieldErrorProps extends React.ComponentProps<"div"> {
  errors?: Array<{ message?: string } | undefined>
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: FieldErrorProps) {
  const content = React.useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      data-visible="true"
      className={cn("field-error h-auto opacity-100 text-[13px] font-normal text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

const FieldWithCompound = Object.assign(Field, {
  Label: FieldLabel,
  Description: FieldDescription,
  Error: Object.assign(FieldError, { Root: HeroUIFieldError.Root }),
  Group: FieldGroup,
  Legend: FieldLegend,
  Separator: FieldSeparator,
  Set: FieldSet,
  Content: FieldContent,
  Title: FieldTitle,
  Root: HeroUITextField.Root,
})

export {
  FieldWithCompound as Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
}
