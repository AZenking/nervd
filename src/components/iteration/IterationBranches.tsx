import { BranchTemplatesManager } from '@/components/branch-rules';
import { useIterationBranchTemplates } from '@/lib/iteration-templates';

export interface IterationBranchesProps {
  iterationId?: string;
  iterationName?: string;
}

/**
 * 当前迭代专属分支规则模板管理
 */
export function IterationBranches({ iterationId, iterationName }: IterationBranchesProps) {
  const { templates, saveTemplates } = useIterationBranchTemplates(iterationId);

  return (
    <BranchTemplatesManager
      scope="iteration"
      title={`「${iterationName || '当前迭代'}」专属分支模板`}
      description="为该迭代配置专属交付轨道（Track/局点）分支生成规则，优先级高于全局模板；未显式覆盖的需求仓库将自动继承迭代专属默认轨道。"
      iterationName={iterationName}
      templates={templates}
      onSaveTemplates={saveTemplates}
    />
  );
}
