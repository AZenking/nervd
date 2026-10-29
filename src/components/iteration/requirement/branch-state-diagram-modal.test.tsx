import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchStateDiagramModal } from './branch-state-diagram-modal';

vi.mock('../BranchStateDiagram', () => ({
  default: () => <div data-testid="mock-branch-diagram">Mock Branch State Diagram</div>,
}));

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
  document.body.innerHTML = '';
});

describe('BranchStateDiagramModal', () => {
  it('renders modal dialog when open is true', async () => {
    const onOpenChange = vi.fn();

    await act(() =>
      root.render(
        <BranchStateDiagramModal
          open={true}
          onOpenChange={onOpenChange}
          requirement={{ identifier: 'REQ-101', subject: '测试需求' }}
          repos={[]}
        />,
      ),
    );

    expect(document.body.textContent).toContain('分支同步状态图');
    expect(document.body.textContent).toContain('(REQ-101)');
    expect(document.body.textContent).toContain('以需求为根的分支树');
  });

  it('does not render dialog content when open is false', async () => {
    await act(() =>
      root.render(
        <BranchStateDiagramModal
          open={false}
          onOpenChange={vi.fn()}
          requirement={{ identifier: 'REQ-101', subject: '测试需求' }}
          repos={[]}
        />,
      ),
    );

    expect(document.body.textContent).not.toContain('分支同步状态图');
  });
});
