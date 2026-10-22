import * as api from '../../lib/api';
import { errorLog } from '../../lib/error-format';
import { workitemRepoIds } from '../../lib/workitem-repos';
import type { Category } from '../../types';
import type { AppRuntime } from './runtime';
import {
  beginFieldOperation,
  clearOptimisticField,
  fieldKey,
  isCurrentFieldOperation,
  resetSyncTimers,
  setOptimisticField,
} from './runtime';
import {
  arr,
  mergeChildrenWithOptimistic,
  mergeDetailOptimistic,
  mergeRowOptimistic,
  mergeWorkitemRows,
  patchCollections,
  patchDetail,
  readDetailField,
  recordFieldValue,
} from './helpers';
import type { AppSliceCreator, RefreshResult, SyncField, WorkitemsSlice } from './types';

const syncRetryDelays = [1_500, 5_000, 15_000];

function mapRows(runtime: AppRuntime, rows: api.WorkitemRow[]): api.WorkitemRow[] {
  return rows.map((row) => mergeRowOptimistic(runtime, { ...row, assignedTo: row.assignedTo || '—' }));
}

export function createWorkitemsSlice(runtime: AppRuntime): AppSliceCreator<WorkitemsSlice> {
  return (set, get) => {
    const setSyncPending = (workitemId: string, field: SyncField, expectedValue: string, attempts: number, lastError?: string) => {
      set((state) => ({
        syncPendingByWorkitem: {
          ...state.syncPendingByWorkitem,
          [workitemId]: {
            workitemId,
            field,
            expectedValue,
            attempts,
            ...(attempts < syncRetryDelays.length ? { nextRetryAt: Date.now() + syncRetryDelays[attempts] } : {}),
            ...(lastError ? { lastError } : {}),
          },
        },
      }));
    };

    const clearSyncPending = (workitemId: string) => {
      set((state) => {
        if (!state.syncPendingByWorkitem[workitemId]) return {};
        const next = { ...state.syncPendingByWorkitem };
        delete next[workitemId];
        return { syncPendingByWorkitem: next };
      });
    };

    const verifyAndRetry = (
      workitemId: string,
      field: SyncField,
      expectedValue: string,
      operation: number,
      attempt: number,
    ) => {
      resetSyncTimers(runtime, workitemId, field);
      const delay = syncRetryDelays[attempt];
      if (delay === undefined) {
        setSyncPending(workitemId, field, expectedValue, attempt, '服务端重读仍未返回新值');
        get().setToast({ text: '修改已提交，但服务端同步待确认，可稍后重试', kind: 'info' });
        return;
      }
      setSyncPending(workitemId, field, expectedValue, attempt);
      const timer = setTimeout(async () => {
        if (!isCurrentFieldOperation(runtime, workitemId, field, operation)) return;
        try {
          const raw = await api.getWorkitem(workitemId);
          const actual = readDetailField(raw, workitemId, field);
          if (actual === expectedValue) {
            clearOptimisticField(runtime, workitemId, field);
            clearSyncPending(workitemId);
            return;
          }
          verifyAndRetry(workitemId, field, expectedValue, operation, attempt + 1);
        } catch (error) {
          verifyAndRetry(workitemId, field, expectedValue, operation, attempt + 1);
          if (attempt + 1 >= syncRetryDelays.length) {
            setSyncPending(workitemId, field, expectedValue, attempt + 1, String(error));
          }
        }
      }, delay);
      runtime.syncTimers.set(fieldKey(workitemId, field), [timer]);
    };

    const startSync = (workitemId: string, field: SyncField, expectedValue: string, operation: number) => {
      if (get().selectedId !== workitemId) {
        // 未打开详情时，写入已经由 API 确认；避免把旧测试/旧列表值长期压在内存里。
        clearOptimisticField(runtime, workitemId, field);
        return;
      }
      void get().reloadCurrentDetail();
      verifyAndRetry(workitemId, field, expectedValue, operation, 0);
    };

    const optimisticUpdate = (
      workitemId: string,
      field: SyncField,
      value: string,
      statusId?: string,
    ) => {
      set((state) => {
        const collections = patchCollections(state.items, state.children, workitemId, field, value, statusId);
        return {
          ...collections,
          detail: patchDetail(state.detail, workitemId, field, value, statusId),
        };
      });
    };

    const rollbackField = (
      workitemId: string,
      field: SyncField,
      previousValue: string | undefined,
      previousAssigneeId?: string,
    ) => {
      if (previousValue === undefined) return;
      set((state) => {
        const collections = patchCollections(
          state.items,
          state.children,
          workitemId,
          field,
          previousValue,
          previousAssigneeId,
        );
        return {
          ...collections,
          detail: patchDetail(state.detail, workitemId, field, previousValue),
        };
      });
    };

    const updateField = async (
      workitemId: string,
      field: SyncField,
      value: string,
      payload: Parameters<typeof api.updateWorkitem>[1] | (() => Promise<Parameters<typeof api.updateWorkitem>[1]>),
      statusId?: string,
      previousValueOverride?: string,
    ): Promise<boolean> => {
      const state = get();
      const previousValue = previousValueOverride
        ?? recordFieldValue(state.items, state.children, state.detail, workitemId, field);
      const item = state.items.find((entry) => entry.workitemId === workitemId);
      const child = state.children.find((entry) => entry.workitemId === workitemId);
      const previousAssigneeId = field === 'assignee' ? item?.assignedToId : undefined;
      if (previousValue === value && !(field === 'status' && statusId)) return true;

      const operation = beginFieldOperation(runtime, workitemId, field);
      setOptimisticField(runtime, workitemId, field, value, statusId);
      optimisticUpdate(workitemId, field, value, statusId);
      try {
        const resolvedPayload = typeof payload === 'function' ? await payload() : payload;
        const resolvedAuxiliaryId = field === 'status'
          ? resolvedPayload.statusId
          : statusId;
        if (resolvedAuxiliaryId && resolvedAuxiliaryId !== statusId) {
          setOptimisticField(runtime, workitemId, field, value, resolvedAuxiliaryId);
          set((state) => ({ detail: patchDetail(state.detail, workitemId, field, value, resolvedAuxiliaryId) }));
        }
        await api.updateWorkitem(workitemId, resolvedPayload);
        const label = item?.identifier || child?.identifier || '工作项';
        const fieldLabel = field === 'status' ? '状态已流转为' : field === 'description' ? '描述已更新' : '负责人已变更为';
        get().setToast({
          text: field === 'description' ? `${label} ${fieldLabel}` : `${label} ${fieldLabel}「${value}」`,
          kind: 'ok',
        });
        startSync(workitemId, field, value, operation);
        return true;
      } catch (error) {
        if (isCurrentFieldOperation(runtime, workitemId, field, operation)) {
          clearOptimisticField(runtime, workitemId, field);
          resetSyncTimers(runtime, workitemId, field);
          rollbackField(workitemId, field, previousValue, previousAssigneeId);
          get().setToast({
            text: `${field === 'status' ? '状态流转' : field === 'description' ? '描述保存' : '负责人修改'}失败: ${String(error)}`,
            kind: 'fail',
          });
        }
        return false;
      }
    };

    return {
      category: 'Req',
      items: [],
      nextToken: null,
      loadingList: false,
      revalidatingList: false,
      selectedId: null,
      detail: null,
      comments: [],
      children: [],
      childrenError: null,
      childrenDebug: null,
      loadingDetail: false,

      async setCategory(category: Category) {
        runtime.requests.detail += 1;
        runtime.requests.trace += 1;
        runtime.requests.logs += 1;
        set({
          category,
          items: [],
          nextToken: null,
          selectedId: null,
          detail: null,
          comments: [],
          children: [],
          childrenError: null,
          childrenDebug: null,
          loadingDetail: false,
          trace: null,
          traceLoading: false,
          logView: null,
          listFetchedAt: null,
          detailFetchedAt: null,
        });
        await get().loadList();
      },

      async loadList(next = false) {
        const requestId = ++runtime.requests.list;
        const { settings, category, nextToken } = get();
        const spaceIdentifier = settings?.defaultSpaceIdentifier;
        if (!spaceIdentifier || (next && !nextToken)) {
          set({ loadingList: false });
          return;
        }
        const isCurrent = () =>
          requestId === runtime.requests.list &&
          get().category === category &&
          get().settings?.defaultSpaceIdentifier === spaceIdentifier;
        set({ loadingList: true });
        try {
          const page = await api.listWorkitems({
            category,
            spaceIdentifier,
            nextToken: next ? (nextToken ?? undefined) : undefined,
          });
          if (!isCurrent()) return;
          const mapped = mapRows(runtime, page.items);
          set((state) => {
            if (next) {
              return {
                items: mergeWorkitemRows(state.items, mapped, 'append'),
                nextToken: page.nextToken,
                listFetchedAt: Date.now(),
              };
            }
            return {
              items: state.items.length ? mergeWorkitemRows(state.items, mapped) : mapped,
              nextToken: state.items.length ? (state.nextToken ?? page.nextToken) : page.nextToken,
              listFetchedAt: Date.now(),
            };
          });
        } catch (error) {
          if (isCurrent()) get().setToast({ text: `列表加载失败：${String(error)}`, kind: 'fail' });
        } finally {
          if (isCurrent()) set({ loadingList: false });
        }
      },

      async revalidateList() {
        const requestId = ++runtime.requests.list;
        const { settings, category } = get();
        const spaceIdentifier = settings?.defaultSpaceIdentifier;
        if (!spaceIdentifier) {
          set({ revalidatingList: false });
          return;
        }
        const isCurrent = () =>
          requestId === runtime.requests.list &&
          get().category === category &&
          get().settings?.defaultSpaceIdentifier === spaceIdentifier;
        set({ revalidatingList: true });
        try {
          const page = await api.listWorkitems({ category, spaceIdentifier });
          if (!isCurrent()) return;
          const mapped = mapRows(runtime, page.items);
          set((state) => ({
            items: state.items.length ? mergeWorkitemRows(state.items, mapped) : mapped,
            nextToken: state.items.length ? (state.nextToken ?? page.nextToken) : page.nextToken,
            listFetchedAt: Date.now(),
          }));
        } catch (error) {
          errorLog('app.revalidateList', error);
        } finally {
          if (isCurrent()) set({ revalidatingList: false });
        }
      },

      async loadChildren(workitemId: string) {
        const requestId = (runtime.childrenRequests.get(workitemId) ?? 0) + 1;
        runtime.childrenRequests.set(workitemId, requestId);
        try {
          const result = await api.listWorkitemChildren(workitemId);
          if (runtime.childrenRequests.get(workitemId) !== requestId) return;
          if (get().selectedId !== workitemId && get().selectedId !== null) return;
          set({
            children: mergeChildrenWithOptimistic(runtime, workitemId, result.items),
            childrenError: null,
            childrenDebug: result.rawSample ?? null,
          });
          const hasUnindexed = Array.from(runtime.optimisticCreatedChildren.values()).some(
            (record) => record.parentId === workitemId && Date.now() - record.createdAt < 30_000,
          );
          if (hasUnindexed) {
            setTimeout(() => {
              if (
                runtime.childrenRequests.get(workitemId) === requestId &&
                (get().selectedId === workitemId || get().selectedId === null)
              ) void get().loadChildren(workitemId);
            }, 2_000);
          }
        } catch (error) {
          if (runtime.childrenRequests.get(workitemId) !== requestId) return;
          set({ childrenError: String(error), childrenDebug: null });
        }
      },

      async select(workitemId: string) {
        const requestId = ++runtime.requests.detail;
        runtime.requests.trace += 1;
        const settings = get().settings;
        const isCurrent = () => requestId === runtime.requests.detail && get().selectedId === workitemId;
        set({
          selectedId: workitemId,
          detail: null,
          comments: [],
          children: [],
          childrenError: null,
          childrenDebug: null,
          trace: null,
          traceLoading: false,
          loadingDetail: true,
        });
        try {
          const [detail, commentsRaw, childrenResult] = await Promise.all([
            api.getWorkitem(workitemId),
            api.listWorkitemComments(workitemId).catch(() => ({})),
            api.listWorkitemChildren(workitemId).then(
              (result) => ({ items: result.items, error: null as string | null, debug: result.rawSample ?? null }),
              (error: unknown) => ({ items: [] as api.WorkitemChild[], error: String(error), debug: null as string | null }),
            ),
          ]);
          if (!isCurrent()) return;
          set({
            detail: mergeDetailOptimistic(runtime, detail, workitemId),
            comments: arr(commentsRaw),
            children: mergeChildrenWithOptimistic(runtime, workitemId, childrenResult.items),
            childrenError: childrenResult.error,
            childrenDebug: childrenResult.debug,
            detailFetchedAt: Date.now(),
          });
        } catch (error) {
          if (isCurrent()) get().setToast({ text: `详情加载失败：${String(error)}`, kind: 'fail' });
        } finally {
          if (get().selectedId === workitemId) set({ loadingDetail: false });
        }
        const current = get();
        const selected = current.items.find((item) => item.workitemId === workitemId);
        const child = current.children.find((item) => item.workitemId === workitemId);
        const category = (selected?.category || child?.category || current.category) as Category;
        if (isCurrent() && settings && workitemRepoIds(category, workitemId, settings).length > 0) {
          void get().loadTrace();
        }
      },

      async reloadComments(workitemId?: string) {
        const targetId = workitemId ?? get().selectedId;
        if (!targetId) return;
        try {
          const raw = await api.listWorkitemComments(targetId);
          if (!workitemId || get().selectedId === targetId) set({ comments: arr(raw) });
        } catch {
          // 评论刷新失败不清空已有讨论内容。
        }
      },

      async reloadCurrentDetail(): Promise<RefreshResult> {
        const workitemId = get().selectedId;
        if (!workitemId) return { status: 'fail', errors: ['没有选中的工作项'] };
        const requestId = ++runtime.requests.detail;
        const isCurrent = () => requestId === runtime.requests.detail && get().selectedId === workitemId;
        const errors: string[] = [];
        const [detailResult, commentsResult, childrenResult] = await Promise.all([
          api.getWorkitem(workitemId).then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error })),
          api.listWorkitemComments(workitemId).then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error })),
          api.listWorkitemChildren(workitemId).then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error })),
        ]);
        if (!isCurrent()) return { status: 'fail', errors: ['详情已切换，旧刷新结果已失效'] };
        const patch: Record<string, unknown> = {};
        if (detailResult.ok) patch.detail = mergeDetailOptimistic(runtime, detailResult.value, workitemId);
        else errors.push(`详情：${String(detailResult.error)}`);
        if (commentsResult.ok) patch.comments = arr(commentsResult.value);
        else errors.push(`动态：${String(commentsResult.error)}`);
        if (childrenResult.ok) {
          patch.children = mergeChildrenWithOptimistic(runtime, workitemId, childrenResult.value.items);
          patch.childrenError = null;
          patch.childrenDebug = childrenResult.value.rawSample ?? null;
        } else {
          errors.push(`子项：${String(childrenResult.error)}`);
        }
        patch.detailFetchedAt = Date.now();
        set(patch);
        if (detailResult.ok) void get().loadTrace();
        if (errors.length === 0) return { status: 'success', errors };
        if (detailResult.ok || commentsResult.ok || childrenResult.ok) return { status: 'partial', errors };
        errorLog('app.reloadCurrentDetail', errors.join('; '));
        return { status: 'fail', errors };
      },

      async updateWorkitemStatusOptimistic(workitemId, newStatus, statusId) {
        const legacyPrevious = runtime.optimisticChildPreviousStatuses.get(workitemId)?.status;
        const result = await updateField(
          workitemId,
          'status',
          newStatus,
          async () => {
            let targetStatusId = statusId;
            try {
              targetStatusId ??= (await api.getWorkitemWorkflowStatuses(workitemId)).find(
                (status) => status.name === newStatus || status.name.includes(newStatus) || newStatus.includes(status.name),
              )?.id;
            } catch {
              throw new Error(`无法找到目标状态「${newStatus}」对应的工作流状态 ID`);
            }
            if (!targetStatusId) throw new Error(`无法找到目标状态「${newStatus}」对应的工作流状态 ID`);
            return { statusId: targetStatusId };
          },
          statusId,
          legacyPrevious,
        );
        runtime.optimisticChildPreviousStatuses.delete(workitemId);
        return result;
      },

      async updateWorkitemDescriptionOptimistic(workitemId, newDescription) {
        return updateField(workitemId, 'description', newDescription, {
          description: newDescription,
          formatType: 'RICHTEXT',
        });
      },

      async updateWorkitemAssigneeOptimistic(workitemId, newAssigneeId, newAssigneeName) {
        return updateField(workitemId, 'assignee', newAssigneeName, { assignedTo: newAssigneeId }, newAssigneeId);
      },

      async updateChildStatusOptimistic(workitemId, newStatus, statusId) {
        // 保留旧调用方的即时更新兼容层；真正写入由 workflow hook 调用统一 action 完成。
        const current = get().children.find((child) => child.workitemId === workitemId);
        if (!current || current.status !== newStatus || statusId) {
          if (current && !runtime.optimisticChildPreviousStatuses.has(workitemId)) {
            runtime.optimisticChildPreviousStatuses.set(workitemId, {
              status: current.status,
              statusId: current.statusId,
            });
          }
          runtime.optimisticChildStatuses.set(workitemId, { status: newStatus, statusId, updatedAt: Date.now() });
          set((state) => ({
            children: state.children.map((child) =>
              child.workitemId === workitemId
                ? { ...child, status: newStatus, statusId: statusId ?? child.statusId }
                : child,
            ),
          }));
        }
        return true;
      },

      addOptimisticChild(parentWorkitemId, childOrChildren) {
        const children = Array.isArray(childOrChildren) ? childOrChildren : [childOrChildren];
        const createdAt = Date.now();
        for (const child of children) {
          runtime.optimisticCreatedChildren.set(child.workitemId, {
            parentId: parentWorkitemId,
            item: { ...child },
            createdAt,
          });
        }
        if (get().selectedId !== parentWorkitemId) return;
        set((state) => {
          const ids = new Set(state.children.map((child) => child.workitemId));
          const toAdd = children.filter((child) => !ids.has(child.workitemId));
          return toAdd.length ? { children: [...toAdd, ...state.children] } : {};
        });
      },
    };
  };
}
