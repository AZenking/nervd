import * as api from '@/lib/api';
import type { BranchInfo } from '../types';

const PAGE_SIZE = 100;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function branchArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const object = asObject(value);
  if (!object) return [];
  for (const key of ['result', 'data', 'items', 'branches', 'Result', 'Data']) {
    const nested = object[key];
    if (Array.isArray(nested)) return nested;
    const nestedObject = asObject(nested);
    if (nestedObject) {
      const nestedArray = branchArray(nestedObject);
      if (nestedArray.length) return nestedArray;
    }
  }
  return [];
}

function stringField(object: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

export function parseBranchList(value: unknown): BranchInfo[] {
  return branchArray(value).flatMap((item) => {
    const object = asObject(item);
    if (!object) return [];
    const name = stringField(object, 'name', 'branchName', 'branch_name');
    if (!name) return [];
    const rawCommit = asObject(object.commit) ?? asObject(object.lastCommit) ?? {};
    const id = stringField(rawCommit, 'id', 'commitId', 'sha');
    const message = stringField(rawCommit, 'message', 'title');
    const committedDate = stringField(rawCommit, 'committedDate', 'commitDate', 'date');
    return [{
      name,
      protected: typeof object.protected === 'boolean' ? object.protected : undefined,
      commit: id || message || committedDate ? { id, message, committedDate } : undefined,
    }];
  });
}

export function branchPageHasMore(value: unknown, itemCount: number, page: number, perPage = PAGE_SIZE): boolean {
  const object = asObject(value);
  if (object) {
    for (const key of ['total', 'totalCount', 'total_count', 'totalElements']) {
      const total = Number(object[key]);
      if (Number.isFinite(total) && total >= 0) return page * perPage < total;
    }
  }
  return itemCount >= perPage;
}

export async function findRemoteBranch(repoId: number, branchName: string): Promise<BranchInfo | undefined> {
  const expected = branchName.trim();
  if (!expected) return undefined;
  for (let page = 1; page <= 100; page += 1) {
    const response = await api.listBranches(repoId, expected, page, PAGE_SIZE);
    const branches = parseBranchList(response);
    const exact = branches.find((branch) => branch.name === expected);
    if (exact) return exact;
    if (!branchPageHasMore(response, branches.length, page)) return undefined;
  }
  return undefined;
}
