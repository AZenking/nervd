import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';

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
});

describe('Tabs Component', () => {
  it('renders segmented tabs list with default styling and proper roles', async () => {
    await act(() =>
      root.render(
        <Tabs defaultValue="req">
          <TabsList>
            <TabsTrigger value="req">需求</TabsTrigger>
            <TabsTrigger value="bug">缺陷</TabsTrigger>
            <TabsTrigger value="task">任务</TabsTrigger>
          </TabsList>
          <TabsContent value="req">需求内容</TabsContent>
          <TabsContent value="bug">缺陷内容</TabsContent>
          <TabsContent value="task">任务内容</TabsContent>
        </Tabs>
      )
    );

    const tabList = host.querySelector('[role="tablist"]');
    expect(tabList).not.toBeNull();
    expect(tabList?.getAttribute('data-variant')).toBe('default');
    expect(tabList?.className).toContain('bg-muted/60');
    expect(tabList?.className).toContain('p-0.5');

    const tabs = host.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
    expect(tabs[0].textContent).toBe('需求');
    expect(tabs[0].getAttribute('data-active')).toBe('');
  });

  it('inherits size from TabsList to TabsTrigger', async () => {
    await act(() =>
      root.render(
        <Tabs defaultValue="a">
          <TabsList size="xs">
            <TabsTrigger value="a">A</TabsTrigger>
            <TabsTrigger value="b">B</TabsTrigger>
          </TabsList>
        </Tabs>
      )
    );

    const tabList = host.querySelector('[role="tablist"]');
    expect(tabList?.className).toContain('h-6');
    const trigger = host.querySelector('[role="tab"]');
    expect(trigger?.className).toContain('text-[11px]');
  });

  it('supports size="lg" for comfortable controls', async () => {
    await act(() =>
      root.render(
        <Tabs defaultValue="a">
          <TabsList size="lg">
            <TabsTrigger value="a">A</TabsTrigger>
          </TabsList>
        </Tabs>
      )
    );

    const tabList = host.querySelector('[role="tablist"]');
    expect(tabList?.className).toContain('h-8');
  });

  it('supports variant="ghost" without background container', async () => {
    await act(() =>
      root.render(
        <Tabs defaultValue="settings">
          <TabsList variant="ghost">
            <TabsTrigger value="settings">常规设置</TabsTrigger>
          </TabsList>
        </Tabs>
      )
    );

    const tabList = host.querySelector('[role="tablist"]');
    expect(tabList?.className).toContain('bg-transparent');
    expect(tabList?.className).toContain('p-0');
  });

  it('handles value changes and triggers onValueChange', async () => {
    const onValueChange = vi.fn();
    await act(() =>
      root.render(
        <Tabs defaultValue="tab1" onValueChange={onValueChange}>
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
        </Tabs>
      )
    );

    const secondTab = host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
    await act(() => {
      secondTab.click();
    });

    expect(onValueChange).toHaveBeenCalledWith('tab2', expect.anything());
  });
});
