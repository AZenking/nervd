import { describe, it, expect, beforeEach } from 'vitest';
import { checkHasOnboarded } from './App';
import type { SettingsView } from './types';

const baseSettings: SettingsView = {
  hasPat: false,
  organizationId: '',
  defaultSpaceIdentifier: '',
  linkPattern: '([A-Za-z][A-Za-z0-9]{1,15}[-_]\\d{1,})',
  watchedRepos: [],
  allowWriteOps: false,
  workitemRepos: {},
  branchRuleTemplates: [],
  workitemRepoBranchTemplates: {},
  jenkinsConnections: [],
  repoCiBindings: {},
};

describe('checkHasOnboarded', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('settings 为 null 时应判定为未就绪', () => {
    expect(checkHasOnboarded(null)).toBe(false);
  });

  it('全新安装无凭据时应返回 false', () => {
    expect(checkHasOnboarded(baseSettings)).toBe(false);
  });

  it('全量核心凭据齐全时直接判定为已完成初始化', () => {
    const readySettings: SettingsView = {
      ...baseSettings,
      hasPat: true,
      organizationId: 'org_123',
      defaultSpaceIdentifier: 'space_abc',
    };
    expect(checkHasOnboarded(readySettings)).toBe(true);
  });

  it('本地已标记完成引导且保留关键凭据时，清空项目空间不应打断工作台', () => {
    localStorage.setItem('nervd_has_onboarded', 'true');
    const settingsWithoutSpace: SettingsView = {
      ...baseSettings,
      hasPat: true,
      organizationId: 'org_123',
      defaultSpaceIdentifier: '',
    };
    expect(checkHasOnboarded(settingsWithoutSpace)).toBe(true);
  });

  it('即便本地曾完成引导，若凭据已被完全抹除则需重新引导', () => {
    localStorage.setItem('nervd_has_onboarded', 'true');
    const wipedSettings: SettingsView = {
      ...baseSettings,
      hasPat: false,
      organizationId: '',
      defaultSpaceIdentifier: '',
    };
    expect(checkHasOnboarded(wipedSettings)).toBe(false);
  });
});
