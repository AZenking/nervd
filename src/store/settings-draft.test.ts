import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Settings, SettingsView } from '@/types';

vi.mock('@/lib/api', () => ({
  savePat: vi.fn().mockResolvedValue(true),
  saveSettings: vi.fn(),
  saveJenkinsToken: vi.fn().mockResolvedValue(true),
  deleteJenkinsToken: vi.fn().mockResolvedValue(true),
  getSettings: vi.fn(),
}));

import * as api from '@/lib/api';
import { useApp } from './app';
import {
  useSettingsDraft,
  validateSettings,
  canonicalJson,
  sameSettings,
  normalize,
} from './settings-draft';

const BASE_SETTINGS: Settings = {
  organizationId: 'org-1',
  defaultSpaceIdentifier: '1234567890abcdef',
  linkPattern: 'REQ-(\\d+)',
  watchedRepos: [],
  allowWriteOps: true,
  workitemRepos: {},
  branchRuleTemplates: [],
  workitemRepoBranchTemplates: {},
  jenkinsConnections: [],
  repoCiBindings: {},
};

describe('validateSettings', () => {
  it('当 Jenkins 实例缺少名称、地址或用户名时应产生错误', () => {
    const invalid: Settings = {
      ...BASE_SETTINGS,
      jenkinsConnections: [
        { id: 'j-1', name: '', baseUrl: '', username: '' },
      ],
    };
    const errors = validateSettings(invalid);
    expect(errors['jenkins-j-1']).toBe('Jenkins 实例需要填写名称、地址和用户名');
  });

  it('当 Jenkins 实例地址不是 http 或 https 开头时应报错', () => {
    const invalid: Settings = {
      ...BASE_SETTINGS,
      jenkinsConnections: [
        { id: 'j-1', name: 'Jenkins', baseUrl: 'ftp://ci.example.com', username: 'admin' },
      ],
    };
    const errors = validateSettings(invalid);
    expect(errors['jenkins-j-1']).toBe('Jenkins 地址必须以 http:// 或 https:// 开头');
  });

  it('格式正确的 Jenkins 实例无字段错误', () => {
    const valid: Settings = {
      ...BASE_SETTINGS,
      jenkinsConnections: [
        { id: 'j-1', name: 'Jenkins', baseUrl: 'https://ci-test.f6yc.com/', username: '60711' },
      ],
    };
    const errors = validateSettings(valid);
    expect(errors['jenkins-j-1']).toBeUndefined();
  });
});

describe('useSettingsDraft save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('保存时应先保存 Token 到 Keychain，再提交 Settings，确保 Settings 获得 hasToken: true', async () => {
    const callOrder: string[] = [];

    vi.mocked(api.saveJenkinsToken).mockImplementation(async () => {
      callOrder.push('saveJenkinsToken');
      return true;
    });

    vi.mocked(api.saveSettings).mockImplementation(async (s) => {
      callOrder.push('saveSettings');
      return {
        ...s,
        hasPat: false,
        jenkinsConnections: s.jenkinsConnections.map((c) => ({
          ...c,
          hasToken: callOrder.includes('saveJenkinsToken'),
        })),
      } as SettingsView;
    });

    useSettingsDraft.setState({
      draft: {
        ...BASE_SETTINGS,
        jenkinsConnections: [
          { id: 'j-1', name: 'Jenkins', baseUrl: 'https://ci-test.f6yc.com/', username: '60711' },
        ],
      },
      baseline: BASE_SETTINGS,
      jenkinsTokens: { 'j-1': 'token-123' },
      fieldErrors: {},
      autoSaveStatus: 'unsaved',
    });

    const success = await useSettingsDraft.getState().save({ silent: true });

    expect(success).toBe(true);
    expect(callOrder).toEqual(['saveJenkinsToken', 'saveSettings']);
    expect(useApp.getState().settings?.jenkinsConnections[0].hasToken).toBe(true);
    expect(useSettingsDraft.getState().jenkinsTokens).toEqual({});
  });
});

describe('sameSettings & canonicalJson', () => {
  it('对象键顺序不同时仍应识别为相同设置', () => {
    const a: Settings = {
      organizationId: 'org-1',
      defaultSpaceIdentifier: 'space-1',
      linkPattern: 'REQ-(\\d+)',
      watchedRepos: [1, 2],
      allowWriteOps: false,
      workitemRepos: { '10': [1, 2] },
      branchRuleTemplates: [],
      workitemRepoBranchTemplates: {},
      jenkinsConnections: [],
      repoCiBindings: { '1': { provider: 'flow', pipelineId: 10, pipelineName: 'test' } },
    };

    // 颠倒键顺序
    const b: Settings = {
      repoCiBindings: { '1': { pipelineName: 'test', provider: 'flow', pipelineId: 10 } },
      jenkinsConnections: [],
      workitemRepoBranchTemplates: {},
      branchRuleTemplates: [],
      workitemRepos: { '10': [1, 2] },
      allowWriteOps: false,
      watchedRepos: [1, 2],
      linkPattern: 'REQ-(\\d+)',
      defaultSpaceIdentifier: 'space-1',
      organizationId: 'org-1',
    };

    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(sameSettings(a, b)).toBe(true);
  });

  it('字段值不同时应识别为不同', () => {
    const a = { ...BASE_SETTINGS, organizationId: 'org-1' };
    const b = { ...BASE_SETTINGS, organizationId: 'org-2' };
    expect(sameSettings(a, b)).toBe(false);
  });

  it('normalize 提取 SettingsView 后应与同等 Settings 匹配', () => {
    const view: SettingsView = {
      ...BASE_SETTINGS,
      hasPat: true,
      jenkinsConnections: [
        { id: 'j-1', name: 'Jenkins', baseUrl: 'https://ci.example.com', username: 'u', hasToken: true },
      ],
    };
    const normalized = normalize(view);
    const expected: Settings = {
      ...BASE_SETTINGS,
      jenkinsConnections: [
        { id: 'j-1', name: 'Jenkins', baseUrl: 'https://ci.example.com', username: 'u' },
      ],
    };
    expect(sameSettings(normalized, expected)).toBe(true);
  });
});

describe('useSettingsDraft _applyBaseline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('保存后应用 baseline：若与草稿一致，状态应为 saved 且不重复排期自动保存（避免死循环）', () => {
    const scheduleSpy = vi.spyOn(useSettingsDraft.getState(), 'scheduleAutoSave');

    useSettingsDraft.setState({
      draft: { ...BASE_SETTINGS },
      baseline: { ...BASE_SETTINGS },
      autoSaveStatus: 'saving',
    });

    // 模拟后端返回包含 hasPat/hasToken 且属性乱序的 SettingsView
    const savedView: SettingsView = {
      ...BASE_SETTINGS,
      hasPat: true,
      jenkinsConnections: [],
    };

    useSettingsDraft.getState()._applyBaseline(savedView);

    const state = useSettingsDraft.getState();
    expect(state.autoSaveStatus).toBe('saved');
    expect(scheduleSpy).not.toHaveBeenCalled();
    expect(state.draft).toEqual(normalize(savedView));

    scheduleSpy.mockRestore();
  });

  it('保存后应用 baseline：若草稿在保存期间有新输入，应触发重新排期', () => {
    const scheduleSpy = vi.spyOn(useSettingsDraft.getState(), 'scheduleAutoSave');

    useSettingsDraft.setState({
      draft: { ...BASE_SETTINGS, linkPattern: 'NEW-PATTERN' },
      baseline: { ...BASE_SETTINGS },
      autoSaveStatus: 'saving',
    });

    const savedView: SettingsView = {
      ...BASE_SETTINGS,
      hasPat: true,
      jenkinsConnections: [],
    };

    useSettingsDraft.getState()._applyBaseline(savedView);

    expect(scheduleSpy).toHaveBeenCalledTimes(1);

    scheduleSpy.mockRestore();
  });
});
