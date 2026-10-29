import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OverflowTooltip, type OverflowTooltipProps } from './overflow-tooltip';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  document.body.querySelectorAll('[data-slot="tooltip-content"]').forEach((node) => node.remove());
});

async function render(props: OverflowTooltipProps) {
  await act(() => root.render(<OverflowTooltip {...props} />));
  return host.querySelector<HTMLElement>('[data-slot="tooltip-trigger"]')!;
}

async function renderInButton(...children: ReactNode[]) {
  await act(() =>
    root.render(
      <button type="button" aria-label="父级按钮">
        {children}
      </button>,
    ),
  );
  return host.querySelector<HTMLButtonElement>('button')!;
}

function setMetrics(element: HTMLElement, metrics: Partial<Record<'clientWidth' | 'scrollWidth' | 'clientHeight' | 'scrollHeight', number>>) {
  for (const [name, value] of Object.entries(metrics)) {
    Object.defineProperty(element, name, {
      configurable: true,
      get: () => value,
    });
  }
}

async function recalculate() {
  await act(() => window.dispatchEvent(new Event('resize')));
}

async function flushObservers() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function tooltipContents() {
  return [...document.querySelectorAll<HTMLElement>('[data-slot="tooltip-content"]')];
}

describe('OverflowTooltip 溢出测量', () => {
  it('只在 scrollWidth 超出 1px 容差时显示单行 Tooltip', async () => {
    const trigger = await render({ text: '标题', render: <span tabIndex={0} /> });
    setMetrics(trigger, { clientWidth: 100, scrollWidth: 101 });
    await recalculate();
    await act(() => trigger.focus());
    expect(tooltipContents()).toHaveLength(0);

    setMetrics(trigger, { clientWidth: 100, scrollWidth: 102 });
    await recalculate();
    await act(() => trigger.focus());
    expect(tooltipContents().map((node) => node.textContent)).toEqual(['标题']);
  });

  it('支持多行高度测量，且 multiline 不会被默认 truncate 覆盖', async () => {
    const trigger = await render({
      text: '多行标题',
      multiline: true,
      render: <span tabIndex={0} />,
    });
    setMetrics(trigger, { clientWidth: 100, scrollWidth: 100, clientHeight: 40, scrollHeight: 41 });
    await recalculate();
    await act(() => trigger.focus());
    expect(tooltipContents()).toHaveLength(0);

    setMetrics(trigger, { clientHeight: 40, scrollHeight: 42 });
    await recalculate();
    expect(trigger.className).toContain('whitespace-normal');
    expect(trigger.className).not.toContain('truncate');
    await act(() => trigger.focus());
    expect(tooltipContents().map((node) => node.textContent)).toEqual(['多行标题']);
  });

  it('响应文本/尺寸变化并在恢复非溢出时关闭 Tooltip', async () => {
    const props: OverflowTooltipProps = { text: '旧标题', render: <span tabIndex={0} /> };
    const trigger = await render(props);
    setMetrics(trigger, { clientWidth: 40, scrollWidth: 80 });
    await recalculate();
    await act(() => trigger.focus());
    expect(tooltipContents()).toHaveLength(1);

    await act(() => root.render(<OverflowTooltip {...props} text="新标题" />));
    setMetrics(trigger, { clientWidth: 100, scrollWidth: 100 });
    await recalculate();
    expect(tooltipContents()).toHaveLength(0);
  });
});

describe('OverflowTooltip 键盘组合', () => {
  it('默认 span 不新增 Tab 停靠；render 可复用独立 focusable 控件', async () => {
    const staticTrigger = await render({ text: '静态文本' });
    expect(staticTrigger.tagName).toBe('SPAN');
    expect(staticTrigger.hasAttribute('tabindex')).toBe(false);
    expect(staticTrigger.className).toContain('inline-block');
    expect(staticTrigger.className).toContain('max-w-full');
    expect(host.querySelectorAll('button')).toHaveLength(0);

    await act(() => root.render(<OverflowTooltip text="可聚焦文本" render={<button type="button" />} />));
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(host.querySelector('button')?.textContent).toBe('可聚焦文本');
  });

  it('复用已有 button 焦点，不生成嵌套 button，Escape 关闭且焦点保留', async () => {
    const button = await renderInButton(
      <OverflowTooltip text="按钮内长标题" />,
    );
    const trigger = host.querySelector<HTMLElement>('[data-slot="tooltip-trigger"]')!;
    setMetrics(trigger, { clientWidth: 40, scrollWidth: 100 });
    await recalculate();

    await act(() => button.focus());
    expect(document.activeElement).toBe(button);
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(tooltipContents().map((node) => node.textContent)).toEqual(['按钮内长标题']);
    const popup = tooltipContents()[0];
    expect(popup.getAttribute('role')).toBe('tooltip');
    expect(popup.id).toBeTruthy();
    expect(button.getAttribute('aria-describedby')).toContain(popup.id);

    await act(() =>
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(document.activeElement).toBe(button);
    expect(tooltipContents()).toHaveLength(0);
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  it('同一 button 内多个文本仅由主标题响应键盘焦点', async () => {
    const button = await renderInButton(
      <OverflowTooltip text="主标题" />,
      <OverflowTooltip text="路径" />,
    );
    const triggers = [...host.querySelectorAll<HTMLElement>('[data-slot="tooltip-trigger"]')];
    setMetrics(triggers[0], { clientWidth: 40, scrollWidth: 100 });
    setMetrics(triggers[1], { clientWidth: 40, scrollWidth: 100 });
    await recalculate();
    await act(() => button.focus());
    expect(tooltipContents().map((node) => node.textContent)).toEqual(['主标题']);
  });

  it('主标题未溢出时继续选择同一 focus owner 内首个实际溢出的文本', async () => {
    const button = await renderInButton(
      <OverflowTooltip text="短标题" />,
      <OverflowTooltip text="路径中的完整长标题" />,
    );
    const triggers = [...host.querySelectorAll<HTMLElement>('[data-slot="tooltip-trigger"]')];
    setMetrics(triggers[0], { clientWidth: 100, scrollWidth: 100 });
    setMetrics(triggers[1], { clientWidth: 40, scrollWidth: 120 });
    await recalculate();
    await act(() => button.focus());
    expect(tooltipContents().map((node) => node.textContent)).toEqual(['路径中的完整长标题']);
  });

  it('复用 tabindex=-1 的 roving listitem 焦点，不新增 Tab 停靠', async () => {
    await act(() =>
      root.render(
        <div role="listitem" tabIndex={-1} aria-label="工作项行">
          <OverflowTooltip text="行内长标题" />
        </div>,
      ),
    );
    const row = host.querySelector<HTMLElement>('[role="listitem"]')!;
    const trigger = host.querySelector<HTMLElement>('[data-slot="tooltip-trigger"]')!;
    setMetrics(trigger, { clientWidth: 40, scrollWidth: 100 });
    await recalculate();
    await act(() => row.focus());
    expect(document.activeElement).toBe(row);
    expect(trigger.hasAttribute('tabindex')).toBe(false);
    expect(tooltipContents().map((node) => node.textContent)).toEqual(['行内长标题']);
  });

  it('Combobox aria-activedescendant + data-highlighted 由方向键打开全文，焦点留在 input', async () => {
    await act(() =>
      root.render(
        <>
          <input aria-label="搜索" aria-controls="virtual-list" />
          <div id="virtual-list" role="listbox">
            <div id="option-a" role="option" data-highlighted>
              <OverflowTooltip text="候选项 A 的完整长标题" />
            </div>
          </div>
        </>,
      ),
    );
    const input = host.querySelector<HTMLInputElement>('input')!;
    const option = host.querySelector<HTMLElement>('[role="option"]')!;
    const trigger = host.querySelector<HTMLElement>('[data-slot="tooltip-trigger"]')!;
    setMetrics(trigger, { clientWidth: 40, scrollWidth: 120 });
    await recalculate();
    input.setAttribute('aria-activedescendant', 'option-a');
    await act(() => input.focus());
    await act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await flushObservers();

    expect(document.activeElement).toBe(input);
    expect(option.hasAttribute('data-highlighted')).toBe(true);
    expect(tooltipContents().map((node) => node.textContent)).toEqual(['候选项 A 的完整长标题']);
    expect(input.getAttribute('aria-describedby')).toContain(tooltipContents()[0].id);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(() => input.dispatchEvent(escape));
    expect(document.activeElement).toBe(input);
    expect(escape.defaultPrevented).toBe(true);
    expect(tooltipContents()).toHaveLength(0);
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('pointer 高亮不主动弹出，候选切换时关闭旧提示并打开新提示', async () => {
    await act(() =>
      root.render(
        <>
          <input aria-label="搜索" aria-controls="virtual-list" />
          <div id="virtual-list" role="listbox">
            <div id="option-a" role="option">
              <OverflowTooltip text="候选项 A 的完整长标题" />
            </div>
            <div id="option-b" role="option">
              <OverflowTooltip text="候选项 B 的完整长标题" />
            </div>
          </div>
        </>,
      ),
    );
    const input = host.querySelector<HTMLInputElement>('input')!;
    const options = [...host.querySelectorAll<HTMLElement>('[role="option"]')];
    const triggers = [...host.querySelectorAll<HTMLElement>('[data-slot="tooltip-trigger"]')];
    triggers.forEach((trigger) => setMetrics(trigger, { clientWidth: 40, scrollWidth: 120 }));
    await recalculate();

    options[0].setAttribute('data-highlighted', '');
    input.setAttribute('aria-activedescendant', 'option-a');
    options[0].dispatchEvent(new Event('pointermove', { bubbles: true }));
    await flushObservers();
    expect(tooltipContents()).toHaveLength(0);

    await act(() => input.focus());
    await act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    options[0].removeAttribute('data-highlighted');
    options[1].setAttribute('data-highlighted', '');
    input.setAttribute('aria-activedescendant', 'option-b');
    await flushObservers();
    expect(tooltipContents().map((node) => node.textContent)).toEqual(['候选项 B 的完整长标题']);
    expect(document.activeElement).toBe(input);
  });
});
