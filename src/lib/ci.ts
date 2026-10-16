import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import type { CiRunSummary, RepoCiBinding } from '@/types';

/**
 * CI 领域共享逻辑：提供方文案、状态兜底、Jenkins 参数推断、触发反馈链路。
 * 迭代仓库表 / CI 详情抽屉 / 需求详情仓库表 / 总览 CI 卡共用同一口径。
 */

/** 提供方展示名（未绑定为「未绑定 CI」） */
export function ciProviderLabel(binding?: RepoCiBinding | null): string {
  return binding?.provider === 'flow'
    ? '云效 Flow'
    : binding?.provider === 'jenkins'
      ? 'Jenkins'
      : '未绑定 CI';
}

/** CI 状态展示值：快照缺失时按「加载中 / 查询失败 / —」兜底（全工程统一口径，含查询失败分支） */
export function ciStatusText(
  status: string | null | undefined,
  entry?: { loading?: boolean; error?: string | null } | null,
): string {
  return status ?? (entry?.loading ? '加载中' : entry?.error ? '查询失败' : '—');
}

/** Jenkins 参数名推断：分支类（branch/branchname/gitref/scmref 等） */
export function isBranchParameterName(name: string): boolean {
  return /(^|[_-])(git)?branch([_-]|$)/i.test(name) || /branchname|gitref|scmref/i.test(name);
}

/** Jenkins 参数名推断：环境类（env/environment/deployenv/targetenv 等） */
export function isEnvironmentParameterName(name: string): boolean {
  return /(^|[_-])(env|environment|deployenv|targetenv)([_-]|$)/i.test(name) || /environment/i.test(name);
}

/** 从构建记录取分支/环境参数值：优先绑定参数名的实际值，缺失时按参数名推断，无记录显示「未记录」 */
export function buildRunParameter(
  run: CiRunSummary | undefined,
  selectedName: string | undefined,
  kind: 'branch' | 'environment',
): string {
  const parameters = run?.parameters ?? {};
  const matcher = kind === 'branch' ? isBranchParameterName : isEnvironmentParameterName;
  const oppositeMatcher = kind === 'branch' ? isEnvironmentParameterName : isBranchParameterName;
  const isValidSelected = selectedName && !oppositeMatcher(selectedName);
  const selectedValue = isValidSelected ? parameters[selectedName] : undefined;
  if (selectedValue?.trim()) return selectedValue;
  const inferred = Object.entries(parameters).find(([name]) => matcher(name))?.[1];
  return inferred?.trim() || '未记录';
}

/**
 * 触发仓库 CI 的统一反馈链路：触发 → 成功 toast →（可选延迟）刷新快照；失败 toast。
 * Flow 触发（迭代页 / CI 详情抽屉）默认立即刷新、文案「流水线」；
 * 总览 CI 卡传入 CI Job 文案与 1200ms 延迟，保持各自原口径。
 */
export async function triggerRepoCiWithFeedback(
  repoId: number,
  repoName: string,
  opts?: { okText?: string; failText?: string; refreshDelayMs?: number },
): Promise<void> {
  const { setToast, loadRepoCi, markRepoCiActive } = useApp.getState();
  try {
    await api.triggerRepoCi(repoId);
    setToast({ text: opts?.okText ?? `已触发 ${repoName} 的流水线`, kind: 'ok' });
    // 触发成功后将全局 CI 调度器拉入活跃态（高频轮询 90 秒，快速捕获运行状态）
    markRepoCiActive(90_000);
    if (opts?.refreshDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.refreshDelayMs));
    }
    await loadRepoCi(repoId);
  } catch (e) {
    setToast({ text: opts?.failText ?? `触发 ${repoName} 流水线失败：${String(e)}`, kind: 'fail' });
  }
}
