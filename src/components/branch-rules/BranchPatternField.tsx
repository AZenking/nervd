import { useMemo, useRef, type ReactNode } from 'react';
import { Description, Label, TextField } from '@heroui/react';
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

  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="branch-pattern-field">
      <TextField isRequired={required} value={value} onChange={onChange}>
        <Label>{label}</Label>
        <Input
          id={id}
          ref={inputRef}
          className="font-mono"
          placeholder={placeholder}
          data-testid="branch-pattern-input"
        />
        {description ? <Description>{description}</Description> : null}
      </TextField>

      <div className="flex flex-wrap items-center gap-1.5" aria-label={`${label} 可用变量`}>
        <span className="shrink-0 text-[11px] text-muted-foreground">插入变量：</span>
        {variables.map((variable) => (
          <Button
            key={variable.token}
            type="button"
            variant="outline"
            size="xs"
            className="h-6 rounded-md px-1.5 font-mono text-[10px] font-normal text-muted-foreground hover:text-foreground"
            title={variable.description ?? variable.label}
            aria-label={`插入 ${variable.token}`}
            data-testid={`branch-pattern-chip-${variable.token.replace(/[{}]/g, '')}`}
            onClick={() => insert(variable.token)}
          >
            {variable.token}
          </Button>
        ))}
      </div>

      <p className="truncate font-mono text-[11px] text-muted-foreground" data-testid="branch-pattern-preview">
        预览：{preview || '—'}
      </p>

      {error ? (
        <p role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      ) : null}
      {unknown.length > 0 ? (
        <p role="alert" className="text-[11px] text-warning">
          未知变量：{unknown.join('、')}，不会被展开
        </p>
      ) : null}
      {missing.length > 0 ? (
        <p role="alert" className="text-[11px] text-danger">
          缺少必需变量：{missing.join('、')}
        </p>
      ) : null}
    </div>
  );
}
