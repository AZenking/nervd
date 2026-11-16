import type { useApp } from '@/store/app';
import type { WorkitemChild } from '@/lib/api';
import type { BranchRuleTemplate } from '@/types';
import type { BranchTrackTopology, ChildBranchResolution } from '@/types/branch-topology';

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

function branchDateParts(raw?: string): { yyyy: string; MM: string; dd: string; compact: string } {
  const matched = raw?.trim().match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (matched) {
    return { yyyy: matched[1], MM: matched[2], dd: matched[3], compact: `${matched[1]}${matched[2]}${matched[3]}` };
  }
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return { yyyy, MM, dd, compact: `${yyyy}${MM}${dd}` };
}

export function expandBranchPattern(
  pattern: string,
  values: {
    iteration: string;
    template: string;
    identifier: string;
    track?: string;
    /**
     * 父需求编号（子项拓扑自定义模式用）。
     * 可选：现有调用不传时保持原行为，仅当模式中含 `{parentIdentifier}` 时才需要。
     */
    parentIdentifier?: string;
    /** 迭代结束日（YYYY-MM-DD / YYYYMMDD）；用于 {iterationEnd}、{date}、{yyyy}/{MM}/{dd}。 */
    iterationEnd?: string;
  },
): string {
  const branchPart = (value: string) => value.trim().replace(/\s+/g, '-').replace(/\\/g, '-');
  const date = branchDateParts(values.iterationEnd);
  return pattern
    .replace(/\{iteration\}/g, branchPart(values.iteration))
    // {track} 为轨道名；{template} 仅为旧配置兼容别名，UI 已不再提供
    .replace(/\{track\}/g, branchPart(values.track ?? values.template))
    .replace(/\{template\}/g, branchPart(values.template))
    // 时间模板：{iterationEnd} / {date} 为迭代结束日；{yyyy}/{MM}/{dd} 为同一日期分量
    .replace(/\{iterationEnd\}/g, date.compact)
    .replace(/\{date\}/g, date.compact)
    .replace(/\{yyyy\}/g, date.yyyy)
    .replace(/\{MM\}/g, date.MM)
    .replace(/\{dd\}/g, date.dd)
    // 先于 {identifier} 处理，避免自定义模式里的父需求编号被子项编号误替换
    .replace(/\{parentIdentifier\}/g, branchPart(values.parentIdentifier ?? ''))
    .replace(/\{identifier\}/g, branchPart(values.identifier));
}

export function resolveRepoBranchRule(
  settings: ReturnType<typeof useApp.getState>['settings'],
  workitemId: string,
  repoId: number,
  iterationName: string,
  identifier: string,
  customTemplates?: Array<BranchRuleTemplate & { scope?: 'global' | 'iteration' }>,
  iterationEndDate?: string,
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
        iterationEnd: iterationEndDate,
      }),
      workitemBranch: expandBranchPattern(template.workitemBranchPattern, {
        iteration: iterationName,
        template: template.name,
        identifier,
        iterationEnd: iterationEndDate,
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
    iterationEndDate?: string;
  },
): ChildMrBranches {
  const { parentWorkitemId, parentIdentifier, childIdentifier, iterationName, repoId, customTemplates, iterationEndDate } = params;
  const ruleOf = (identifier: string) => resolveRepoBranchRule(
    settings,
    parentWorkitemId,
    repoId,
    iterationName,
    identifier,
    customTemplates,
    iterationEndDate,
  )?.workitemBranch.trim();
  const sourceBranch = ruleOf(childIdentifier) || `feature/${childIdentifier}`;
  const targetBranch = ruleOf(parentIdentifier) || `feature/${parentIdentifier}`;
  return { sourceBranch, targetBranch };
}

/**
 * 子项分支拓扑解析（在 `resolveChildMrBranches` 的基础上叠加 track 级拓扑配置）：
 *
 * - 无拓扑 / childPattern === null → legacy：子分支仍由需求分支模板展开子项编号，
 *   基点与 MR 目标都挂父需求分支；
 * - childPattern === '' → 不建子分支，子项直接共用需求分支；
 * - 自定义 pattern → 按 `topology.childBase` / `topology.childMrTarget` 选择基点与目标；
 *   父需求分支不存在时回退迭代基准并给出 warning（避免在 UI 侧静默产生悬空分支）。
 *
 * 未传拓扑时行为等价于 `resolveChildMrBranches`，作为兼容回退。
 */
export function resolveChildBranchTopology(params: {
  topology?: BranchTrackTopology | null;
  template: BranchRuleTemplate;
  iterationName: string;
  parentIdentifier: string;
  childIdentifier: string;
  parentBranch: string;
  baselineBranch: string;
  parentBranchExists: boolean;
  iterationEndDate?: string;
}): ChildBranchResolution {
  const {
    topology,
    template,
    iterationName,
    parentIdentifier,
    childIdentifier,
    parentBranch,
    baselineBranch,
    parentBranchExists,
    iterationEndDate,
  } = params;

  const values = {
    iteration: iterationName,
    template: template.name,
    identifier: childIdentifier,
    parentIdentifier,
    iterationEnd: iterationEndDate,
  };

  // legacy：未配置拓扑或显式 childPattern=null，沿用当前模板的子分支命名。
  if (!topology || topology.childPattern == null) {
    return {
      sourceBranch: expandBranchPattern(template.workitemBranchPattern, values),
      baseBranch: parentBranch,
      targetBranch: parentBranch,
      legacy: true,
    };
  }

  // none：明确不建子分支，子项共用父需求分支。
  if (topology.childPattern === '') {
    return {
      sourceBranch: undefined,
      baseBranch: parentBranch,
      targetBranch: parentBranch,
      legacy: false,
    };
  }

  // custom：自定义子分支命名 + 可选的基点 / MR 目标。
  const sourceBranch = expandBranchPattern(topology.childPattern, values);
  const wantBaselineBase = topology.childBase === 'baseline';
  const wantBaselineTarget = topology.childMrTarget === 'baseline';
  const missingParent = !parentBranchExists;
  const baseBranch = wantBaselineBase || missingParent ? baselineBranch : parentBranch;
  const targetBranch = wantBaselineTarget || missingParent ? baselineBranch : parentBranch;

  return {
    sourceBranch,
    baseBranch,
    targetBranch,
    legacy: false,
    warning: missingParent
      ? `父需求分支 ${parentBranch} 不存在，子分支基点与 MR 目标已回退到迭代基准 ${baselineBranch}。`
      : undefined,
  };
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
      // DESIGN §2.1：--muted 是文字色，不能当底色（同值会让徽标文字与底色 1:1 不可见）
      badgeClass: 'bg-surface-secondary text-muted-foreground border-border/40',
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
