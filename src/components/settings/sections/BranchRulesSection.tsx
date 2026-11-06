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
      description="为代码仓库预设全局分支生成规则（每条模板即一条交付轨道 Track/局点），关联仓库后自动继承默认轨道，需求可按仓库覆盖。"
      inSettingsCard
      templates={templates}
      onSaveTemplates={handleSaveTemplates}
    />
  );
}
