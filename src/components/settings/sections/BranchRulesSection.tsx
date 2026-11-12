import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import type { BranchRuleTemplate } from '@/types';
import { BranchTemplatesManager } from '@/components/branch-rules';

export function BranchRulesSection() {
  const draft = useSettingsDraft();
  const savedTemplates = useApp((s) => s.settings?.branchRuleTemplates ?? []);
  const saveBranchRuleTemplates = useApp((s) => s.saveBranchRuleTemplates);
  const templates = draft.draft?.branchRuleTemplates ?? savedTemplates;

  /**
   * 分支模板是行级数据：后端 save_settings 会拒绝修改 branchRuleTemplates，
   * 必须走专用命令 save_branch_rule_templates。保存后同步草稿/基线，
   * 避免后续保存其它设置时把旧模板经 save_settings 回传而被拒绝。
   */
  const handleSaveTemplates = async (newTemplates: BranchRuleTemplate[]) => {
    await saveBranchRuleTemplates(newTemplates);
    const persisted = useApp.getState().settings?.branchRuleTemplates ?? newTemplates;
    useSettingsDraft.setState((st) => ({
      draft: st.draft ? { ...st.draft, branchRuleTemplates: persisted } : st.draft,
      baseline: st.baseline ? { ...st.baseline, branchRuleTemplates: persisted } : st.baseline,
    }));
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
