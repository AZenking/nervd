import * as api from '../lib/api';
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

export async function loadWorkitemTrace(
  workitemId: string,
  identifier: string,
  category: Category,
  settings: Pick<Settings, 'watchedRepos' | 'linkPattern' | 'workitemRepos'>,
): Promise<TraceResult> {
  const repoIds = workitemRepoIds(category, workitemId, settings);
  const repositories = await Promise.all(
    repoIds.map((repoId) =>
      loadRepoTrace(repoId, identifier, settings.linkPattern),
    ),
  );

  return {
    workitemId,
    repositories,
    branches: repositories.flatMap((trace) => trace.branches),
    commits: repositories.flatMap((trace) => trace.commits),
    mergeRequests: repositories.flatMap((trace) => trace.mergeRequests),
    runs: [],
    scannedAt: Date.now(),
  };
}
