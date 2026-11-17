import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ListBox } from '@/components/ui/list-box';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  findUnknownPlaceholders,
  insertAtSelection,
  missingRequiredTokens,
  renderPatternPreview,
} from '@/lib/branch-pattern';

/** 浮层关闭后焦点回填的等待时间（RAC 关闭动画 + 焦点归还触发器）。 */
const POPOVER_FOCUS_SETTLE_MS = 180;

export interface BranchPatternVariable {
  token: string;
  label: string;
  sample: string;
  description?: string;
}

export interface BranchPatternFieldProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  variables: BranchPatternVariable[];
  placeholder?: string;
  description?: ReactNode;
  required?: boolean;
  /** 必须出现的 token；缺失时给出错误提示。 */
  requiredTokens?: string[];
  error?: string | null;
  className?: string;
  /**
   * 变量入口形态（可选展示配置，默认保持既有行为）：
   * - `chips`（默认）：输入框下方一行可点击变量 chips；
   * - `popover`：字段标签右侧「插入变量」按钮，Popover + ListBox 展示变量含义与示例，
   *   只列出该字段支持的变量。插入逻辑（光标位置 / 选区替换 / 焦点恢复）两者一致。
   */
  variablePicker?: 'chips' | 'popover';
  /** 是否展示字段级实时预览（集中预览时由调用方关闭）。默认 true。 */
  showPreview?: boolean;
}

/**
 * 分支命名模板输入框 + 可点击变量 chips。
 *
 * - 点击变量在当前光标处插入；无光标时追加到末尾；
 * - 插入后恢复焦点，光标停在 token 之后；
 * - 实时展示用示例值展开的预览；
 * - 未知变量 / 缺失必需变量给出可读提示。
 */
export function BranchPatternField({
  id,
  label,
  value,
  onChange,
  variables,
  placeholder,
  description,
  required,
  requiredTokens,
  error,
  className,
  variablePicker = 'chips',
  showPreview = true,
}: BranchPatternFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const samples = useMemo(
    () => Object.fromEntries(variables.map((variable) => [variable.token, variable.sample])),
    [variables],
  );
  const unknown = useMemo(
    () => findUnknownPlaceholders(value, variables.map((variable) => variable.token)),
    [value, variables],
  );
  const missing = useMemo(
    () => (requiredTokens?.length ? missingRequiredTokens(value, requiredTokens) : []),
    [requiredTokens, value],
  );
  const preview = useMemo(() => renderPatternPreview(value, samples), [samples, value]);

  const insert = (token: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const result = insertAtSelection(value, token, start, end);
    onChange(result.value);
    requestAnimationFrame(() => {
      const next = inputRef.current;
      next?.focus();
      next?.setSelectionRange(result.cursor, result.cursor);
    });
    return result.cursor;
  };

  /** Popover 选变量：先按当前光标写入，再关浮层；
   *  浮层关闭会把焦点还给触发器，故关闭后（动画结束）再把焦点与光标校正回输入框。 */
  const pickVariable = (token: string) => {
    const cursor = insert(token);
    setPickerOpen(false);
    window.setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(cursor, cursor);
    }, POPOVER_FOCUS_SETTLE_MS);
  };

  const baseId = useId();
  const descriptionId = `${baseId}-description`;
  const previewId = `${baseId}-preview`;
  const errorId = `${baseId}-error`;
  const unknownId = `${baseId}-unknown`;
  const missingId = `${baseId}-missing`;
  const hasError = Boolean(error) || missing.length > 0;
  const describedBy = [
    description ? descriptionId : null,
    showPreview ? previewId : null,
    unknown.length > 0 ? unknownId : null,
    (error || missing.length > 0) ? errorId : null,
  ].filter(Boolean).join(' ');

  return (
    <Field
      isRequired={required}
      isInvalid={hasError}
      value={value}
      onChange={onChange}
      data-testid="branch-pattern-field"
      className={cn('gap-2', className)}
    >
      {variablePicker === 'popover' ? (
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>{label}</FieldLabel>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={(
                <Button
                  type="button"
                  variant="ghost"
                  size="2xs"
                  aria-label={`为${label}插入变量`}
                  data-testid="branch-pattern-variable-trigger"
                  className="shrink-0 gap-0.5 text-muted-foreground hover:text-foreground"
                />
              )}
            >
              插入变量
              <ChevronDownIcon className="size-3" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-72 p-1">
              <ListBox
                aria-label={`${label}可用变量`}
                className="max-h-64 overflow-y-auto"
                onAction={(key) => pickVariable(String(key))}
              >
                {variables.map((variable) => (
                  <ListBox.Item
                    key={variable.token}
                    id={variable.token}
                    textValue={`${variable.token} ${variable.label}`}
                    data-testid={`branch-pattern-variable-${variable.token.replace(/[{}]/g, '')}`}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5 text-left">
                      <span className="font-mono text-xs text-foreground">{variable.token}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {variable.label}
                        {variable.description ? ` · ${variable.description}` : ''}
                        {` · 例 ${variable.sample}`}
                      </span>
                    </span>
                  </ListBox.Item>
                ))}
              </ListBox>
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <FieldLabel>{label}</FieldLabel>
      )}
      <Input
        id={id}
        ref={inputRef}
        className="font-mono"
        placeholder={placeholder}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        data-testid="branch-pattern-input"
      />
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}

      {variablePicker === 'chips' && (
      <div className="flex flex-wrap items-center gap-1.5" aria-label={`${label} 可用变量`}>
        <span className="shrink-0 text-[11px] text-muted-foreground">插入变量：</span>
        {variables.map((variable) => (
          <Button
            key={variable.token}
            type="button"
            variant="outline"
            size="2xs"
            title={variable.description ?? variable.label}
            aria-label={`插入 ${variable.token}`}
            data-testid={`branch-pattern-chip-${variable.token.replace(/[{}]/g, '')}`}
            onClick={() => insert(variable.token)}
          >
            {variable.token}
          </Button>
        ))}
      </div>
      )}

      {showPreview ? (
        <p id={previewId} className="truncate font-mono text-[11px] text-muted-foreground" data-testid="branch-pattern-preview">
          预览：{preview || '—'}
        </p>
      ) : null}

      {error ? (
        <FieldError id={errorId}>
          {error}
        </FieldError>
      ) : null}
      {unknown.length > 0 ? (
        <FieldError id={unknownId} className="text-warning">
          未知变量：{unknown.join('、')}，不会被展开
        </FieldError>
      ) : null}
      {missing.length > 0 ? (
        <FieldError id={missingId}>
          缺少必需变量：{missing.join('、')}
        </FieldError>
      ) : null}
    </Field>
  );
}
