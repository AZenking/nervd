import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import { findRemoteBranch } from '@/lib/iteration-branches';
import { errorLog, humanizeError } from '@/lib/error-format';
import type { useBranchDivergence } from '../BranchDivergenceCheck';
import type { IterationBaselineCheck } from './types';
import { ensureIterationBaseline, type RepoTraceState } from './linked-repo-delivery';

export interface UseLinkedRepoBranchOpsParams {
  repoId: number;
  repoName: string;
  iterationId?: string;
  placeholderIteration: boolean;
  identifier: string;
  developerBranch: string;
  operationBaseBranch: string;
  templateSourceBranch: string;
  hasValidRule: boolean;
  refreshSignal?: number;
  onRetryBaseline: () => void;
  divergence: ReturnType<typeof useBranchDivergence>;
  loadTrace: () => Promise<{ status: string; errors: string[] }>;
  loadRepoCi: (repoId: number) => Promise<unknown>;
  setToast: (toast: { text: string; kind: 'ok' | 'fail' | 'info' }) => void;
}

export function useLinkedRepoBranchOps({
  repoId,
  repoName,
  iterationId,
  placeholderIteration,
  identifier,
  developerBranch,
  operationBaseBranch,
  templateSourceBranch,
  hasValidRule,
  refreshSignal,
  onRetryBaseline,
  divergence,
  loadTrace,
  loadRepoCi,
  setToast,
}: UseLinkedRepoBranchOpsParams) {
  const [developerBranchState, setDeveloperBranchState] =
    useState<IterationBaselineCheck['state']>('loading');
  const [defaultBaseState, setDefaultBaseState] =
    useState<IterationBaselineCheck['state']>('loading');
  const [baselineCreating, setBaselineCreating] = useState(false);
  const [branchCreating, setBranchCreating] = useState(false);
  const [cardRefreshing, setCardRefreshing] = useState(false);
  const [traceRefreshState, setTraceRefreshState] = useState<RepoTraceState | null>(null);

  useEffect(() => {
    let active = true;
    if (!developerBranch) {
      setDeveloperBranchState('missing');
      return () => {
        active = false;
      };
    }
    setDeveloperBranchState('loading');
    void findRemoteBranch(repoId, developerBranch)
      .then((branch) => {
        if (active) setDeveloperBranchState(branch ? 'exists' : 'missing');
      })
      .catch(() => {
        if (active) setDeveloperBranchState('error');
      });
    return () => {
      active = false;
    };
  }, [repoId, developerBranch, refreshSignal]);

  useEffect(() => {
    let active = true;
    if (iterationId) {
      setDefaultBaseState('missing');
      return () => {
        active = false;
      };
    }
    setDefaultBaseState('loading');
    void findRemoteBranch(repoId, 'master')
      .then((branch) => {
        if (active) setDefaultBaseState(branch ? 'exists' : 'missing');
      })
      .catch(() => {
        if (active) setDefaultBaseState('error');
      });
    return () => {
      active = false;
    };
  }, [repoId, iterationId, refreshSignal]);

  useEffect(() => {
    if (refreshSignal && refreshSignal > 0) {
      divergence.refetch();
      setTraceRefreshState(null);
    }
  }, [refreshSignal]);

  const refreshAfterBranchWrite = async (successText: string) => {
    onRetryBaseline();
    divergence.refetch();
    try {
      const result = await loadTrace();
      if (result.status === 'success') {
        setTraceRefreshState('ready');
        setToast({ text: successText, kind: 'ok' });
      } else {
        setTraceRefreshState('error');
        const suffix = result.errors.length ? '：' + result.errors.join('；') : '';
        setToast({ text: successText + '，但追溯数据刷新不完整' + suffix, kind: 'info' });
      }
    } catch (error) {
      setTraceRefreshState('error');
      setToast({
        text: successText + '，但追溯数据刷新失败：' + humanizeError(error),
        kind: 'info',
      });
    }
  };

  const createIterationBaseline = async () => {
    if (baselineCreating) return;
    setBaselineCreating(true);
    try {
      if (!iterationId) throw new Error('当前工作项未关联有效迭代');
      if (placeholderIteration) throw new Error('占位迭代不支持创建云效分支');
      if (!hasValidRule) throw new Error('请先配置有效的分支规则');

      const result = await ensureIterationBaseline({
        repoId,
        targetBranch: operationBaseBranch,
        sourceBranch: templateSourceBranch,
        findBranch: findRemoteBranch,
        createBranch: api.createBranch,
      });
      await refreshAfterBranchWrite(
        result.created
          ? '迭代基准分支已创建：' + result.branchName
          : '迭代基准分支已存在：' + result.branchName,
      );
    } catch (error) {
      errorLog('iteration-baseline-create', error);
      setToast({ text: humanizeError(error), kind: 'fail' });
    } finally {
      setBaselineCreating(false);
    }
  };

  const createDeveloperBranch = async () => {
    if (branchCreating) return;
    setBranchCreating(true);
    try {
      if (!identifier || !developerBranch || !operationBaseBranch) {
        throw new Error('需求分支参数不完整');
      }
      if (placeholderIteration) throw new Error('占位迭代不支持创建云效分支');
      if (iterationId && !hasValidRule) throw new Error('请先配置有效的分支规则');
      if (developerBranch === operationBaseBranch) {
        throw new Error('需求分支不能与迭代基准分支同名');
      }

      if (iterationId) {
        const baseline = await ensureIterationBaseline({
          repoId,
          targetBranch: operationBaseBranch,
          sourceBranch: templateSourceBranch,
          findBranch: findRemoteBranch,
          createBranch: api.createBranch,
        });
        if (baseline.created) onRetryBaseline();
      } else if (!(await findRemoteBranch(repoId, operationBaseBranch))) {
        throw new Error('来源分支「' + operationBaseBranch + '」在线上不存在');
      }

      const existing = await findRemoteBranch(repoId, developerBranch);
      if (existing) {
        setDeveloperBranchState('exists');
        await refreshAfterBranchWrite('需求分支已存在，不会重复创建：' + developerBranch);
        return;
      }

      if (!(await findRemoteBranch(repoId, operationBaseBranch))) {
        throw new Error('来源分支「' + operationBaseBranch + '」在线上不存在');
      }
      await api.createBranch(repoId, developerBranch, operationBaseBranch);
      const created = await findRemoteBranch(repoId, developerBranch);
      if (!created) throw new Error('需求分支创建后未能查询到：' + developerBranch);

      setDeveloperBranchState('exists');
      await refreshAfterBranchWrite('需求分支已创建：' + developerBranch);
    } catch (error) {
      errorLog('workitem-branch-create', error);
      setToast({ text: humanizeError(error), kind: 'fail' });
    } finally {
      setBranchCreating(false);
    }
  };

  const handleRefreshSingleRepo = async () => {
    if (cardRefreshing) return;
    setCardRefreshing(true);
    setTraceRefreshState('loading');
    const errors: string[] = [];

    try {
      if (developerBranch) {
        setDeveloperBranchState('loading');
        try {
          const branch = await findRemoteBranch(repoId, developerBranch);
          setDeveloperBranchState(branch ? 'exists' : 'missing');
        } catch (error) {
          setDeveloperBranchState('error');
          errors.push('需求分支查询失败：' + humanizeError(error));
        }
      }
      if (!iterationId) {
        setDefaultBaseState('loading');
        try {
          const base = await findRemoteBranch(repoId, 'master');
          setDefaultBaseState(base ? 'exists' : 'missing');
        } catch (error) {
          setDefaultBaseState('error');
          errors.push('master 查询失败：' + humanizeError(error));
        }
      }

      onRetryBaseline();
      divergence.refetch();
      const traceResult = await loadTrace();
      if (traceResult.status !== 'success') {
        errors.push(
          '追溯数据未完整刷新' +
            (traceResult.errors.length ? '：' + traceResult.errors.join('；') : ''),
        );
      }
      await loadRepoCi(repoId);
    } catch (error) {
      errors.push(humanizeError(error));
    } finally {
      setCardRefreshing(false);
    }

    if (errors.length) {
      setTraceRefreshState('error');
      errorLog('repo-card-refresh', errors.join('；'));
      setToast({ text: '刷新「' + repoName + '」失败：' + errors.join('；'), kind: 'fail' });
      return;
    }

    setTraceRefreshState('ready');
    setToast({ text: '已刷新「' + repoName + '」的分支、MR 与 CI 数据', kind: 'ok' });
  };

  return {
    developerBranchState,
    defaultBaseState,
    traceRefreshState,
    baselineCreating,
    branchCreating,
    cardRefreshing,
    createIterationBaseline,
    createDeveloperBranch,
    handleRefreshSingleRepo,
  };
}
