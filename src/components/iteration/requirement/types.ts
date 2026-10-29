import type { useApp } from '@/store/app';
import type { WorkitemChild } from '@/lib/api';
import type { BranchRuleTemplate } from '@/types';

export interface ResolvedRepoBranchRule {
  sourceBranch: string;
  baselineBranch: string;
  workitemBranch: string;
  templateName: string;
}

export interface IterationBaselineCheck {
  branch: string;
  state: 'loading' | 'exists' | 'missing' | 'error';
  error?: string;
}

export function expandBranchPattern(
  pattern: string,
  values: { iteration: string; template: string; identifier: string },
): string {
  const branchPart = (value: string) => value.trim().replace(/\s+/g, '-').replace(/\\/g, '-');
  return pattern
    .replace(/\{iteration\}/g, branchPart(values.iteration))
    .replace(/\{template\}/g, branchPart(values.template))
    .replace(/\{identifier\}/g, branchPart(values.identifier));
}

export function resolveRepoBranchRule(
  settings: ReturnType<typeof useApp.getState>['settings'],
  workitemId: string,
  repoId: number,
  iterationName: string,
  identifier: string,
  customTemplates?: BranchRuleTemplate[],
): ResolvedRepoBranchRule | undefined {
  const templateId = settings?.workitemRepoBranchTemplates?.[workitemId]?.[String(repoId)];
  const allTemplates = customTemplates ?? settings?.branchRuleTemplates ?? [];
  const template = allTemplates.find((item) => item.id === templateId);
  if (template) {
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
    };
  }
  return undefined;
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
      badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    };
  }
  if (s === 'merged') {
    return {
      label: '已合入',
      tone: 'emerald',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
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
      badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    };
  }
  if (s === 'approved') {
    return {
      label: '已通过·待合入',
      tone: 'amber',
      badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    };
  }
  if (s === 'to_be_merged' || s === 'opened' || s === 'open' || s === 'reopened' || s === 'pending') {
    return {
      label: '待合入',
      tone: 'amber',
      badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    };
  }
  if (s) {
    return {
      label: stateStr || '待合入',
      tone: 'amber',
      badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    };
  }
  return {
    label: '待合入',
    tone: 'amber',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
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
