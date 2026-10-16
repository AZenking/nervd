import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import { useSettingsDraft, validateSettings } from './settings-draft';

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
