import { useEffect, useMemo, useState } from 'react';
import { Alert, ListBox, Select } from '@heroui/react';
import { GitForkIcon, SaveIcon } from 'lucide-react';
import * as attributionApi from '@/lib/attribution-api';
import { useApp } from '@/store/app';
import { humanizeError } from '@/lib/error-format';
import { BranchPatternField, type BranchPatternVariable } from './BranchPatternField';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { expandBranchPattern } from '@/components/iteration/requirement/types';
import type {
  BranchTrackTopology,
  ChildBranchBase,
  ChildMrTarget,
} from '@/types/branch-topology';

/** 子分支模式：由 childPattern 三态推导（null / '' / 自定义 pattern）。 */
type TopologyMode = 'legacy' | 'none' | 'custom';

interface FieldOption<T extends string> {
  value: T;
  label: string;
}

const MODE_OPTIONS: Array<FieldOption<TopologyMode>> = [
  { value: 'legacy', label: '沿用模板（legacy）' },
  { value: 'none', label: '不建子分支（共用需求分支）' },
  { value: 'custom', label: '自定义子分支模式' },
];

const BASE_OPTIONS: Array<FieldOption<ChildBranchBase>> = [
  { value: 'requirement', label: '需求分支' },
  { value: 'baseline', label: '迭代基准' },
];

const MR_TARGET_OPTIONS: Array<FieldOption<ChildMrTarget>> = [
  { value: 'parent', label: '父需求分支' },
  { value: 'baseline', label: '迭代基准' },
];

const ALLOWED_PLACEHOLDER = /\{(?:identifier|parentIdentifier|iteration|template|track|iterationEnd|date|yyyy|MM|dd)\}/g;
const DEFAULT_CHILD_PATTERN = 'bugfix/{identifier}';

/** 自定义模式校验：非空 + 仅允许 5 个占位符。 */
function validateChildPattern(pattern: string): string | null {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return '自定义模式不能为空；若不建子分支请选择「不建子分支」。';
  }
  const leftover = trimmed.replace(ALLOWED_PLACEHOLDER, '');
  if (/[{}]/.test(leftover)) {
    return '仅支持 {identifier}、{parentIdentifier}、{iteration}、{track}、{iterationEnd}、{yyyy}/{MM}/{dd} 占位符。';
  }
  return null;
}

function modeOf(topology: BranchTrackTopology): TopologyMode {
  if (topology.childPattern == null) return 'legacy';
  return topology.childPattern === '' ? 'none' : 'custom';
}

function FieldSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<FieldOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <Select
        className="w-full text-xs"
        aria-label={label}
        selectedKey={value}
        isDisabled={disabled}
        onSelectionChange={(key) => {
          if (key != null) onChange(String(key) as T);
        }}
      >
        <Select.Trigger className="h-8 text-xs">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {options.map((option) => (
              <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-mono text-[11px] text-foreground/90" title={value}>
        {value || '—'}
      </span>
    </div>
  );
}

export interface BranchTopologyFieldsProps {
  /** 持久化后的模板 ID（分支拓扑以 trackId 为键，新建模板未保存时不渲染本组件）。 */
  trackId: string;
  templateName?: string;
  iterationName?: string;
  /** 预览用，默认 REQ-101。 */
  parentIdentifier?: string;
  /** 预览用，默认 BUG-303。 */
  childIdentifier?: string;
  /** 预览用：迭代结束日（YYYY-MM-DD），用于 {iterationEnd}/{yyyy}/{MM}/{dd}。 */
  iterationEndDate?: string;
  /** 预览用：迭代基准分支模板，默认 iteration/{iteration}/{track}。 */
  baselinePattern?: string;
  /** 预览用：需求开发分支模板，默认 feature/{identifier}。 */
  workitemPattern?: string;
  /** 父需求分支是否已存在（真实存在性由调用方查询；缺省按存在处理）。 */
  parentBranchExists?: boolean;
  /** 写操作门控：写权限关闭时阻止保存并在面板内给出明确提示（由设置页/模板管理器传入） */
  readOnly?: boolean;
}

/**
 * 分支模板的子分支拓扑配置（legacy / none / custom + 基点 + MR 目标）。
 *
 * 只通过 trackId 读写拓扑：新建模板尚无持久化 trackId，调用方必须在保存模板后
 * 再挂载本组件，避免触发 track 外键约束。
 */
export function BranchTopologyFields({
  trackId,
  templateName,
  iterationName,
  parentIdentifier = 'REQ-101',
  childIdentifier = 'BUG-303',
  iterationEndDate,
  baselinePattern = 'iteration/{iteration}/{track}',
  workitemPattern = 'feature/{identifier}',
  parentBranchExists = true,
  readOnly = false,
}: BranchTopologyFieldsProps) {
  const [mode, setMode] = useState<TopologyMode>('legacy');
  const [pattern, setPattern] = useState(DEFAULT_CHILD_PATTERN);
  const [childBase, setChildBase] = useState<ChildBranchBase>('requirement');
  const [childMrTarget, setChildMrTarget] = useState<ChildMrTarget>('parent');
  const [loading, setLoading] = useState(Boolean(trackId));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoaded(false);
    setError(null);

    attributionApi
      .getBranchTrackTopology({ trackId })
      .then((topology) => {
        if (cancelled) return;
        const nextMode = modeOf(topology);
        setMode(nextMode);
        setPattern(
          nextMode === 'custom' && topology.childPattern
            ? topology.childPattern
            : DEFAULT_CHILD_PATTERN,
        );
        setChildBase(topology.childBase ?? 'requirement');
        setChildMrTarget(topology.childMrTarget ?? 'parent');
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(`子分支拓扑读取失败：${humanizeError(err, '请稍后重试')}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const patternError = mode === 'custom' ? validateChildPattern(pattern) : null;
  const dateSample = iterationEndDate?.trim() || '2026-10-29';
  const compactDate = dateSample.replace(/-/g, '');

  const childPatternVariables = useMemo<BranchPatternVariable[]>(
    () => [
      { token: '{identifier}', label: '子项编号', sample: childIdentifier },
      { token: '{parentIdentifier}', label: '父需求编号', sample: parentIdentifier },
      { token: '{iteration}', label: '迭代名', sample: iterationName?.trim() || 'Sprint-1' },
      { token: '{track}', label: '轨道名', sample: templateName?.trim() || '默认模板' },
      { token: '{iterationEnd}', label: '迭代结束日', sample: compactDate },
      { token: '{yyyy}', label: '年', sample: compactDate.slice(0, 4) },
      { token: '{MM}', label: '月', sample: compactDate.slice(4, 6) },
      { token: '{dd}', label: '日', sample: compactDate.slice(6, 8) },
    ],
    [childIdentifier, compactDate, iterationName, parentIdentifier, templateName],
  );

  const previewValues = useMemo(
    () => ({
      iteration: iterationName?.trim() || 'Sprint-1',
      template: templateName?.trim() || '默认模板',
      identifier: childIdentifier,
      parentIdentifier,
      iterationEnd: dateSample,
    }),
    [childIdentifier, dateSample, iterationName, parentIdentifier, templateName],
  );

  const baselineBranch = useMemo(
    () =>
      expandBranchPattern(baselinePattern, {
        ...previewValues,
        identifier: parentIdentifier,
      }),
    [baselinePattern, parentIdentifier, previewValues],
  );
  const parentBranch = useMemo(
    () =>
      expandBranchPattern(workitemPattern, {
        ...previewValues,
        identifier: parentIdentifier,
      }),
    [parentIdentifier, workitemPattern, previewValues],
  );
  const childBranch = useMemo(() => {
    if (mode === 'none') return parentBranch;
    const childPattern = mode === 'legacy' ? workitemPattern : pattern;
    return expandBranchPattern(childPattern, previewValues);
  }, [mode, parentBranch, pattern, previewValues, workitemPattern]);

  const warning = !parentBranchExists
    ? `父需求分支 ${parentBranch} 不存在：实际解析会回退到迭代基准 ${baselineBranch}。`
    : mode === 'legacy'
      ? '当前为 legacy 模式：子分支仍按需求分支模板展开子项编号；父需求分支缺失时不会自动回退。'
      : null;

  const save = async () => {
    if (!trackId) return;
    if (patternError) {
      setError(patternError);
      return;
    }
    if (readOnly) {
      const text = '当前处于只读模式：保存子分支拓扑是写操作，请先在「设置 → 安全」开启写权限。';
      setError(text);
      useApp.getState().setToast({ kind: 'fail', text });
      return;
    }

    const topology: BranchTrackTopology = {
      trackId,
      childPattern: mode === 'legacy' ? null : mode === 'none' ? '' : pattern.trim(),
      childBase,
      childMrTarget,
    };

    setSaving(true);
    setError(null);
    try {
      const saved = await attributionApi.saveBranchTrackTopology({ trackId, topology });
      if (!saved) throw new Error('后端未确认拓扑保存结果');
      useApp.getState().setToast({ kind: 'ok', text: '子分支拓扑已保存' });
    } catch (err) {
      const text = `子分支拓扑保存失败：${humanizeError(err, '请稍后重试')}`;
      setError(text);
      useApp.getState().setToast({ kind: 'fail', text });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      data-testid="branch-topology-fields"
      className="flex flex-col gap-3 rounded-lg border border-border/60 bg-surface-secondary/25 p-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <GitForkIcon className="size-3.5 text-primary" aria-hidden="true" />
            子分支拓扑
          </span>
          <p className="text-[11px] leading-5 text-muted-foreground">
            控制缺陷 / 子任务从哪条分支切出、MR 合回哪里；保存后对新建子分支生效。
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/80" title={trackId}>
          {trackId.slice(0, 8)}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          正在读取子分支拓扑…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldSelect
              label="子分支模式"
              value={mode}
              options={MODE_OPTIONS}
              disabled={saving}
              onChange={setMode}
            />
            {mode === 'custom' ? (
              <BranchPatternField
                label="子分支命名模式"
                value={pattern}
                onChange={setPattern}
                variables={childPatternVariables}
                placeholder="bugfix/{identifier}"
                description={'支持 {identifier}、{parentIdentifier}、{iteration}、{track}、{iterationEnd}、{yyyy}/{MM}/{dd}；例如 feature/{parentIdentifier}/{identifier}。'}
                requiredTokens={['{identifier}']}
                error={patternError}
              />
            ) : (
              <div className="flex flex-col justify-end gap-1 pb-1 text-[11px] leading-5 text-muted-foreground">
                {mode === 'legacy'
                  ? '子分支 = 需求分支模板按子项编号展开（沿用现有行为）。'
                  : '不创建子分支，子项直接使用父需求分支。'}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FieldSelect
              label="子分支基点"
              value={childBase}
              options={BASE_OPTIONS}
              disabled={saving || mode === 'none'}
              onChange={setChildBase}
            />
            <FieldSelect
              label="MR 目标分支"
              value={childMrTarget}
              options={MR_TARGET_OPTIONS}
              disabled={saving || mode === 'none'}
              onChange={setChildMrTarget}
            />
          </div>

          <div
            data-testid="branch-topology-preview"
            className="flex flex-col gap-1 rounded-md border border-border/50 bg-background/60 px-3 py-2.5"
          >
            <span className="mb-0.5 text-xs font-semibold text-muted-foreground">
              分支预览
            </span>
            <div data-line="baseline">
              <PreviewLine label="迭代基准" value={baselineBranch} />
            </div>
            <div data-line="parent">
              <PreviewLine label="需求分支" value={parentBranch} />
            </div>
            <div data-line="child">
              <PreviewLine
                label="子分支"
                value={mode === 'none' ? `${childBranch}（共用需求分支）` : childBranch}
              />
            </div>
          </div>

          {warning && (
            <Alert status="warning" className="rounded-md px-2.5 py-2 shadow-none">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description className="text-[11px] leading-5">
                  {warning}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {(patternError || error) && (
            <p className="text-xs text-destructive" role="alert">
              {patternError ?? error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            {readOnly && (
              <span className="mr-auto text-[11px] text-muted-foreground">
                写操作已关闭：需在「设置 → 安全」中开启（需写权限令牌）。
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving || loading || !loaded || Boolean(patternError)}
              aria-disabled={readOnly || undefined}
              title={readOnly ? '写操作已关闭：需在「设置 → 安全」中开启' : undefined}
              onClick={() => void save()}
            >
              {saving ? <Spinner className="size-3.5" /> : <SaveIcon className="size-3.5" />}
              {saving ? '保存中…' : '保存子分支拓扑'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}