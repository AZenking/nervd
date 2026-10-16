import { useState, useCallback, useEffect } from 'react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { toast } from '@/components/ui/toast';
import { errorLog } from '@/lib/error-format';

export interface WorkflowStatusItem {
  id: string;
  name: string;
}

export interface UseWorkitemWorkflowStatusesOptions {
  workitemId?: string;
  currentStatusId?: string;
  currentStatusName?: string;
  onSuccess?: (newStatus: { id: string; name: string }) => void | Promise<void>;
}

/**
 * 工作项工作流状态拉取与受控流转 Hook：
 * - 懒加载指定工作项的工作流可选状态列表
 * - 安全写操作门控拦截与只读提示
 * - 统一调用 useApp.updateWorkitemStatusOptimistic 进行乐观流转与回滚
 */
export function useWorkitemWorkflowStatuses(options: UseWorkitemWorkflowStatusesOptions = {}) {
  const { workitemId, currentStatusId, currentStatusName, onSuccess } = options;
  const allowWriteOps = useApp((s) => s.settings?.allowWriteOps ?? false);
  const openSettings = useUi((s) => s.openSettings);

  const [statuses, setStatuses] = useState<WorkflowStatusItem[]>([]);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    setStatuses([]);
    setLoadingStatuses(false);
  }, [workitemId]);

  const fetchStatuses = useCallback(async () => {
    if (!workitemId || statuses.length > 0 || loadingStatuses) return;
    setLoadingStatuses(true);
    try {
      const items = await api.getWorkitemWorkflowStatuses(workitemId);
      setStatuses(items);
    } catch (e) {
      errorLog('fetch-workflow-statuses', e);
    } finally {
      setLoadingStatuses(false);
    }
  }, [workitemId, statuses.length, loadingStatuses]);

  const changeStatus = useCallback(
    async (target: WorkflowStatusItem): Promise<boolean> => {
      if (!allowWriteOps) {
        toast.add({
          title: '当前处于只读模式',
          description: '更新状态需在「设置 → 安全」中开启写操作。',
          type: 'warning',
          actionProps: {
            children: '前往设置',
            onClick: () => openSettings('security'),
          },
        });
        return false;
      }

      if (!workitemId) return false;
      if (target.id === currentStatusId || target.name === currentStatusName) return false;

      setUpdatingStatus(true);
      try {
        const success = await useApp.getState().updateWorkitemStatusOptimistic(
          workitemId,
          target.name,
          target.id,
        );
        if (success && onSuccess) {
          await onSuccess(target);
        }
        return success;
      } catch (e) {
        errorLog('update-workflow-status', e);
        return false;
      } finally {
        setUpdatingStatus(false);
      }
    },
    [allowWriteOps, workitemId, currentStatusId, currentStatusName, openSettings, onSuccess],
  );

  return {
    statuses,
    loadingStatuses,
    updatingStatus,
    fetchStatuses,
    changeStatus,
  };
}
