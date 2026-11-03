import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';

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

describe('HeroUI Tabs Component', () => {
  it('renders HeroUI segmented tabs list with native list container, indicator and proper roles', async () => {
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

    const listContainer = host.querySelector('.tabs__list-container');
    expect(listContainer).not.toBeNull();

    const tabList = host.querySelector('[role="tablist"]');
    expect(tabList).not.toBeNull();
    expect(tabList?.className).toContain('tabs__list');

    const tabs = host.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
    expect(tabs[0].textContent).toBe('需求');
    expect(tabs[0].getAttribute('data-selected')).toBe('true');

    // HeroUI indicator exists on selected tab
    const indicator = tabs[0].querySelector('[data-slot="tabs-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator?.className).toContain('tabs__indicator');

    // Panel content renders correctly
    const panel = host.querySelector('[role="tabpanel"]');
    expect(panel?.textContent).toBe('需求内容');
  });

  it('supports direct HeroUI compound API', async () => {
    await act(() =>
      root.render(
        <Tabs defaultSelectedKey="first">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Compound Test">
              <Tabs.Tab id="first">
                Tab 1
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="second">
                Tab 2
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id="first">First Panel</Tabs.Panel>
          <Tabs.Panel id="second">Second Panel</Tabs.Panel>
        </Tabs>
      )
    );

    const tabList = host.querySelector('[role="tablist"]');
    expect(tabList).not.toBeNull();
    expect(tabList?.getAttribute('aria-label')).toBe('Compound Test');

    const activeTab = host.querySelector('[data-selected="true"]');
    expect(activeTab?.textContent).toContain('Tab 1');
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

    const secondTab = host.querySelectorAll<HTMLElement>('[role="tab"]')[1];
    await act(() => {
      secondTab.click();
    });

    expect(onValueChange).toHaveBeenCalledWith('tab2', expect.anything());
  });

  it('supports native vertical orientation', async () => {
    await act(() =>
      root.render(
        <Tabs orientation="vertical" defaultValue="v1">
          <TabsList>
            <TabsTrigger value="v1">V1</TabsTrigger>
          </TabsList>
        </Tabs>
      )
    );

    const rootElement = host.querySelector('[data-slot="tabs"]');
    expect(rootElement?.getAttribute('data-orientation')).toBe('vertical');
  });
});
