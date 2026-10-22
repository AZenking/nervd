import type { WorkitemChild, WorkitemRow } from '../../lib/api';
import type { SyncField } from './types';
import type { AppRuntime } from './runtime';
import { getOptimisticField } from './runtime';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** 根数组、result/data/items 包装统一解包。 */
export function arr(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    for (const key of ['result', 'data', 'items']) {
      const nested = value[key];
      if (Array.isArray(nested)) return nested;
    }
  }
  return [];
}

const nestedDetailKeys = ['workitem', 'workItem', 'data', 'result', 'item', 'entity'];

function detailId(record: Record<string, unknown>): string | undefined {
  for (const key of ['workitemId', 'workItemId', 'id']) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

export function detailRecords(detail: Record<string, unknown>): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const visited = new Set<Record<string, unknown>>();
  const visit = (record: Record<string, unknown>, depth: number) => {
    if (visited.has(record) || depth > 3) return;
    visited.add(record);
    records.push(record);
    for (const key of nestedDetailKeys) {
      const nested = record[key];
      if (isRecord(nested)) visit(nested, depth + 1);
    }
  };
  visit(detail, 0);
  return records;
}

export function detailMatches(detail: Record<string, unknown> | null, workitemId: string): boolean {
  return Boolean(detail && detailRecords(detail).some((record) => detailId(record) === workitemId));
}

function statusValue(existing: unknown, nextStatus: string, statusId?: string): unknown {
  if (isRecord(existing)) return { ...existing, id: statusId ?? existing.id, name: nextStatus };
  return nextStatus;
}

function patchRecord(
  record: Record<string, unknown>,
  field: SyncField,
  value: string,
  statusId?: string,
): Record<string, unknown> {
  if (field === 'status') {
    return {
      ...record,
      status: statusValue(record.status, value, statusId),
      statusStageName: value,
      ...(statusId ? { statusId } : {}),
    };
  }
  if (field === 'description') {
    return { ...record, description: value, content: value };
  }
  const existing = record.assignedTo;
  return {
    ...record,
    assignedTo: isRecord(existing)
      ? { ...existing, ...(statusId ? { id: statusId } : {}), name: value }
      : value,
  };
}

/**
 * 对平铺、workitem、data/result 包装同时打补丁。只在匹配 ID 的实体上更新；
 * 若响应完全没有 ID（部分预览 mock 的形态），则将所有详情层视为同一实体。
 */
export function patchDetail(
  detail: Record<string, unknown> | null,
  workitemId: string,
  field: SyncField,
  value: string,
  statusId?: string,
): Record<string, unknown> | null {
  if (!detail) return detail;
  const records = detailRecords(detail);
  const matching = records.filter((record) => detailId(record) === workitemId);
  const hasAnyId = records.some((record) => detailId(record));
  const shouldPatch = (record: Record<string, unknown>) =>
    matching.length ? matching.includes(record) : !hasAnyId;
  const visited = new Set<Record<string, unknown>>();
  const visit = (record: Record<string, unknown>, depth: number): Record<string, unknown> => {
    if (visited.has(record) || depth > 3) return record;
    visited.add(record);
    let next = shouldPatch(record) ? patchRecord(record, field, value, statusId) : record;
    for (const key of nestedDetailKeys) {
      const nested = next[key];
      if (isRecord(nested)) {
        const patched = visit(nested, depth + 1);
        if (patched !== nested) next = { ...next, [key]: patched };
      }
    }
    return next;
  };
  return visit(detail, 0);
}

export function readDetailField(
  detail: Record<string, unknown> | null,
  workitemId: string,
  field: SyncField,
): string | undefined {
  if (!detail) return undefined;
  const records = detailRecords(detail);
  const matching = records.find((record) => detailId(record) === workitemId) ?? records[0];
  if (!matching) return undefined;
  if (field === 'status') {
    const status = matching.status;
    if (typeof status === 'string') return status;
    if (isRecord(status) && typeof status.name === 'string') return status.name;
    return typeof matching.statusStageName === 'string' ? matching.statusStageName : undefined;
  }
  if (field === 'description') {
    return typeof matching.description === 'string'
      ? matching.description
      : typeof matching.content === 'string'
        ? matching.content
        : undefined;
  }
  const assignee = matching.assignedTo;
  if (typeof assignee === 'string') return assignee;
  return isRecord(assignee) && typeof assignee.name === 'string' ? assignee.name : undefined;
}

export function mergeDetailOptimistic(
  runtime: AppRuntime,
  detail: Record<string, unknown> | null,
  workitemId: string,
): Record<string, unknown> | null {
  let next = detail;
  for (const field of ['status', 'description', 'assignee'] as SyncField[]) {
    const optimistic = getOptimisticField(runtime, workitemId, field);
    if (optimistic) next = patchDetail(next, workitemId, field, optimistic.value, optimistic.auxiliaryValue);
  }
  return next;
}

export function mergeChildrenWithOptimistic(
  runtime: AppRuntime,
  workitemId: string,
  serverItems: WorkitemChild[],
): WorkitemChild[] {
  const now = Date.now();
  const mergedServerItems = serverItems.map((item) => {
    const status = runtime.optimisticChildStatuses.get(item.workitemId);
    const statusField = getOptimisticField(runtime, item.workitemId, 'status');
    const assigneeField = getOptimisticField(runtime, item.workitemId, 'assignee');
    const descriptionField = getOptimisticField(runtime, item.workitemId, 'description');
    return {
      ...item,
      ...(status && now - status.updatedAt < 15_000
        ? { status: status.status, statusId: status.statusId ?? item.statusId }
        : {}),
      ...(statusField ? { status: statusField.value } : {}),
      ...(assigneeField ? { assignedTo: assigneeField.value } : {}),
      ...(descriptionField ? { description: descriptionField.value } : {}),
    };
  });

  const existingIds = new Set(mergedServerItems.map((child) => child.workitemId));
  const pending: WorkitemChild[] = [];
  for (const [childId, record] of runtime.optimisticCreatedChildren.entries()) {
    if (now - record.createdAt > 30_000) {
      runtime.optimisticCreatedChildren.delete(childId);
      continue;
    }
    if (record.parentId !== workitemId || existingIds.has(childId)) {
      if (existingIds.has(childId)) runtime.optimisticCreatedChildren.delete(childId);
      continue;
    }
    const status = runtime.optimisticChildStatuses.get(childId);
    pending.push({
      ...record.item,
      ...(status && now - status.updatedAt < 15_000
        ? { status: status.status, statusId: status.statusId ?? record.item.statusId }
        : {}),
    });
  }
  return [...pending, ...mergedServerItems];
}

export function mergeWorkitemRows(
  existing: WorkitemRow[],
  incoming: WorkitemRow[],
  placement: 'prepend' | 'append' = 'prepend',
): WorkitemRow[] {
  if (!existing.length) return incoming;
  const existingMap = new Map<string, number>();
  existing.forEach((item, index) => {
    const key = item.workitemId || item.identifier;
    if (key) existingMap.set(key, index);
  });
  const nextItems = [...existing];
  const newItems: WorkitemRow[] = [];
  for (const item of incoming) {
    const key = item.workitemId || item.identifier;
    if (key && existingMap.has(key)) {
      const index = existingMap.get(key)!;
      nextItems[index] = { ...nextItems[index], ...item };
    } else {
      newItems.push(item);
    }
  }
  if (!newItems.length) return nextItems;
  return placement === 'append' ? [...nextItems, ...newItems] : [...newItems, ...nextItems];
}

export function mergeRowOptimistic(runtime: AppRuntime, row: WorkitemRow): WorkitemRow {
  let next = row;
  for (const field of ['status', 'description', 'assignee'] as SyncField[]) {
    const optimistic = getOptimisticField(runtime, row.workitemId, field);
    if (!optimistic) continue;
    if (field === 'status') next = { ...next, status: optimistic.value, statusStageName: optimistic.value };
    if (field === 'description') next = { ...next, description: optimistic.value } as WorkitemRow;
    if (field === 'assignee') next = { ...next, assignedTo: optimistic.value };
  }
  return next;
}

export function recordFieldValue(
  items: WorkitemRow[],
  children: WorkitemChild[],
  detail: Record<string, unknown> | null,
  workitemId: string,
  field: SyncField,
): string | undefined {
  const item = items.find((entry) => entry.workitemId === workitemId);
  const child = children.find((entry) => entry.workitemId === workitemId);
  const value = field === 'status'
    ? item?.status ?? child?.status
    : field === 'description'
      ? (item as WorkitemRow & { description?: string } | undefined)?.description
        ?? (child as WorkitemChild & { description?: string } | undefined)?.description
      : item?.assignedTo ?? child?.assignedTo;
  return value ?? readDetailField(detail, workitemId, field);
}

export function patchCollections(
  items: WorkitemRow[],
  children: WorkitemChild[],
  workitemId: string,
  field: SyncField,
  value: string,
  auxiliaryId?: string,
): { items: WorkitemRow[]; children: WorkitemChild[] } {
  const nextItems = items.map((item) => {
    if (item.workitemId !== workitemId) return item;
    if (field === 'status') return { ...item, status: value, statusStageName: value };
    if (field === 'description') return { ...item, description: value };
    return { ...item, assignedTo: value, ...(auxiliaryId ? { assignedToId: auxiliaryId } : {}) };
  });
  const nextChildren = children.map((child) => {
    if (child.workitemId !== workitemId) return child;
    if (field === 'status') return { ...child, status: value };
    if (field === 'description') return { ...child, description: value };
    return { ...child, assignedTo: value };
  });
  return { items: nextItems, children: nextChildren };
}
