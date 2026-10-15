import type { ReactNode } from 'react';

/**
 * Linear 设置页原语（严格克隆 Linear 的 settings 版式）：
 * - SettingsGroup：标题/描述在上方，下方是 hairline 边的圆角行容器（行间 border-b 分隔）；
 * - SettingsRow：竖排（label + 描述在上、控件整宽在下）用于文本输入类；
 *   横排（label + 描述在左、控件在右）用于开关/选择类。
 */

export function SettingsGroup({
  title,
  description,
  action,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** 组标题行右侧动作（如「添加实例」） */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 px-0.5">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {description && (
            <p className="text-xs leading-5 text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div className="flex flex-col rounded-xl border border-border/60 bg-card/50">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  error,
  htmlFor,
  control,
  /** horizontal：label 左、控件右（开关/选择）；vertical：label 上、控件整宽（输入类） */
  orientation = 'vertical',
  /** 横排时控件的定宽档（输入框如 w-72，开关/按钮等紧凑控件留空自适应靠右） */
  controlWidth,
  /** 垂直对齐方式（默认 center 居中对齐） */
  align = 'center',
}: {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  control: ReactNode;
  orientation?: 'vertical' | 'horizontal';
  controlWidth?: string;
  align?: 'start' | 'center';
}) {
  const header = (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className={`text-[13px] font-medium text-foreground ${htmlFor ? 'cursor-pointer' : ''}`}
      >
        {label}
      </label>
      {description && (
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      )}
      {error}
    </div>
  );

  if (orientation === 'horizontal') {
    return (
      <div
        className={`flex justify-between gap-6 border-b border-border/50 px-4 py-3.5 last:border-b-0 ${
          align === 'start' ? 'items-start' : 'items-center'
        }`}
      >
        {header}
        <div className={`flex shrink-0 items-center justify-end ${controlWidth ?? ''}`}>
          {control}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 border-b border-border/50 px-4 py-3.5 last:border-b-0">
      {header}
      {control}
    </div>
  );
}

/** 行内校验错误（FieldError 的同款语义色，供 SettingsRow.error 使用） */
export function SettingsRowError({ children }: { children: ReactNode }) {
  return <p className="text-xs text-destructive">{children}</p>;
}
