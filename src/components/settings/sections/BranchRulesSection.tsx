import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import type { BranchRuleTemplate } from '@/types';
import { BranchTemplatesManager } from '@/components/branch-rules';

export function BranchRulesSection() {
  const draft = useSettingsDraft();
  const savedTemplates = useApp((s) => s.settings?.branchRuleTemplates ?? []);
  const templates = draft.draft?.branchRuleTemplates ?? savedTemplates;

  const handleSaveTemplates = (newTemplates: BranchRuleTemplate[]) => {
    draft.update({ branchRuleTemplates: newTemplates }, true);
  };

  return (
    <BranchTemplatesManager
      scope="global"
      title="全局分支规则模板"
      description="为代码仓库预设分支生成规则，供各迭代与需求详情按仓库选用。"
      inSettingsCard
      templates={templates}
      onSaveTemplates={handleSaveTemplates}
    />
  );
}
