import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBatchSelection } from './use-batch-selection';

type Selection = ReturnType<typeof useBatchSelection>;

let root: Root;
let container: HTMLDivElement;
let selection: Selection | null = null;

function Probe() {
  selection = useBatchSelection();
  return null;
}

function currentSelection(): Selection {
  if (!selection) throw new Error('Selection hook has not mounted');
  return selection;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
  selection = null;
  act(() => root.render(createElement(Probe)));
});

afterEach(() => {
  act(() => root.unmount());
  selection = null;
});

describe('useBatchSelection', () => {
  it('replaces the selection on plain selection and toggles an item independently', () => {
    act(() => currentSelection().selectOnly('REQ-1'));
    act(() => currentSelection().toggle('REQ-2'));

    expect([...currentSelection().selectedIds]).toEqual(['REQ-1', 'REQ-2']);

    act(() => currentSelection().selectOnly('REQ-3'));
    expect([...currentSelection().selectedIds]).toEqual(['REQ-3']);
  });

  it('selects an inclusive range from the anchor and supports additive ranges', () => {
    const visibleIds = ['REQ-1', 'REQ-2', 'REQ-3', 'REQ-4', 'REQ-5'];
    act(() => currentSelection().selectOnly('REQ-2'));
    act(() => currentSelection().selectRange(visibleIds, 'REQ-4'));
    expect([...currentSelection().selectedIds]).toEqual(['REQ-2', 'REQ-3', 'REQ-4']);

    act(() => currentSelection().selectRange(visibleIds, 'REQ-5', true));
    expect([...currentSelection().selectedIds]).toEqual(['REQ-2', 'REQ-3', 'REQ-4', 'REQ-5']);
  });

  it('uses the target as the range anchor if the previous anchor is no longer visible', () => {
    act(() => currentSelection().selectOnly('REQ-1'));
    act(() => currentSelection().selectRange(['REQ-3', 'REQ-4', 'REQ-5'], 'REQ-4'));

    expect([...currentSelection().selectedIds]).toEqual(['REQ-4']);
  });

  it('sets a range anchor without creating a batch selection', () => {
    act(() => currentSelection().setAnchor('REQ-2'));
    expect([...currentSelection().selectedIds]).toEqual([]);

    act(() => currentSelection().selectRange(['REQ-1', 'REQ-2', 'REQ-3'], 'REQ-3'));
    expect([...currentSelection().selectedIds]).toEqual(['REQ-2', 'REQ-3']);
  });

  it('selects only the supplied visible IDs and clears both selection and anchor', () => {
    act(() => currentSelection().selectAll(['REQ-2', 'REQ-3'], 'REQ-3'));
    expect([...currentSelection().selectedIds]).toEqual(['REQ-2', 'REQ-3']);

    act(() => currentSelection().clear());
    act(() => currentSelection().selectRange(['REQ-1', 'REQ-2', 'REQ-3'], 'REQ-2'));
    expect([...currentSelection().selectedIds]).toEqual(['REQ-2']);
  });
});
