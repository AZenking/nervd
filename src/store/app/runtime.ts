import type { WorkitemChild } from '../../lib/api';
import type { SyncField } from './types';

export interface OptimisticField {
  field: SyncField;
  value: string;
  auxiliaryValue?: string;
  updatedAt: number;
}

export interface AppRuntime {
  requests: {
    connection: number;
    list: number;
    detail: number;
    trace: number;
    pipelines: number;
    logs: number;
  };
  pipelineRunRequests: Map<number, number>;
  repoCiRequests: Map<number, number>;
  childrenRequests: Map<string, number>;
  optimisticChildStatuses: Map<string, { status: string; statusId?: string; updatedAt: number }>;
  optimisticChildPreviousStatuses: Map<string, { status?: string; statusId?: string }>;
  optimisticCreatedChildren: Map<string, { parentId: string; item: WorkitemChild; createdAt: number }>;
  optimisticFields: Map<string, OptimisticField>;
  fieldOperations: Map<string, number>;
  syncTimers: Map<string, ReturnType<typeof setTimeout>[]>;
  pipelineRunSequence: number;
}

export function createAppRuntime(): AppRuntime {
  return {
    requests: { connection: 0, list: 0, detail: 0, trace: 0, pipelines: 0, logs: 0 },
    pipelineRunRequests: new Map(),
    repoCiRequests: new Map(),
    childrenRequests: new Map(),
    optimisticChildStatuses: new Map(),
    optimisticChildPreviousStatuses: new Map(),
    optimisticCreatedChildren: new Map(),
    optimisticFields: new Map(),
    fieldOperations: new Map(),
    syncTimers: new Map(),
    pipelineRunSequence: 0,
  };
}

export const fieldKey = (workitemId: string, field: SyncField) => `${workitemId}:${field}`;

export function beginFieldOperation(runtime: AppRuntime, workitemId: string, field: SyncField): number {
  const key = fieldKey(workitemId, field);
  const next = (runtime.fieldOperations.get(key) ?? 0) + 1;
  runtime.fieldOperations.set(key, next);
  return next;
}

export function isCurrentFieldOperation(
  runtime: AppRuntime,
  workitemId: string,
  field: SyncField,
  operation: number,
): boolean {
  return runtime.fieldOperations.get(fieldKey(workitemId, field)) === operation;
}

export function setOptimisticField(
  runtime: AppRuntime,
  workitemId: string,
  field: SyncField,
  value: string,
  auxiliaryValue?: string,
): void {
  runtime.optimisticFields.set(fieldKey(workitemId, field), {
    field,
    value,
    ...(auxiliaryValue ? { auxiliaryValue } : {}),
    updatedAt: Date.now(),
  });
}

export function getOptimisticField(
  runtime: AppRuntime,
  workitemId: string,
  field: SyncField,
): OptimisticField | undefined {
  const entry = runtime.optimisticFields.get(fieldKey(workitemId, field));
  if (!entry || Date.now() - entry.updatedAt > 30_000) {
    if (entry) runtime.optimisticFields.delete(fieldKey(workitemId, field));
    return undefined;
  }
  return entry;
}

export function clearOptimisticField(runtime: AppRuntime, workitemId: string, field: SyncField): void {
  runtime.optimisticFields.delete(fieldKey(workitemId, field));
}

export function resetSyncTimers(runtime: AppRuntime, workitemId: string, field: SyncField): void {
  const key = fieldKey(workitemId, field);
  for (const timer of runtime.syncTimers.get(key) ?? []) clearTimeout(timer);
  runtime.syncTimers.delete(key);
}

export function nextPipelineRunRequest(runtime: AppRuntime, pipelineId: number): number {
  const requestId = ++runtime.pipelineRunSequence;
  runtime.pipelineRunRequests.set(pipelineId, requestId);
  return requestId;
}
