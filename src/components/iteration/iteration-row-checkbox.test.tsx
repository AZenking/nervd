import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ListBox } from '@heroui/react';
import { Checkbox } from '@/components/ui/checkbox';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  }
  if (typeof Element.prototype.getAnimations === 'undefined') {
    Element.prototype.getAnimations = () => [];
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

/**
 * 回归测试：列表行内多选 Checkbox 的事件流。
 *
 * 背景：HeroUI Checkbox 是包裹隐藏 input 的 label。真实浏览器中一次点击会产生
 * 两个冒泡 click（原始 click + label 激活行为转发给 input 的合成 click）。
 * 若把 toggle 挂在外层包装 span 的 onClick 上会切换两次（净效果为零，
 * 表现为"多选没有效果"）。正确做法：toggle 挂 Checkbox.onCheckedChange
 * （由 input change 驱动，恰好一次），包装 span 仅 stopPropagation 屏蔽行点击。
 */
describe('workitem row multi-select checkbox event flow', () => {
  it('toggles exactly once per user click and never triggers row onClick', async () => {
    const events: string[] = [];
    let checked = false;

    await act(async () => {
      root.render(
        <ListBox aria-label="test" selectionMode="none">
          <ListBox.Item
            id="row-1"
            textValue="row one"
            onAction={() => events.push('onAction')}
            onClick={() => events.push('row.onClick')}
          >
            <span
              data-testid="cb-wrap"
              onClick={(e) => {
                e.stopPropagation();
                events.push('wrap.onClick');
              }}
            >
              <Checkbox
                checked={checked}
                aria-label="选择 row one"
                onCheckedChange={() => {
                  events.push('onCheckedChange');
                  checked = !checked;
                }}
              />
            </span>
          </ListBox.Item>
        </ListBox>
      );
    });

    const label = host.querySelector('[data-slot="checkbox-content"]') as HTMLElement;
    const input = label.querySelector('input') as HTMLInputElement;
    expect(label).not.toBeNull();
    expect(input).not.toBeNull();
    expect(input.getAttribute('aria-label')).toBe('选择 row one');

    // 模拟真实浏览器一次点击的完整事件序列：
    // 1) 原始 click（target=label，冒泡）
    await act(async () => {
      label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    // 2) label 激活行为转发的合成 click（target=input，冒泡）→ 触发 change
    await act(async () => {
      input.click();
    });

    // toggle 恰好一次；包装 span 的两次冒泡 click 均被 stopPropagation，
    // 行 onClick / onAction 不应被触发
    expect(events.filter((e) => e === 'onCheckedChange')).toHaveLength(1);
    expect(checked).toBe(true);
    expect(events).not.toContain('row.onClick');
    expect(events).not.toContain('onAction');
  });
});
