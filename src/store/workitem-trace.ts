import * as api from '../lib/api';
import type { TracePipelineRun } from '../lib/api';
import { matchesWorkitem } from '../lib/link';
import { workitemRepoIds } from '../lib/workitem-repos';
import type { BranchInfo, Category, CommitSummary, MrSummary, Settings, TraceResult } from '../types';

interface RepoTrace {
  repoId: number;
  branches: BranchInfo[];
  commits: CommitSummary[];
  mergeRequests: MrSummary[];
}

const pick = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (current, key) =>
      current && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined,
    value,
  );

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];

  const wrapped = value as Record<string, unknown>;
  for (const key of ['result', 'data', 'items']) {
    if (Array.isArray(wrapped[key])) return wrapped[key] as unknown[];
  }
  return [];
}

function mapBranches(value: unknown, identifier: string, pattern: string): BranchInfo[] {
  const branches: BranchInfo[] = [];
  for (const branch of asArray(value)) {
    const name = asString(pick(branch, 'name'));
    if (name && matchesWorkitem(identifier, name, pattern)) {
      branches.push({ name, commit: pick(branch, 'commit') as BranchInfo['commit'] });
    }
  }
  return branches;
}

function mapCommits(value: unknown, identifier: string, pattern: string): CommitSummary[] {
  const commits: CommitSummary[] = [];
  for (const commit of asArray(value)) {
    const message = asString(pick(commit, 'message')) || asString(pick(commit, 'title'));
    if (!message || !matchesWorkitem(identifier, message, pattern)) continue;

    commits.push({
      sha: asString(pick(commit, 'sha')) || asString(pick(commit, 'id')),
      message,
      authorName:
        asString(pick(commit, 'authorName')) ||
        asString(pick(commit, 'author_name')) ||
        asString(pick(commit, 'author', 'name')),
      committedDate:
        asString(pick(commit, 'committedDate')) ||
        asString(pick(commit, 'committed_date')) ||
        asString(pick(commit, 'createdAt')),
    });
  }
  return commits;
}

function mapMergeRequests(value: unknown, identifier: string, pattern: string): MrSummary[] {
  const mergeRequests: MrSummary[] = [];
  for (const request of asArray(value)) {
    const title = asString(pick(request, 'title'));
    if (!title || !matchesWorkitem(identifier, title, pattern)) continue;

    const webUrl =
      asString(pick(request, 'webUrl')) ||
      asString(pick(request, 'web_url')) ||
      asString(pick(request, 'detailUrl'));

    mergeRequests.push({
      localId: Number(pick(request, 'localId') ?? pick(request, 'local_id') ?? 0),
      title,
      state: asString(pick(request, 'state')) || asString(pick(request, 'status')),
      sourceBranch:
        asString(pick(request, 'sourceBranch')) || asString(pick(request, 'source_branch')),
      targetBranch:
        asString(pick(request, 'targetBranch')) || asString(pick(request, 'target_branch')),
      author: pick(request, 'author') as MrSummary['author'],
      createdAt: asString(pick(request, 'createdAt')) || asString(pick(request, 'gmtCreate')),
      ...(webUrl ? { webUrl } : {}),
    });
  }
  return mergeRequests;
}

async function loadRepoTrace(
  repoId: number,
  identifier: string,
  pattern: string,
): Promise<RepoTrace> {
  const [branches, commits, mergeRequests] = await Promise.all([
    api.listBranches(repoId).catch(() => null),
    api.listRepositoryCommits(repoId).catch(() => null),
    api.listMergeRequests(repoId).catch(() => null),
  ]);

  return {
    repoId,
    branches: mapBranches(branches, identifier, pattern),
    commits: mapCommits(commits, identifier, pattern),
    mergeRequests: mapMergeRequests(mergeRequests, identifier, pattern),
  };
}

// ---- 关联运行（分支交集匹配链路，与 Rust branches_of 同源候选字段） ----

/** 候选流水线：repoCiBindings 中 provider=flow 且绑定仓库 ∈ 本次追溯仓库集合（同一流水线多仓去重合并） */
function flowPipelineCandidates(
  settings: Pick<Settings, 'repoCiBindings'>,
  repoIds: number[],
): { pipelineId: number; pipelineName: string; repoIds: number[] }[] {
  const traced = new Set(repoIds.map(String));
  const byPipeline = new Map<number, { pipelineId: number; pipelineName: string; repoIds: number[] }>();
  for (const [repoId, binding] of Object.entries(settings.repoCiBindings ?? {})) {
    if (binding.provider !== 'flow' || !traced.has(repoId)) continue;
    const existing = byPipeline.get(binding.pipelineId);
    if (existing) existing.repoIds.push(Number(repoId));
    else byPipeline.set(binding.pipelineId, { ...binding, repoIds: [Number(repoId)] });
  }
  return [...byPipeline.values()];
}

/** 运行分支防御式提取：branchModeBranchs / runningBranchs / branches / runningBranch / sources[*].branch，
 *  元素可为字符串、{value|branch|branchName} 对象或 {仓库URL: 分支名} 映射（与 Rust branches_of 一致） */
function collectBranches(value: unknown): string[] {
  const branches: string[] = [];
  const push = (item: unknown, keys: string[]) => {
    if (typeof item === 'string') {
      if (item && !branches.includes(item)) branches.push(item);
      return;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const record = item as Record<string, unknown>;
    for (const key of keys) {
      const name = record[key];
      if (typeof name === 'string' && name && !branches.includes(name)) {
        branches.push(name);
        return;
      }
    }
  };
  const pushField = (source: unknown, key: string, keys: string[]) => {
    if (!source || typeof source !== 'object') return;
    const field = (source as Record<string, unknown>)[key];
    if (Array.isArray(field)) field.forEach((item) => push(item, keys));
    else if (field && typeof field === 'object') {
      Object.values(field as Record<string, unknown>).forEach((item) => push(item, keys));
    }
  };

  for (const key of ['branchModeBranchs', 'runningBranchs', 'branches', 'runningBranch']) {
    pushField(value, key, ['value', 'branch', 'branchName']);
  }
  const sources = value && typeof value === 'object' ? (value as Record<string, unknown>).sources : undefined;
  if (Array.isArray(sources)) sources.forEach((src) => push(src, ['branch', 'branchName', 'value']));
  return branches;
}

/** 运行详情兜底提取：详情可能整体是运行对象，也可能包在 pipelineRun/result 下 */
function detailBranches(detail: unknown): string[] {
  for (const source of [detail, pick(detail, 'pipelineRun'), pick(detail, 'result')]) {
    const found = collectBranches(source);
    if (found.length) return found;
  }
  return [];
}

const RUNS_PER_PIPELINE = 20;
const FALLBACK_DETAILS_PER_PIPELINE = 5;

/** 关联运行：候选流水线最近运行中，分支与工作项已匹配分支名集合有交集者 */
async function loadRelatedRuns(
  matchedBranchNames: string[],
  repoIds: number[],
  settings: Pick<Settings, 'repoCiBindings'>,
): Promise<TracePipelineRun[]> {
  const matched = new Set(matchedBranchNames);
  if (!matched.size) return [];

  const candidates = flowPipelineCandidates(settings, repoIds);
  const grouped = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const recent = await api.listPipelineRuns(candidate.pipelineId, RUNS_PER_PIPELINE);
        const hits: TracePipelineRun[] = [];
        let fallbacks = 0;
        for (const run of recent) {
          let branches = run.branches ?? [];
          // 列表行未带分支且流水线绑定本次追溯仓库 → 拉详情兜底（每流水线最多 5 条）
          if (!branches.length && fallbacks < FALLBACK_DETAILS_PER_PIPELINE && candidate.repoIds.length > 0) {
            fallbacks += 1;
            try {
              branches = detailBranches(await api.getPipelineRun(candidate.pipelineId, run.pipelineRunId));
            } catch {
              branches = [];
            }
          }
          const intersect = branches.filter((name) => matched.has(name));
          if (intersect.length) {
            hits.push({
              ...run,
              pipelineId: candidate.pipelineId,
              pipelineName: candidate.pipelineName,
              branches: intersect,
            });
          }
        }
        return hits;
      } catch {
        return [];
      }
    }),
  );
  return grouped.flat();
}

export async function loadWorkitemTrace(
  workitemId: string,
  identifier: string,
  category: Category,
  settings: Pick<Settings, 'watchedRepos' | 'linkPattern' | 'workitemRepos' | 'repoCiBindings'>,
): Promise<TraceResult> {
  const repoIds = workitemRepoIds(category, workitemId, settings);
  const repositories = await Promise.all(
    repoIds.map((repoId) =>
      loadRepoTrace(repoId, identifier, settings.linkPattern),
    ),
  );

  // 关联运行段失败静默（runs=[]），不阻塞追溯主链路
  let runs: TracePipelineRun[] = [];
  try {
    runs = await loadRelatedRuns(
      repositories.flatMap((trace) => trace.branches.map((branch) => branch.name)),
      repoIds,
      settings,
    );
  } catch {
    runs = [];
  }

  return {
    workitemId,
    repositories,
    branches: repositories.flatMap((trace) => trace.branches),
    commits: repositories.flatMap((trace) => trace.commits),
    mergeRequests: repositories.flatMap((trace) => trace.mergeRequests),
    runs,
    scannedAt: Date.now(),
  };
}
