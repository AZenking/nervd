import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BranchPatternField, type BranchPatternVariable } from './BranchPatternField';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const VARIABLES: BranchPatternVariable[] = [
  { token: '{iteration}', label: '迭代名', sample: 'Sprint-1' },
  { token: '{track}', label: '轨道名', sample: 'chery' },
  { token: '{identifier}', label: '工作项编号', sample: 'REQ-101' },
  { token: '{iterationEnd}', label: '迭代结束日', sample: '20261029' },
];

function Harness({ initial = 'feature/' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <BranchPatternField
      label="命名模板"
      value={value}
      onChange={setValue}
      variables={VARIABLES}
      requiredTokens={['{identifier}']}
    />
  );
}

function PopoverHarness() {
  const [value, setValue] = useState('feature/');
  return (
    <BranchPatternField
      label="命名模板"
      value={value}
      onChange={setValue}
      variables={[VARIABLES[0], VARIABLES[1]]}
      variablePicker="popover"
      showPreview={false}
    />
  );
}

describe('BranchPatternField', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('点击变量插入到输入框并更新预览', async () => {
    await act(async () => root.render(<Harness />));
    const input = container.querySelector<HTMLInputElement>('[data-testid="branch-pattern-input"]');
    expect(input).not.toBeNull();
    input!.setSelectionRange(8, 8);

    const chip = container.querySelector<HTMLButtonElement>('[data-testid="branch-pattern-chip-identifier"]');
    expect(chip).not.toBeNull();
    await act(async () => chip!.click());

    expect(input!.value).toBe('feature/{identifier}');
    expect(container.querySelector('[data-testid="branch-pattern-preview"]')?.textContent).toContain(
      'feature/REQ-101',
    );
  });

  it('日期变量可插入并展开为迭代结束日', async () => {
    await act(async () => root.render(<Harness initial="hotfix/" />));
    const input = container.querySelector<HTMLInputElement>('[data-testid="branch-pattern-input"]');
    input!.setSelectionRange(7, 7);
    const chip = container.querySelector<HTMLButtonElement>('[data-testid="branch-pattern-chip-iterationEnd"]');
    await act(async () => chip!.click());
    expect(input!.value).toBe('hotfix/{iterationEnd}');
    expect(container.querySelector('[data-testid="branch-pattern-preview"]')?.textContent).toContain(
      'hotfix/20261029',
    );
  });

  it('未知变量与缺失必需变量给出提示', async () => {
    await act(async () => root.render(<Harness initial="feature/{slug}" />));
    expect(container.textContent).toContain('未知变量');
    expect(container.textContent).toContain('缺少必需变量');
  });
});

describe('BranchPatternField · 插入变量 Popover', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });

  it('变量入口收敛为「插入变量」按钮，且不再渲染字段级预览', async () => {
    await act(async () => root.render(<PopoverHarness />));

    expect(container.querySelector('[data-testid="branch-pattern-variable-trigger"]')).not.toBeNull();
    expect(container.querySelector('[data-testid^="branch-pattern-chip-"]')).toBeNull();
    expect(container.querySelector('[data-testid="branch-pattern-preview"]')).toBeNull();
  });

  it('列表只列出该字段支持的变量，选中后插入到光标处并恢复焦点', async () => {
    await act(async () => root.render(<PopoverHarness />));
    const input = container.querySelector<HTMLInputElement>('[data-testid="branch-pattern-input"]')!;
    input.focus();
    input.setSelectionRange(8, 8);

    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="branch-pattern-variable-trigger"]')!;
    await act(async () => { trigger.click(); });

    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.textContent ?? '').join(' ')).toContain('{iteration}');
    expect(options.map((o) => o.textContent ?? '').join(' ')).not.toContain('{identifier}');

    await act(async () => { options[0].click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });

    expect(input.value).toBe('feature/{iteration}');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe('feature/{iteration}'.length);
  });
});
