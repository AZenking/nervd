import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchRuleTemplate } from '@/types';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { BranchRulesSection } from './sections/BranchRulesSection';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const captured = vi.hoisted(() => ({ onSaveTemplates: null as null | ((t: BranchRuleTemplate[]) => Promise<void>) }));

vi.mock('@/components/branch-rules', () => ({
  BranchTemplatesManager: (props: {
    onSaveTemplates: (t: BranchRuleTemplate[]) => Promise<void>;
  }) => {
    captured.onSaveTemplates = props.onSaveTemplates;
    return null;
  },
}));

const OLD: BranchRuleTemplate = {
  id: 'tpl-old',
  name: '旧模板',
  sourceBranch: 'master',
  baselineBranchPattern: 'master',
  workitemBranchPattern: 'feature/{identifier}',
};
const NEXT: BranchRuleTemplate = {
  id: 'tpl-next',
  name: '新模板',
  sourceBranch: 'master',
  baselineBranchPattern: 'release/{iteration}',
  workitemBranchPattern: 'feature/{identifier}',
};

const baseSettings = {
  organizationId: 'org',
  defaultSpaceIdentifier: '',
  linkPattern: '',
  watchedRepos: [],
  allowWriteOps: false,
  workitemRepos: {},
  branchRuleTemplates: [OLD],
  workitemRepoBranchTemplates: {},
  jenkinsConnections: [],
  repoCiBindings: {},
  hasPat: true,
};

describe('BranchRulesSection', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  const saveBranchRuleTemplates = vi.fn(async (templates: BranchRuleTemplate[]) => {
    useApp.setState({ settings: { ...baseSettings, branchRuleTemplates: templates } });
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    saveBranchRuleTemplates.mockClear();
    useApp.setState({
      settings: baseSettings,
      saveBranchRuleTemplates,
    });
    useSettingsDraft.setState({
      draft: { ...baseSettings, branchRuleTemplates: [OLD] } as never,
      baseline: { ...baseSettings, branchRuleTemplates: [OLD] } as never,
    });
  });

  afterEach(() => {
    if (root && container) {
      act(() => root?.unmount());
      container.remove();
    }
  });

  it('模板保存走专用命令而不是 save_settings，并同步草稿与基线', async () => {
    await act(async () => {
      root?.render(<BranchRulesSection />);
      await Promise.resolve();
    });

    expect(captured.onSaveTemplates).toBeTypeOf('function');
    await act(async () => {
      await captured.onSaveTemplates?.([NEXT]);
    });

    expect(saveBranchRuleTemplates).toHaveBeenCalledWith([NEXT]);
    expect(useSettingsDraft.getState().draft?.branchRuleTemplates).toEqual([NEXT]);
    expect(useSettingsDraft.getState().baseline?.branchRuleTemplates).toEqual([NEXT]);
  });
});
