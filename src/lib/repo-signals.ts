import type { Settings, TraceResult } from '../types';
import * as api from './api';
import type { WorkitemRow } from './api';
import { identifierNum, matchesWorkitem } from './link';
import { parseBranchList } from './iteration-branches';

/** 单个仓库的确定性信号得分与可解释理由（供 AI 候选排序与标注） */
export interface RepoSignal {
  score: number;
  reasons: string[];
}

/** 现扫候选仓库得到的命中（trace 只覆盖已关联仓库，候选需现场探测） */
export interface RepoProbeHits {
  branchHit: boolean;
  assigneeHit: boolean;
}

export interface RepoSignalParams {
  repositories: { id: number }[];
  settings: Pick<Settings, 'workitemRepos' | 'repoCiBindings'> | null | undefined;
  /** 已按迭代收窄的工作项列表（与当前工作项同 sprint） */
  items: WorkitemRow[];
  /** 当前需求工作项 ID（共现统计时排除自身） */
  currentWorkitemId: string | null;
  /** 需求处理人姓名（与 commit 作者匹配） */
  assigneeName: string | undefined;
  /** 当前需求的追溯结果；仅覆盖已关联仓库 */
  trace: TraceResult | null;
  /** 现扫的候选仓库命中（分支名 / 处理人提交） */
  probes?: Map<number, RepoProbeHits>;
}

const SCORE_TRACE_HIT = 100;
const SCORE_ASSIGNEE_COMMIT = 50;
const SCORE_CO_OCCUR = 10;
const SCORE_CI_BOUND = 5;
/** 现扫上限：默认仓库池通常很小，避免整组织仓库触发海量 IPC */
const PROBE_REPO_CAP = 8;

/**
 * 确定性仓库信号打分：追溯/分支命中 > 处理人 Commit > 同迭代共现 > CI 绑定。
 * trace 仅覆盖已关联仓库；候选仓库的分支与作者信号由 probeRepoSignalHits 现扫补齐。
 */
export function repoSignalScores(params: RepoSignalParams): Map<number, RepoSignal> {
  const { repositories, settings, items, currentWorkitemId, assigneeName, trace, probes } = params;
  const scores = new Map<number, RepoSignal>();
  const bump = (repoId: number, points: number, reason: string) => {
    const cur = scores.get(repoId) ?? { score: 0, reasons: [] };
    cur.score += points;
    cur.reasons.push(reason);
    scores.set(repoId, cur);
  };

  // 信号 1：追溯命中——分支/MR/Commit 引用了本需求编号
  const assignee = assigneeName?.trim().toLowerCase();
  for (const repo of trace?.repositories ?? []) {
    if (repo.branches.length > 0 || repo.mergeRequests.length > 0) {
      bump(repo.repoId, SCORE_TRACE_HIT, `追溯命中（分支 ${repo.branches.length} / MR ${repo.mergeRequests.length}）`);
    } else if (repo.commits.length > 0) {
      bump(repo.repoId, SCORE_TRACE_HIT, `追溯命中（${repo.commits.length} 个 Commit 引用本需求）`);
    }
    // 信号 4：需求处理人是该仓库命中的 Commit 作者
    if (assignee && repo.commits.some((c) => c.authorName?.trim().toLowerCase() === assignee)) {
      bump(repo.repoId, SCORE_ASSIGNEE_COMMIT, `处理人 ${assigneeName} 在此仓库有相关提交`);
    }
  }

  // 信号 1/4（候选现扫）：默认仓库池里已有本需求分支 / 处理人近期提交
  for (const [repoId, hits] of probes ?? []) {
    if (hits.branchHit) bump(repoId, SCORE_TRACE_HIT, '仓库中已存在引用本需求的分支');
    if (hits.assigneeHit) bump(repoId, SCORE_ASSIGNEE_COMMIT, '处理人近期在此仓库有提交');
  }

  // 信号 2：同迭代共现——同迭代其他工作项单独关联过的仓库（无 override 的行不计，避免全员命中默认仓库）
  const workitemRepos = settings?.workitemRepos ?? {};
  for (const item of items) {
    if (!currentWorkitemId || item.workitemId === currentWorkitemId) continue;
    if (!Object.prototype.hasOwnProperty.call(workitemRepos, item.workitemId)) continue;
    for (const repoId of workitemRepos[item.workitemId] ?? []) {
      bump(repoId, SCORE_CO_OCCUR, `同迭代工作项 ${item.identifier} 关联此仓库`);
    }
  }

  // 信号 3：CI 绑定——团队真实在构建的仓库
  const bindings = settings?.repoCiBindings ?? {};
  for (const repo of repositories) {
    if (bindings[String(repo.id)]) bump(repo.id, SCORE_CI_BOUND, '已配置 CI 构建');
  }

  return scores;
}

const pickField = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (current, key) =>
      current && typeof current === 'object' && key in current
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

/**
 * 现扫候选仓库：分支名是否引用本需求编号、处理人是否为近期提交作者。
 * 每个仓库 2 次 IPC（可失败降级），并行执行，最多 PROBE_REPO_CAP 个仓库。
 */
export async function probeRepoSignalHits(params: {
  repositories: { id: number }[];
  identifier: string;
  linkPattern: string;
  assigneeName?: string;
}): Promise<Map<number, RepoProbeHits>> {
  const { repositories, identifier, linkPattern, assigneeName } = params;
  const assignee = assigneeName?.trim().toLowerCase();
  const num = identifierNum(identifier);
  const hits = new Map<number, RepoProbeHits>();
  if (!identifier || repositories.length === 0) return hits;

  await Promise.all(repositories.slice(0, PROBE_REPO_CAP).map(async (repo) => {
    const [branches, commits] = await Promise.all([
      api.listBranches(repo.id, num || undefined, 1, 100).catch(() => null),
      api.listRepositoryCommits(repo.id).catch(() => null),
    ]);
    hits.set(repo.id, {
      branchHit: parseBranchList(branches).some((branch) => matchesWorkitem(identifier, branch.name, linkPattern)),
      assigneeHit: Boolean(assignee) && asArray(commits).some((commit) => (
        (asString(pickField(commit, 'authorName'))
          || asString(pickField(commit, 'author_name'))
          || asString(pickField(commit, 'author', 'name'))).trim().toLowerCase() === assignee
      )),
    });
  }));
  return hits;
}
