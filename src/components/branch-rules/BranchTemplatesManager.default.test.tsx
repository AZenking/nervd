import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchRuleTemplate } from '@/types';
import { BranchTemplatesManager } from './BranchTemplatesManager';
import * as api from '@/lib/api';

vi.mock('@/store/app', () => ({
  useApp: () => ({
    settings: { workitemRepoBranchTemplates: {} },
    setToast: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  getBranchTrackDefault: vi.fn().mockResolvedValue('tpl-chery'),
  setBranchTrackDefault: vi.fn().mockResolvedValue(true),
}));

const templates: BranchRuleTemplate[] = [
  {
    id: 'tpl-chery',
    name: 'chery',
    sourceBranch: 'master',
    baselineBranchPattern: 'iteration/{iteration}/{track}',
    workitemBranchPattern: 'feature/{identifier}',
  },
  {
    id: 'tpl-foton',
    name: 'foton',
    sourceBranch: 'master',
    baselineBranchPattern: 'iteration/{iteration}/{track}',
    workitemBranchPattern: 'feature/{identifier}',
  },
];

describe('BranchTemplatesManager 默认轨道', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('显示默认徽标并允许把另一条设为默认', async () => {
    await act(async () => {
      root.render(
        <BranchTemplatesManager
          scope="iteration"
          iterationId="it-1"
          templates={templates}
          onSaveTemplates={vi.fn()}
        />,
      );
    });

    expect(host.textContent).toContain('默认');
    expect(vi.mocked(api.getBranchTrackDefault)).toHaveBeenCalledWith('iteration', 'it-1');

    const setDefault = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('设为默认'),
    );
    expect(setDefault).toBeTruthy();
    await act(async () => setDefault!.click());
    expect(vi.mocked(api.setBranchTrackDefault)).toHaveBeenCalledWith('tpl-foton');
  });
});
