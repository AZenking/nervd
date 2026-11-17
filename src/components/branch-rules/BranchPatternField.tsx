import { useId, useMemo, useRef, type ReactNode } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  findUnknownPlaceholders,
  insertAtSelection,
  missingRequiredTokens,
  renderPatternPreview,
} from '@/lib/branch-pattern';

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
}: BranchPatternFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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
    previewId,
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
      <FieldLabel>{label}</FieldLabel>
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

      <div className="flex flex-wrap items-center gap-1.5" aria-label={`${label} 可用变量`}>
        <span className="shrink-0 text-[11px] text-muted-foreground">插入变量：</span>
        {variables.map((variable) => (
          <Button
            key={variable.token}
            type="button"
            variant="outline"
            size="xs"
            className="font-mono text-[10px] font-normal"
            title={variable.description ?? variable.label}
            aria-label={`插入 ${variable.token}`}
            data-testid={`branch-pattern-chip-${variable.token.replace(/[{}]/g, '')}`}
            onClick={() => insert(variable.token)}
          >
            {variable.token}
          </Button>
        ))}
      </div>

      <p id={previewId} className="truncate font-mono text-[11px] text-muted-foreground" data-testid="branch-pattern-preview">
        预览：{preview || '—'}
      </p>

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
