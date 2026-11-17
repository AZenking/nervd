import type { ReactNode } from 'react';
import { InfoIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SectionHeader } from '@/components/section-header';

/**
 * Linear 设置页原语（全面迁移至 HeroUI Card 复合组件，借足 Card 全部插槽与属性）：
 * - SettingsGroup：
 *   · Card.Root —— 整组容器（variant 默认 bg-surface + 显式 shadow-none：nervd 2.6 页内卡片
 *     一律 hairline 无阴影；p-0 gap-0 + overflow-hidden
 *     裁切行悬停底色于圆角内）；
 *   · Card.Header —— 组标题统一走 SectionHeader（DESIGN 第三部分 B：区块标题禁止内联复刻）。
 *     组说明不再占据标题下方一行：标题后跟一枚 info 图标，悬停 / 聚焦由 HeroUI Tooltip 展开；
 *     同一份说明以 sr-only 文本保留在无障碍树中；
 *   · Card.Content —— 行容器（gap-0，行自带 px-4 内距与 border-b 分隔）；
 *   · Card.Footer —— 组级底部操作槽（footer，可选，右对齐 + 上缘 hairline）；
 * - SettingsRow：竖排（label + 描述在上、控件整宽在下）用于文本输入类；
 *   横排（label + 描述在左、控件在右）用于开关/选择类。
 */

export function SettingsGroup({
  title,
  description,
  action,
  footer,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** 组标题行右侧动作（如「添加实例」），落在 Card.Header 右侧 */
  action?: ReactNode;
  /** 组级底部操作区（Card.Footer 槽位，如组级测试/保存动作） */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const hasHeader = title != null || description != null || action != null;
  const plainTitle = typeof title === 'string' || typeof title === 'number' ? String(title) : null;
  const descriptionHint = description != null && (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={plainTitle ? `查看「${plainTitle}」说明` : '查看说明'}
            className="relative shrink-0 cursor-help text-muted-foreground/80 after:absolute after:-inset-1.5 after:content-[''] hover:bg-transparent hover:text-foreground"
          />
        }
      >
        <InfoIcon className="size-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm text-xs leading-5">
        {description}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-none">
      {hasHeader && (
        <Card.Header className="flex-col items-stretch gap-2 px-4 py-3.5">
          <SectionHeader title={title} action={action} titleAdornment={descriptionHint} />
          {description && <span className="sr-only">{description}</span>}
        </Card.Header>
      )}

      <Card.Content className="gap-0">{children}</Card.Content>

      {footer && (
        <Card.Footer className="justify-end gap-2 border-t border-border/50 px-4 py-3">
          {footer}
        </Card.Footer>
      )}
    </Card>
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
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const header = (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {htmlFor ? (
        // 有 htmlFor：走 ui/label 的 Label，点击标签聚焦关联控件（无障碍名由控件继承）
        <Label htmlFor={htmlFor} className="cursor-pointer font-medium text-foreground">
          {label}
        </Label>
      ) : (
        // 无 htmlFor：本行没有可关联的表单控件（开关/按钮/徽标），只渲染文本，不产生孤儿 label
        <span className="text-[13px] font-medium text-foreground">{label}</span>
      )}
      {description && (
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      )}
      {error && (
        <div id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </div>
      )}
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

/** 行内校验错误文本（role="alert" 与 aria-describedby 由 SettingsRow 统一承载） */
export function SettingsRowError({ children }: { children: ReactNode }) {
  return <span className="text-xs text-destructive">{children}</span>;
}
