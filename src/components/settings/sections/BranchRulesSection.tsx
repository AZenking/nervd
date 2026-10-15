import { useApp } from '@/store/app';
import { BranchTemplatesManager } from '@/components/branch-rules';

export function BranchRulesSection() {
  const { settings, saveBranchRuleTemplates } = useApp();
  const templates = settings?.branchRuleTemplates ?? [];

  return (
    <BranchTemplatesManager
      scope="global"
      title="全局分支规则模板"
      description="为代码仓库预设分支生成规则，供各迭代与需求详情按仓库选用。"
      inSettingsCard
      templates={templates}
      onSaveTemplates={saveBranchRuleTemplates}
    />
  );
}
