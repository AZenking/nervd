import { describe, expect, it } from 'vitest';
import {
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  getSectionErrorCount,
  getSettingsSectionMeta,
  getSettingsSectionsByGroup,
} from './sections';

describe('设置分区元数据', () => {
  it('扩展为 9 个分区，按「个人偏好 / 工作区 / 应用」分组且标识唯一', () => {
    expect(SETTINGS_SECTIONS).toHaveLength(9);
    expect(new Set(SETTINGS_SECTIONS.map((section) => section.value)).size).toBe(9);
    expect(SETTINGS_GROUPS).toEqual(['个人偏好', '工作区', '应用']);

    for (const group of SETTINGS_GROUPS) {
      expect(getSettingsSectionsByGroup(group).length).toBeGreaterThan(0);
    }
    // 分组顺序与清单顺序一致：个人偏好 → 工作区 → 应用
    expect(SETTINGS_SECTIONS.map((section) => section.group)).toEqual([
      '个人偏好',
      '工作区',
      '工作区',
      '工作区',
      '工作区',
      '工作区',
      '工作区',
      '应用',
      '应用',
    ]);
  });

  it('保留既有标识与迁移落点，并新增外观与诊断两个入口', () => {
    const values = SETTINGS_SECTIONS.map((section) => section.value);
    for (const legacy of ['connection', 'trace', 'attribution', 'ci', 'ai', 'security', 'about']) {
      expect(values).toContain(legacy);
    }
    expect(values).toContain('appearance');
    expect(values).toContain('diagnostics');

    // 旧导航记录仍可恢复：trace → 仓库与分支，attribution → 变更追溯
    expect(getSettingsSectionMeta('trace').label).toBe('仓库与分支');
    expect(getSettingsSectionMeta('attribution').label).toBe('变更追溯');
    expect(getSettingsSectionMeta('appearance').label).toBe('外观与交互');
    expect(getSettingsSectionMeta('diagnostics').label).toBe('诊断与支持');
  });

  it('错误数量归属保持在连接与 CI 分区', () => {
    const errors = { space: '空间无效', 'jenkins-1': '实例错误', 'repo-2': '绑定错误' };
    expect(getSectionErrorCount('connection', errors)).toBe(1);
    expect(getSectionErrorCount('ci', errors)).toBe(2);
    expect(getSectionErrorCount('appearance', errors)).toBe(0);
    expect(getSectionErrorCount('trace', errors)).toBe(0);
  });
});