import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackTopologyModal } from './track-topology-modal';
import { TrackTopologyDiagram } from './track-topology-diagram';

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

describe('TrackTopologyModal', () => {
  const baseProps = {
    sourceBranch: 'master',
    baselinePattern: 'iteration/{iteration}/{track}',
    workitemPattern: 'feature/{identifier}',
    variables: {
      iteration: 'Sprint-1',
      track: '局点A',
      identifier: 'REQ-101',
    },
    templateName: '局点专属交付轨道',
  };

  it('renders modal dialog when open is true with complete branch details', async () => {
    const onOpenChange = vi.fn();

    await act(() =>
      root.render(
        <TrackTopologyModal
          open={true}
          onOpenChange={onOpenChange}
          {...baseProps}
        />,
      ),
    );

    expect(document.body.textContent).toContain('交付轨道分支拓扑');
    expect(document.body.textContent).toContain('局点专属交付轨道');
    expect(document.body.textContent).toContain('master');
    expect(document.body.textContent).toContain('iteration/Sprint-1/局点A');
    expect(document.body.textContent).toContain('feature/REQ-101');
    expect(document.body.textContent).toContain('生命周期流转说明');
    expect(document.body.textContent).toContain('1. 派生基准');
    expect(document.body.textContent).toContain('4. 发布 MR');
  });

  it('renders direct connect mode correctly without separate baseline card', async () => {
    await act(() =>
      root.render(
        <TrackTopologyModal
          open={true}
          onOpenChange={vi.fn()}
          {...baseProps}
          baselinePattern="master"
        />,
      ),
    );

    expect(document.body.textContent).toContain('直连主干');
    expect(document.body.textContent).toContain('直连主干模式（Trunk-based）');
    expect(document.body.textContent).toContain('1. 直接切出');
    expect(document.body.textContent).toContain('2. MR 合入');
  });

  it('does not render dialog content when open is false', async () => {
    await act(() =>
      root.render(
        <TrackTopologyModal
          open={false}
          onOpenChange={vi.fn()}
          {...baseProps}
        />,
      ),
    );

    expect(document.body.textContent).not.toContain('交付轨道分支拓扑');
  });

  it('TrackTopologyDiagram renders "放大查看" button and triggers onExpand callback', async () => {
    const onExpand = vi.fn();

    await act(() =>
      root.render(
        <TrackTopologyDiagram
          {...baseProps}
          onExpand={onExpand}
        />,
      ),
    );

    const expandBtn = host.querySelector('button[aria-label="在弹窗中放大查看交付轨道拓扑"]') as HTMLButtonElement;
    expect(expandBtn).not.toBeNull();
    expect(expandBtn.textContent).toContain('放大查看');

    await act(async () => {
      expandBtn.click();
    });

    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
