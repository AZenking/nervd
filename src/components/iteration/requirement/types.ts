import type { useApp } from '@/store/app';
import type { WorkitemChild } from '@/lib/api';
import type { BranchRuleTemplate } from '@/types';

export interface ResolvedRepoBranchRule {
  sourceBranch: string;
  baselineBranch: string;
  workitemBranch: string;
  templateName: string;
  /** 命中的分支模板 ID（显式覆盖或自动继承的模板）。 */
  templateId?: string;
  /** 继承来源：workitem = 需求级显式覆盖；iteration/global = 方案 A 自动继承的模板作用域。 */
  origin?: 'workitem' | 'iteration' | 'global';
}

export interface IterationBaselineCheck {
  branch: string;
  state: 'loading' | 'exists' | 'missing' | 'error';
  error?: string;
}

export function expandBranchPattern(
  pattern: string,
  values: { iteration: string; template: string; identifier: string; track?: string },
): string {
  const branchPart = (value: string) => value.trim().replace(/\s+/g, '-').replace(/\\/g, '-');
  return pattern
    .replace(/\{iteration\}/g, branchPart(values.iteration))
    // {track} 为 {template} 的等价别名（交付轨道 Track/局点），{template} 永久保留兼容旧配置
    .replace(/\{track\}/g, branchPart(values.track ?? values.template))
    .replace(/\{template\}/g, branchPart(values.template))
    .replace(/\{identifier\}/g, branchPart(values.identifier));
}

export function resolveRepoBranchRule(
  settings: ReturnType<typeof useApp.getState>['settings'],
  workitemId: string,
  repoId: number,
  iterationName: string,
  identifier: string,
  customTemplates?: Array<BranchRuleTemplate & { scope?: 'global' | 'iteration' }>,
): ResolvedRepoBranchRule | undefined {
  const templateId = settings?.workitemRepoBranchTemplates?.[workitemId]?.[String(repoId)];
  const allTemplates: Array<BranchRuleTemplate & { scope?: 'global' | 'iteration' }> =
    customTemplates ?? settings?.branchRuleTemplates ?? [];
  const explicit = templateId ? allTemplates.find((item) => item.id === templateId) : undefined;
  // 方案 A（自动继承）：需求级无显式覆盖（或覆盖指向已失效模板）时，
  // 回退融合模板首项（迭代专属模板优先 → 全局模板，即 useFusedBranchTemplates 的融合顺序）。
  const template = explicit ?? (allTemplates.length > 0 ? allTemplates[0] : undefined);
  if (template) {
    const origin: ResolvedRepoBranchRule['origin'] = explicit
      ? 'workitem'
      : template.scope === 'iteration' ? 'iteration' : 'global';
    return {
      sourceBranch: template.sourceBranch,
      baselineBranch: expandBranchPattern(template.baselineBranchPattern, {
        iteration: iterationName,
        template: template.name,
        identifier,
      }),
      workitemBranch: expandBranchPattern(template.workitemBranchPattern, {
        iteration: iterationName,
        template: template.name,
        identifier,
      }),
      templateName: template.name,
      templateId: template.id,
      origin,
    };
  }
  return undefined;
}

export interface ChildMrBranches {
  /** 子项（缺陷）开发分支：同一交付轨道模板按子项编号展开 */
  sourceBranch: string;
  /** 父需求开发分支：同一交付轨道模板按需求编号展开（缺陷 MR 的合入目标） */
  targetBranch: string;
}

/**
 * 缺陷页发起 MR 的分支推导（「缺陷单号分支 → 需求单号分支」）：
 * - 两次解析共用同一交付轨道模板与同一迭代名：模板查找键统一为父需求 workitemId，
 *   需求级显式覆盖（workitemRepoBranchTemplates）与方案 A 自动继承（融合模板首项）都自然生效；
 * - 仅 {identifier} 占位符分别替换为缺陷编号 / 需求编号，保证同轨道；
 * - 无可用模板时回退 feature/{identifier}（与 LinkedRepoCard 的无迭代回退一致）。
 */
export function resolveChildMrBranches(
  settings: ReturnType<typeof useApp.getState>['settings'],
  params: {
    parentWorkitemId: string;
    parentIdentifier: string;
    childIdentifier: string;
    iterationName: string;
    repoId: number;
    customTemplates?: Array<BranchRuleTemplate & { scope?: 'global' | 'iteration' }>;
  },
): ChildMrBranches {
  const { parentWorkitemId, parentIdentifier, childIdentifier, iterationName, repoId, customTemplates } = params;
  const ruleOf = (identifier: string) => resolveRepoBranchRule(
    settings,
    parentWorkitemId,
    repoId,
    iterationName,
    identifier,
    customTemplates,
  )?.workitemBranch.trim();
  const sourceBranch = ruleOf(childIdentifier) || `feature/${childIdentifier}`;
  const targetBranch = ruleOf(parentIdentifier) || `feature/${parentIdentifier}`;
  return { sourceBranch, targetBranch };
}

export function mergeRequestRows(value: unknown): Record<string, unknown>[] {
  const root = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
  const rows = Array.isArray(value)
    ? value
    : ['result', 'data', 'items'].map((key) => root?.[key]).find(Array.isArray) ?? [];
  return rows.filter((row): row is Record<string, unknown> =>
    Boolean(row) && typeof row === 'object' && !Array.isArray(row),
  );
}

export function mergeRequestBranch(request: Record<string, unknown>, camel: string, snake: string): string {
  const value = request[camel] ?? request[snake];
  return typeof value === 'string' ? value : '';
}

export const STATUS_OPTIONS = [
  { name: '待办', label: '待办' },
  { name: '进行中', label: '进行中' },
  { name: '测试中', label: '测试中' },
  { name: '已完成', label: '已完成' },
  { name: '已关闭', label: '已关闭' },
] as const;

export interface MrStatusInfo {
  label: string;
  tone: 'amber' | 'emerald' | 'sky' | 'rose' | 'muted';
  badgeClass: string;
}

/**
 * 统一归一化合并请求 (MR) 状态：
 * - 待合入 (amber): opened / open / to_be_merged / reopened / approved
 * - 审查中 (sky): under_review / reviewing / review
 * - 有冲突 (rose): conflict / conflicted / hasConflict
 * - 已合入 (emerald): merged
 * - 已关闭 (muted): closed
 */
export function getMrStatusInfo(stateStr?: string, hasConflict?: boolean): MrStatusInfo {
  const s = (stateStr ?? '').trim().toLowerCase();
  if (hasConflict || s === 'conflict' || s === 'conflicted') {
    return {
      label: '有冲突',
      tone: 'rose',
      badgeClass: 'bg-danger/10 text-danger border-danger/20',
    };
  }
  if (s === 'merged') {
    return {
      label: '已合入',
      tone: 'emerald',
      badgeClass: 'bg-success/10 text-success border-success/20',
    };
  }
  if (s === 'closed') {
    return {
      label: '已关闭',
      tone: 'muted',
      badgeClass: 'bg-muted text-muted-foreground border-border/40',
    };
  }
  if (s === 'under_review' || s === 'reviewing' || s === 'review') {
    return {
      label: '审查中',
      tone: 'sky',
      badgeClass: 'bg-primary/10 text-primary border-primary/20',
    };
  }
  if (s === 'approved') {
    return {
      label: '已通过·待合入',
      tone: 'amber',
      badgeClass: 'bg-warning/10 text-warning border-warning/20',
    };
  }
  if (s === 'to_be_merged' || s === 'opened' || s === 'open' || s === 'reopened' || s === 'pending') {
    return {
      label: '待合入',
      tone: 'amber',
      badgeClass: 'bg-warning/10 text-warning border-warning/20',
    };
  }
  if (s) {
    return {
      label: stateStr || '待合入',
      tone: 'amber',
      badgeClass: 'bg-warning/10 text-warning border-warning/20',
    };
  }
  return {
    label: '待合入',
    tone: 'amber',
    badgeClass: 'bg-warning/10 text-warning border-warning/20',
  };
}

export interface RequirementDetailsProps {
  embedded?: boolean;
  parentWorkitem?: { workitemId: string; identifier: string; subject?: string } | null;
  onOpenWorkbench?: () => void;
  onClose?: () => void;
  onSelectChild?: (child: WorkitemChild) => void;
  onSelectParent?: (parentId: string) => void;
}
