// 设置分区唯一清单：侧栏设置菜单（AppSidebar）与设置页内容（SettingsView）共用，
// 保证左侧菜单与右侧内容永远一一对应；新增分区只改这里。
import type { LucideIcon } from 'lucide-react';
import { CloudIcon, GitBranchIcon, ShieldIcon, WorkflowIcon } from 'lucide-react';
import type { SettingsSection } from '@/store/ui';

export interface SettingsSectionMeta {
  value: SettingsSection;
  label: string;
  /** 分区页头描述（右侧内容区 PageHeader 用） */
  description: string;
  icon: LucideIcon;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[] = [
  {
    value: 'connection',
    label: '云效连接',
    description:
      '个人访问令牌：云效网页 → 个人设置 → 个人访问令牌；组织 ID 在 devops.aliyun.com/organization/<此处>',
    icon: CloudIcon,
  },
  {
    value: 'trace',
    label: '追溯与云效仓库',
    description: '需求关联正则与默认扫描仓库，仓库列表来自云效组织。',
    icon: GitBranchIcon,
  },
  {
    value: 'ci',
    label: 'CI 集成',
    description: 'Jenkins 实例与仓库 CI Job 绑定，构建状态会汇入迭代视图。',
    icon: WorkflowIcon,
  },
  {
    value: 'security',
    label: '安全',
    description: '控制 nervd 对云效真实资源的写操作权限。',
    icon: ShieldIcon,
  },
];
