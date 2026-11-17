// 底部批量操作条：以 Sheet 形态（非模态）承载，必须不遮罩、不抢焦点、不把列表推出可访问性树，
// 否则「勾选后继续勾其它行」的多选主流程会被打断。本用例锁定该结构契约与只读门控。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { FloatingBatchBar } from './floating-batch-bar';
import { useApp } from '@/store/app';
import { TooltipProvider } from '@/components/ui/tooltip';

// @ts-expect-error test act environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('FloatingBatchBar（非模态 Sheet 条）', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  const render = async (ui: React.ReactElement) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<TooltipProvider>{ui}</TooltipProvider>);
    });
  };

  beforeEach(() => {
    useApp.setState({ settings: { allowWriteOps: false } } as never);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it('以 region 承载（非 dialog）：无遮罩、无焦点陷阱容器', async () => {
    await render(<FloatingBatchBar selectedIds={new Set(['wi-1', 'wi-2'])} onClear={() => {}} />);

    const bar = document.querySelector('[data-testid="floating-batch-bar"]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.getAttribute('data-slot')).toBe('sheet-bar');
    expect(bar.getAttribute('role')).toBe('region');
    expect(bar.getAttribute('aria-label')).toBe('批量操作');

    // 不带 Modal 语义：没有 dialog、没有遮罩层
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeNull();

    expect(bar.textContent).toContain('已选 2 项');
    expect(bar.querySelector('[data-testid="batch-bar-count"]')?.textContent).toContain('已选 2 项');
  });

  it('只读态：变更状态入口 aria-disabled 而非原生 disabled，可保留 Tooltip', async () => {
    await render(<FloatingBatchBar selectedIds={new Set(['wi-1'])} onClear={() => {}} />);

    const trigger = document.querySelector('[data-testid="batch-status-trigger"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(trigger.hasAttribute('disabled')).toBe(false);
  });

  it('「取消 (Esc)」调用 onClear 清空多选', async () => {
    const onClear = vi.fn();
    await render(<FloatingBatchBar selectedIds={new Set(['wi-1'])} onClear={onClear} />);

    const cancel = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('取消 (Esc)'),
    ) as HTMLButtonElement;
    expect(cancel).toBeTruthy();

    await act(async () => {
      cancel.click();
    });
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});