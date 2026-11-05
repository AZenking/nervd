import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './select';

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

describe('HeroUI Select Component', () => {
  it('renders standard HeroUI Select trigger and value placeholder', async () => {
    await act(async () => {
      root.render(
        <Select placeholder="选择状态" aria-label="状态">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">活跃</SelectItem>
            <SelectItem value="inactive">非活跃</SelectItem>
          </SelectContent>
        </Select>
      );
    });

    const trigger = host.querySelector('[data-slot="select-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.classList.contains('select__trigger')).toBe(true);
    expect(trigger?.textContent).toContain('选择状态');
  });

  it('renders with defaultValue selected', async () => {
    await act(async () => {
      root.render(
        <Select defaultValue="active" aria-label="状态">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">活跃</SelectItem>
            <SelectItem value="inactive">非活跃</SelectItem>
          </SelectContent>
        </Select>
      );
    });

    const trigger = host.querySelector('[data-slot="select-trigger"]');
    expect(trigger?.textContent).toContain('活跃');
  });

  it('supports compound subcomponents', async () => {
    await act(async () => {
      root.render(
        <Select defaultValue="opt1" aria-label="选项">
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="opt1">选项一</Select.Item>
            <Select.Item value="opt2">选项二</Select.Item>
          </Select.Content>
        </Select>
      );
    });

    const trigger = host.querySelector('[data-slot="select-trigger"]');
    expect(trigger?.textContent).toContain('选项一');
  });
});
