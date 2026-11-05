import type { ReactNode } from 'react';
import { Alert } from '@heroui/react';
import { Card } from '@/components/ui/card';

/**
 * Linear 设置页原语（全面迁移至 HeroUI Card 复合组件，借足 Card 全部插槽与属性）：
 * - SettingsGroup：
 *   · Card.Root —— 整组容器（variant 默认 bg-surface + 显式 shadow-none：nervd 2.6 页内卡片
 *     一律 hairline 无阴影；p-0 gap-0 + overflow-hidden
 *     裁切行悬停底色于圆角内）；
 *   · Card.Header —— 组标题（Card.Title 默认 h3 字阶）+ 组说明（HeroUI Alert default 态紧凑呈现，
 *     Indicator + Description 结构，收敛 text-xs）+ 标题行右侧动作（action），
 *     上缘 hairline 与行区分隔；
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

  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-none">
      {hasHeader && (
        <Card.Header className="flex-row items-start justify-between gap-4 border-b border-border/50 px-4 py-3.5">
          <div className="flex min-w-0 flex-col gap-1">
            <Card.Title>{title}</Card.Title>
            {description && (
              // 组说明统一以 HeroUI Alert（default）承载：Indicator 图标 + Description，
              // 紧凑密度（text-xs / 小内距 / rounded-md）避免在 Card 头部喧宾夺主。
              <Alert status="default" className="gap-2.5 rounded-md px-2.5 py-2 shadow-none">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description className="text-xs leading-5 text-muted-foreground">
                    {description}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
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
