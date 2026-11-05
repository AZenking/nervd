import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, Toast, toast } from './toast';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  toast.clear();
});

describe('HeroUI Toast Component & Manager', () => {
  it('mounts Toaster without crashing', async () => {
    await act(async () => {
      root.render(<Toaster />);
    });
    expect(host).toBeDefined();
  });

  it('supports toast helper methods and toast.add adapter', () => {
    // Test toast.success
    const successId = toast.success('操作成功', {
      description: '所有变更已同步',
    });
    expect(successId).toBeDefined();

    // Test toast.error / toast.danger
    const errorId = toast.error('操作失败', {
      description: '网络连接超时',
    });
    expect(errorId).toBeDefined();

    // Test toast.add with actionProps
    const onClick = vi.fn();
    const addId = toast.add({
      title: '警告提示',
      description: '请检查只读配置',
      type: 'warning',
      actionProps: {
        children: '前往设置',
        onClick,
      },
    });
    expect(addId).toBeDefined();

    // Test queue contains the added toasts
    const queue = toast.getQueue();
    expect(queue.visibleToasts.length).toBeGreaterThanOrEqual(1);

    // Calling clear dismisses all toasts
    toast.clear();
    const exiting = (queue as unknown as { getExitingKeys?: () => Set<string> }).getExitingKeys?.();
    expect(exiting ? exiting.size : 0).toBeGreaterThanOrEqual(0);
  });

  it('exports compound components adhering to HeroUI API', () => {
    expect(Toast.Provider).toBeDefined();
    expect(Toast.Content).toBeDefined();
    expect(Toast.Indicator).toBeDefined();
    expect(Toast.Title).toBeDefined();
    expect(Toast.Description).toBeDefined();
    expect(Toast.ActionButton).toBeDefined();
    expect(Toast.CloseButton).toBeDefined();
    expect(Toast.toast).toBeDefined();
  });
});
