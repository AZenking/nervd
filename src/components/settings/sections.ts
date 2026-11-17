// 设置分区唯一清单：侧栏设置菜单（AppSidebar）与设置页内容（SettingsView）共用，
// 保证左侧菜单与右侧内容永远一一对应；新增分区只改这里。
import type { LucideIcon } from 'lucide-react';
import {
  CloudIcon,
  GitBranchIcon,
  GitCommitIcon,
  InfoIcon,
  LifeBuoyIcon,
  PaletteIcon,
  ShieldIcon,
  SparklesIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { SettingsSection } from '@/store/ui';

/** 设置侧栏的用途分组标题（不可点击，仅用于组织页面） */
export type SettingsSectionGroup = '个人偏好' | '工作区' | '应用';

export const SETTINGS_GROUPS: readonly SettingsSectionGroup[] = ['个人偏好', '工作区', '应用'];

export interface SettingsSectionMeta {
  value: SettingsSection;
  label: string;
  /** 侧栏分组：分组标题不可点击，页面直接列在标题下 */
  group: SettingsSectionGroup;
  icon: LucideIcon;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[] = [
  {
    value: 'appearance',
    label: '外观与交互',
    group: '个人偏好',
    icon: PaletteIcon,
  },
  {
    value: 'connection',
    label: '云效连接',
    group: '工作区',
    icon: CloudIcon,
  },
  {
    value: 'trace',
    label: '仓库与分支',
    group: '工作区',
    icon: GitBranchIcon,
  },
  {
    value: 'ci',
    label: '构建集成',
    group: '工作区',
    icon: WorkflowIcon,
  },
  {
    value: 'attribution',
    label: '变更追溯',
    group: '工作区',
    icon: GitCommitIcon,
  },
  {
    value: 'ai',
    label: 'AI 助手',
    group: '工作区',
    icon: SparklesIcon,
  },
  {
    value: 'security',
    label: '安全与权限',
    group: '工作区',
    icon: ShieldIcon,
  },
  {
    value: 'diagnostics',
    label: '诊断与支持',
    group: '应用',
    icon: LifeBuoyIcon,
  },
  {
    value: 'about',
    label: '关于 nervd',
    group: '应用',
    icon: InfoIcon,
  },
];

/** 按用途分组取分区（保持清单顺序）；空分组不渲染 */
export function getSettingsSectionsByGroup(
  group: SettingsSectionGroup,
): readonly SettingsSectionMeta[] {
  return SETTINGS_SECTIONS.filter((section) => section.group === group);
}

/** 按标识取分区元数据；未知标识回退首个分区 */
export function getSettingsSectionMeta(section: SettingsSection): SettingsSectionMeta {
  return SETTINGS_SECTIONS.find((item) => item.value === section) ?? SETTINGS_SECTIONS[0];
}

/** 计算某分区下当前的未修正错误数量，用于在侧栏菜单项展示醒目红点 */
export function getSectionErrorCount(
  section: SettingsSection,
  fieldErrors: Record<string, string>,
): number {
  if (section === 'connection') {
    return fieldErrors['space'] ? 1 : 0;
  }
  if (section === 'ci') {
    return Object.keys(fieldErrors).filter(
      (k) => k.startsWith('jenkins-') || k.startsWith('repo-'),
    ).length;
  }
  return 0;
}
