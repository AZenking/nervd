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
      description="为该迭代配置独立分支规则模板。需求关联仓库时将优先匹配并提供该迭代专属模板，同时支持选用全局通用模板。"
      iterationName={iterationName}
      templates={templates}
      onSaveTemplates={saveTemplates}
    />
  );
}
