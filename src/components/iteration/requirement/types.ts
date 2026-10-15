import type { useApp } from '@/store/app';
import type { WorkitemChild } from '@/lib/api';

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
): ResolvedRepoBranchRule | undefined {
  const templateId = settings?.workitemRepoBranchTemplates?.[workitemId]?.[String(repoId)];
  const template = settings?.branchRuleTemplates?.find((item) => item.id === templateId);
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

export interface RequirementDetailsProps {
  embedded?: boolean;
  parentWorkitem?: { workitemId: string; identifier: string; subject?: string } | null;
  onOpenWorkbench?: () => void;
  onClose?: () => void;
  onSelectChild?: (child: WorkitemChild) => void;
  onSelectParent?: (parentId: string) => void;
}
