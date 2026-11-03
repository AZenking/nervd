import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SearchableSelect, type SearchableSelectOption } from './searchable-select';

describe('SearchableSelect with HeroUI Autocomplete', () => {
  it('renders trigger with placeholder and items correctly', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const items: SearchableSelectOption<string>[] = [
      { label: 'Feature Branch', value: 'feat/abc' },
      { label: 'Release Branch', value: 'release/v1.0' },
    ];

    const onValueChange = vi.fn();

    await act(async () => {
      root.render(
        <SearchableSelect
          items={items}
          value={null}
          onValueChange={onValueChange}
          placeholder="选择分支..."
        />
      );
    });

    const trigger = container.querySelector('[data-slot="autocomplete-trigger"]');
    expect(trigger).not.toBeNull();
    expect(container.textContent).toContain('选择分支...');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders preselected item label in trigger', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const items: SearchableSelectOption<string>[] = [
      { label: 'Feature Branch', value: 'feat/abc' },
      { label: 'Release Branch', value: 'release/v1.0' },
    ];

    await act(async () => {
      root.render(
        <SearchableSelect
          items={items}
          value="feat/abc"
          onValueChange={() => {}}
          placeholder="选择分支..."
        />
      );
    });

    const trigger = container.querySelector('[data-slot="autocomplete-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('Feature Branch');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders fallback raw value when value is not in items list', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const items: SearchableSelectOption<string>[] = [
      { label: 'Feature Branch', value: 'feat/abc' },
    ];

    await act(async () => {
      root.render(
        <SearchableSelect
          items={items}
          value="custom/unlisted-branch"
          onValueChange={() => {}}
          placeholder="选择分支..."
        />
      );
    });

    const trigger = container.querySelector('[data-slot="autocomplete-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('custom/unlisted-branch');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
