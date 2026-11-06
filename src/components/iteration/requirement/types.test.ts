import { describe, expect, it } from 'vitest';
import { expandBranchPattern, getMrStatusInfo, resolveChildMrBranches, resolveRepoBranchRule } from './types';
import type { BranchRuleTemplate, SettingsView } from '@/types';

describe('getMrStatusInfo', () => {
  it('正确解析待合入状态（opened / open / to_be_merged / reopened）', () => {
    expect(getMrStatusInfo('opened').label).toBe('待合入');
    expect(getMrStatusInfo('OPEN').label).toBe('待合入');
    expect(getMrStatusInfo('to_be_merged').label).toBe('待合入');
    expect(getMrStatusInfo('TO_BE_MERGED').label).toBe('待合入');
    expect(getMrStatusInfo('reopened').label).toBe('待合入');
    expect(getMrStatusInfo().label).toBe('待合入');
  });

  it('正确解析审查中状态（under_review / reviewing / review）', () => {
    const res = getMrStatusInfo('under_review');
    expect(res.label).toBe('审查中');
    expect(res.tone).toBe('sky');

    expect(getMrStatusInfo('UNDER_REVIEW').label).toBe('审查中');
    expect(getMrStatusInfo('reviewing').label).toBe('审查中');
  });

  it('正确解析已通过（approved）状态', () => {
    const res = getMrStatusInfo('approved');
    expect(res.label).toBe('已通过·待合入');
    expect(res.tone).toBe('amber');
  });

  it('正确解析已合入（merged）状态', () => {
    const res = getMrStatusInfo('merged');
    expect(res.label).toBe('已合入');
    expect(res.tone).toBe('emerald');
  });

  it('正确解析已关闭（closed）状态', () => {
    const res = getMrStatusInfo('closed');
    expect(res.label).toBe('已关闭');
    expect(res.tone).toBe('muted');
  });

  it('正确解析冲突状态（conflict / hasConflict: true）', () => {
    const byState = getMrStatusInfo('conflict');
    expect(byState.label).toBe('有冲突');
    expect(byState.tone).toBe('rose');

    const byFlag = getMrStatusInfo('opened', true);
    expect(byFlag.label).toBe('有冲突');
    expect(byFlag.tone).toBe('rose');
  });
});

describe('expandBranchPattern', () => {
  it('支持 {iteration}、{template} 和 {identifier}', () => {
    const res = expandBranchPattern('iteration/{iteration}/{template}/feature/{identifier}', {
      iteration: 'Sprint 2026',
      template: 'Track A',
      identifier: 'REQ-101',
    });
    expect(res).toBe('iteration/Sprint-2026/Track-A/feature/REQ-101');
  });

  it('{track} 与 {template} 展开等价，显式 track 覆盖值优先生效', () => {
    const pattern = 'iteration/{iteration}/{template}/{track}/feat/{identifier}';
    const byAlias = expandBranchPattern(pattern, {
      iteration: 'W10',
      template: 'Site B',
      identifier: 'REQ-202',
    });
    // 未传 track 时，{track} 完全等价于 {template}
    expect(byAlias).toBe('iteration/W10/Site-B/Site-B/feat/REQ-202');

    const withTrack = expandBranchPattern('track/{track}', {
      iteration: 'W10',
      template: 'Site B',
      identifier: 'REQ-202',
      track: 'Track X',
    });
    expect(withTrack).toBe('track/Track-X');
  });
});

describe('resolveRepoBranchRule（交付轨道方案 A 自动继承）', () => {
  const globalTrack: BranchRuleTemplate & { scope?: 'global' | 'iteration' } = {
    id: 'default-track',
    name: '默认主线',
    sourceBranch: 'master',
    baselineBranchPattern: 'master',
    workitemBranchPattern: 'feature/{identifier}',
    scope: 'global',
  };
  const siteTrack: BranchRuleTemplate & { scope?: 'global' | 'iteration' } = {
    id: 'site-track',
    name: '局点专版',
    sourceBranch: 'test',
    baselineBranchPattern: 'iteration/{iteration}/{track}',
    workitemBranchPattern: 'feature/{track}/{identifier}',
    scope: 'iteration',
  };

  it('需求级显式覆盖命中：按指定模板解析且 origin 为 workitem', () => {
    const settings = {
      workitemRepoBranchTemplates: {
        'req-1': { '101': 'site-track' },
      },
    } as unknown as SettingsView;

    const res = resolveRepoBranchRule(settings, 'req-1', 101, 'Sprint-1', 'REQ-1', [globalTrack, siteTrack]);
    expect(res).toBeDefined();
    expect(res?.templateName).toBe('局点专版');
    expect(res?.templateId).toBe('site-track');
    expect(res?.origin).toBe('workitem');
    expect(res?.sourceBranch).toBe('test');
    expect(res?.baselineBranch).toBe('iteration/Sprint-1/局点专版');
    expect(res?.workitemBranch).toBe('feature/局点专版/REQ-1');
  });

  it('无显式覆盖：自动继承融合模板首项（迭代专属优先），origin 为 iteration', () => {
    const settings = {
      workitemRepoBranchTemplates: {},
    } as unknown as SettingsView;

    const res = resolveRepoBranchRule(settings, 'req-2', 101, 'Sprint-1', 'REQ-2', [siteTrack, globalTrack]);
    expect(res).toBeDefined();
    expect(res?.templateId).toBe('site-track');
    expect(res?.templateName).toBe('局点专版');
    expect(res?.origin).toBe('iteration');
    expect(res?.baselineBranch).toBe('iteration/Sprint-1/局点专版');
  });

  it('仅有全局模板时：继承全局首项，origin 为 global（直连主干模板解析正常）', () => {
    const settings = {
      workitemRepoBranchTemplates: {},
    } as unknown as SettingsView;

    const res = resolveRepoBranchRule(settings, 'req-3', 101, 'Sprint-1', 'REQ-3', [globalTrack]);
    expect(res).toBeDefined();
    expect(res?.templateId).toBe('default-track');
    expect(res?.origin).toBe('global');
    expect(res?.sourceBranch).toBe('master');
    expect(res?.baselineBranch).toBe('master');
    expect(res?.workitemBranch).toBe('feature/REQ-3');
  });

  it('未传 customTemplates 时回退 settings.branchRuleTemplates 首项，无 scope 视为 global', () => {
    const plainTrack: BranchRuleTemplate = {
      id: 'plain-track',
      name: '本地模板',
      sourceBranch: 'develop',
      baselineBranchPattern: 'iteration/{iteration}/{template}',
      workitemBranchPattern: 'feature/{identifier}',
    };
    const settings = {
      workitemRepoBranchTemplates: {},
      branchRuleTemplates: [plainTrack],
    } as unknown as SettingsView;

    const res = resolveRepoBranchRule(settings, 'req-4', 101, 'Sprint-1', 'REQ-4');
    expect(res).toBeDefined();
    expect(res?.templateId).toBe('plain-track');
    expect(res?.templateName).toBe('本地模板');
    expect(res?.origin).toBe('global');
  });

  it('显式覆盖指向已失效模板 ID 时，回退继承融合首项而非报错', () => {
    const settings = {
      workitemRepoBranchTemplates: {
        'req-5': { '101': 'deleted-track' },
      },
    } as unknown as SettingsView;

    const res = resolveRepoBranchRule(settings, 'req-5', 101, 'Sprint-1', 'REQ-5', [siteTrack, globalTrack]);
    expect(res).toBeDefined();
    expect(res?.templateId).toBe('site-track');
    expect(res?.origin).toBe('iteration');
  });

  it('完全没有任何模板时，返回 undefined（保持未配置语义）', () => {
    const settings = {
      workitemRepoBranchTemplates: {},
      branchRuleTemplates: [],
    } as unknown as SettingsView;

    expect(resolveRepoBranchRule(settings, 'req-6', 101, 'Sprint-1', 'REQ-6', [])).toBeUndefined();
    expect(resolveRepoBranchRule(settings, 'req-6', 101, 'Sprint-1', 'REQ-6')).toBeUndefined();
  });
});

describe('resolveChildMrBranches（缺陷单号分支 → 需求单号分支）', () => {
  const globalTrack: BranchRuleTemplate & { scope?: 'global' | 'iteration' } = {
    id: 'default-track',
    name: '默认主线',
    sourceBranch: 'master',
    baselineBranchPattern: 'master',
    workitemBranchPattern: 'feature/{identifier}',
    scope: 'global',
  };
  const siteTrack: BranchRuleTemplate & { scope?: 'global' | 'iteration' } = {
    id: 'site-track',
    name: '局点专版',
    sourceBranch: 'test',
    baselineBranchPattern: 'iteration/{iteration}/{track}',
    workitemBranchPattern: 'feature/{track}/{identifier}',
    scope: 'iteration',
  };

  it('自动继承融合首项：源/目标共用同一轨道，仅 {identifier} 分别替换为缺陷/需求编号', () => {
    const settings = { workitemRepoBranchTemplates: {} } as unknown as SettingsView;
    const res = resolveChildMrBranches(settings, {
      parentWorkitemId: 'req-1',
      parentIdentifier: 'REQ-101',
      childIdentifier: 'BUG-202',
      iterationName: 'Sprint 1',
      repoId: 101,
      customTemplates: [siteTrack, globalTrack],
    });
    expect(res.sourceBranch).toBe('feature/局点专版/BUG-202');
    expect(res.targetBranch).toBe('feature/局点专版/REQ-101');
  });

  it('需求级显式覆盖：以父需求 workitemId 为模板查找键命中指定轨道', () => {
    const settings = {
      workitemRepoBranchTemplates: { 'req-1': { '101': 'site-track' } },
    } as unknown as SettingsView;
    const res = resolveChildMrBranches(settings, {
      parentWorkitemId: 'req-1',
      parentIdentifier: 'REQ-101',
      childIdentifier: 'BUG-202',
      iterationName: 'Sprint 1',
      repoId: 101,
      customTemplates: [globalTrack, siteTrack],
    });
    expect(res.sourceBranch).toBe('feature/局点专版/BUG-202');
    expect(res.targetBranch).toBe('feature/局点专版/REQ-101');
  });

  it('直连主干预设（feature/{identifier}）下缺陷 → 需求分支同样成立', () => {
    const settings = { workitemRepoBranchTemplates: {} } as unknown as SettingsView;
    const res = resolveChildMrBranches(settings, {
      parentWorkitemId: 'req-1',
      parentIdentifier: 'REQ-101',
      childIdentifier: 'BUG-202',
      iterationName: 'Sprint 1',
      repoId: 101,
      customTemplates: [globalTrack],
    });
    expect(res.sourceBranch).toBe('feature/BUG-202');
    expect(res.targetBranch).toBe('feature/REQ-101');
  });

  it('无任何模板时回退 feature/{identifier}', () => {
    const settings = { workitemRepoBranchTemplates: {} } as unknown as SettingsView;
    const res = resolveChildMrBranches(settings, {
      parentWorkitemId: 'req-1',
      parentIdentifier: 'REQ-101',
      childIdentifier: 'BUG-202',
      iterationName: '',
      repoId: 101,
      customTemplates: [],
    });
    expect(res.sourceBranch).toBe('feature/BUG-202');
    expect(res.targetBranch).toBe('feature/REQ-101');
  });
});
