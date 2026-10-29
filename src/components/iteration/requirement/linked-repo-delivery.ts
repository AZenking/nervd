export type RepoBranchState = 'loading' | 'exists' | 'missing' | 'error';
export type RepoTraceState = 'loading' | 'ready' | 'error';
export type RepoDivergenceState = 'idle' | 'loading' | 'ready' | 'error';

export interface LinkedRepoDeliveryInput {
  iterationId?: string;
  placeholderIteration: boolean;
  hasValidRule: boolean;
  traceState: RepoTraceState;
  baselineState?: RepoBranchState;
  defaultBaseState?: RepoBranchState;
  developerBranchState: RepoBranchState;
  matchingActiveMrId?: number;
  hasMatchingMergedMr: boolean;
  divergence: {
    status: RepoDivergenceState;
    developmentOnly?: number;
    baselineOnly?: number;
  };
}

export type LinkedRepoPrimaryAction =
  | 'configure-rule'
  | 'retry'
  | 'querying'
  | 'create-baseline'
  | 'create-workitem-branch'
  | 'view-mr'
  | 'create-mr'
  | 'build'
  | 'details'
  | 'blocked';

export interface LinkedRepoDeliveryDecision {
  action: LinkedRepoPrimaryAction;
  conclusion: string;
  detail: string;
  tone: 'neutral' | 'warning' | 'success' | 'danger' | 'active';
  isAllMerged: boolean;
  hasPendingCommits: boolean;
  developmentOnly?: number;
  baselineOnly?: number;
}

function decision(
  action: LinkedRepoPrimaryAction,
  conclusion: string,
  detail: string,
  tone: LinkedRepoDeliveryDecision['tone'] = 'neutral',
  extra: Partial<LinkedRepoDeliveryDecision> = {},
): LinkedRepoDeliveryDecision {
  return {
    action,
    conclusion,
    detail,
    tone,
    isAllMerged: false,
    hasPendingCommits: false,
    ...extra,
  };
}

/** Derive the one safe next action from confirmed remote facts only. */
export function deriveLinkedRepoDelivery(
  input: LinkedRepoDeliveryInput,
): LinkedRepoDeliveryDecision {
  if (input.iterationId && !input.hasValidRule) {
    return decision(
      'configure-rule',
      '分支规则未配置',
      '选择有效规则后才能确定迭代基准与需求分支',
      'warning',
    );
  }

  if (input.traceState === 'loading') {
    return decision('querying', '正在查询分支与合并请求', '等待远端追溯数据返回');
  }
  if (input.traceState === 'error') {
    return decision('retry', '分支与合并请求查询失败', '刷新此仓库后重试', 'danger');
  }

  if (input.iterationId) {
    if (input.baselineState === 'error') {
      return decision('retry', '迭代基准查询失败', '刷新此仓库后重试', 'danger');
    }
    if (!input.baselineState || input.baselineState === 'loading') {
      return decision('querying', '正在查询迭代基准', '查询完成后才能判断分支创建顺序');
    }
    if (input.baselineState === 'missing') {
      return decision('create-baseline', '迭代基准分支尚未创建', '按分支规则从模板源分支创建', 'warning');
    }
  } else {
    if (input.defaultBaseState === 'error') {
      return decision('retry', 'master 分支查询失败', '刷新此仓库后重试', 'danger');
    }
    if (!input.defaultBaseState || input.defaultBaseState === 'loading') {
      return decision('querying', '正在查询 master 分支', '查询完成后才能判断分支创建顺序');
    }
    if (input.defaultBaseState === 'missing') {
      return decision('retry', 'master 分支不可用', '请确认仓库默认分支后重试', 'danger');
    }
  }

  if (input.developerBranchState === 'error') {
    return decision('retry', '需求分支查询失败', '刷新此仓库后重试', 'danger');
  }
  if (input.developerBranchState === 'loading') {
    return decision('querying', '正在查询需求分支', '等待远端分支检查完成');
  }
  if (input.developerBranchState === 'missing') {
    if (input.placeholderIteration) {
      return decision('blocked', '需求分支尚未创建', '占位迭代暂不支持创建云效分支', 'warning');
    }
    return decision('create-workitem-branch', '需求分支尚未创建', '从当前目标基准分支创建', 'warning');
  }

  if (input.matchingActiveMrId != null) {
    return decision(
      'view-mr',
      `MR !${input.matchingActiveMrId} 正在审核`,
      '需求分支已有进行中的合并请求',
      'active',
    );
  }

  if (input.divergence.status === 'error') {
    return decision('retry', '分支差异查询失败', '刷新此仓库后重试', 'danger');
  }
  if (input.divergence.status !== 'ready') {
    return decision('querying', '正在查询分支差异', '确认提交落差后再判断交付状态');
  }

  const developmentOnly = input.divergence.developmentOnly ?? 0;
  const baselineOnly = input.divergence.baselineOnly ?? 0;
  const hasPendingCommits = developmentOnly > 0;
  if (hasPendingCommits) {
    return decision(
      'create-mr',
      `需求分支有 ${developmentOnly} 个待合入提交`,
      '远端差异已确认，可创建合并请求',
      'warning',
      { hasPendingCommits, developmentOnly, baselineOnly },
    );
  }

  const isAllMerged = developmentOnly === 0
    && (input.hasMatchingMergedMr || baselineOnly === 0);
  if (isAllMerged) {
    return decision(
      'build',
      input.hasMatchingMergedMr ? '需求代码已合入目标基准' : '需求分支与目标基准已对齐',
      '可运行构建验证当前交付结果',
      'success',
      { isAllMerged, developmentOnly, baselineOnly },
    );
  }

  return decision(
    'details',
    baselineOnly > 0 ? '需求分支没有待合入提交' : '分支差异已查询',
    baselineOnly > 0
      ? `目标基准领先 ${baselineOnly} 个提交，可在详情中检查同步情况`
      : '可在详情中查看分支与交付记录',
    'neutral',
    { developmentOnly, baselineOnly },
  );
}

export type FindRemoteBranch = (repoId: number, branchName: string) => Promise<unknown | null | undefined>;
export type CreateRemoteBranch = (repoId: number, branchName: string, sourceBranch: string) => Promise<unknown>;

/** Create an iteration baseline only when absent, and verify it through a fresh remote lookup. */
export async function ensureIterationBaseline({
  repoId,
  targetBranch,
  sourceBranch,
  findBranch,
  createBranch,
}: {
  repoId: number;
  targetBranch: string;
  sourceBranch: string;
  findBranch: FindRemoteBranch;
  createBranch: CreateRemoteBranch;
}): Promise<{ created: boolean; branchName: string }> {
  const target = targetBranch.trim();
  const source = sourceBranch.trim();
  if (!target || !source) throw new Error('分支规则的模板源分支或迭代基准无效');
  if (target === source) throw new Error('模板源分支不能与迭代基准分支同名');

  if (await findBranch(repoId, target)) return { created: false, branchName: target };
  if (!(await findBranch(repoId, source))) {
    throw new Error(`模板源分支「${source}」在线上不存在`);
  }

  await createBranch(repoId, target, source);
  if (!(await findBranch(repoId, target))) {
    throw new Error(`迭代基准「${target}」创建后未能查询到`);
  }
  return { created: true, branchName: target };
}

export function latestCiRun<T extends { startTime?: number }>(runs: readonly T[]): T | undefined {
  if (runs.length === 0) return undefined;
  const timed = runs.filter((run) => Number.isFinite(run.startTime));
  if (timed.length === 0) return runs[0];
  return timed.reduce((latest, run) => (run.startTime! > latest.startTime! ? run : latest));
}

export function boundJenkinsRunBranch(
  run: { parameters?: Record<string, string> } | undefined,
  branchParameter: string | undefined,
): string | undefined {
  const selectedName = branchParameter?.trim();
  if (!selectedName) return undefined;
  const value = run?.parameters?.[selectedName]?.trim();
  return value || undefined;
}
