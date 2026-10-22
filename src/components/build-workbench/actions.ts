import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useUi, type BuildWorkbenchPage, type BuildWorkbenchTarget } from '@/store/ui';
import { errorLog, humanizeError } from '@/lib/error-format';

let lastBuildWorkbenchTrigger: HTMLElement | null = null;

function rememberTrigger() {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  lastBuildWorkbenchTrigger = active instanceof HTMLElement ? active : null;
}

/** 工作台关闭后由调用方恢复来源按钮焦点。 */
export function restoreBuildWorkbenchFocus() {
  const trigger = lastBuildWorkbenchTrigger;
  lastBuildWorkbenchTrigger = null;
  if (!trigger || !trigger.isConnected) return;
  window.requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
}

/** 外部入口统一打开构建工作台，并使旧日志请求失效。 */
export function openBuildWorkbenchFromTrigger(
  target: BuildWorkbenchTarget,
  page: BuildWorkbenchPage = 'runs',
) {
  rememberTrigger();
  useApp.getState().closeLogs();
  useUi.getState().openBuildWorkbench(target, page);
}

function sameWorkbenchTarget(target: BuildWorkbenchTarget, current: BuildWorkbenchTarget | null): boolean {
  if (!current || current.kind !== target.kind) return false;
  if (target.kind === 'repo' && current.kind === 'repo') return current.repoId === target.repoId;
  if (target.kind === 'pipeline' && current.kind === 'pipeline') return current.pipelineId === target.pipelineId;
  return false;
}

function navigateToWorkbenchLogs(target: BuildWorkbenchTarget, internal: boolean) {
  const ui = useUi.getState();
  if (internal && ui.buildWorkbenchOpen && sameWorkbenchTarget(target, ui.buildWorkbenchTarget)) {
    ui.navigateBuildWorkbench('logs');
    return;
  }
  openBuildWorkbenchFromTrigger(target, 'logs');
}

/** 从仓库运行记录或任意仓库入口进入统一日志页。 */
export function openRepoBuildLogs(
  repoId: number,
  runId: string,
  title: string,
  options?: { internal?: boolean },
) {
  const target: BuildWorkbenchTarget = { kind: 'repo', repoId, title, runId };
  navigateToWorkbenchLogs(target, options?.internal === true);
  void useApp.getState().openRepoCiLogs(repoId, runId, title);
}

function firstPipelineJobId(detail: unknown): number {
  const record = (detail && typeof detail === 'object' ? detail : {}) as Record<string, unknown>;
  const pipelineRun = record.pipelineRun && typeof record.pipelineRun === 'object'
    ? record.pipelineRun as Record<string, unknown>
    : undefined;
  const jobsValue = pipelineRun?.jobs ?? record.jobs;
  const jobsRecord = jobsValue && typeof jobsValue === 'object' && !Array.isArray(jobsValue)
    ? jobsValue as Record<string, unknown>
    : undefined;
  const list = jobsRecord?.Job ?? jobsRecord?.job ?? jobsValue;
  const first = Array.isArray(list) ? list[0] : list;
  if (!first || typeof first !== 'object') return 0;
  const job = first as Record<string, unknown>;
  return Number(job.jobId ?? job.id ?? 0);
}

/** 读取流水线运行详情后进入统一日志页，避免没有 jobId 时误关联日志。 */
export async function openPipelineRunLogs(
  pipelineId: number,
  pipelineRunId: number,
  pipelineName: string,
  options?: { internal?: boolean; jobId?: number },
) {
  try {
    const jobId = options?.jobId || firstPipelineJobId(await api.getPipelineRun(pipelineId, pipelineRunId));
    if (!jobId) throw new Error('未在运行详情中找到 job，无法取日志');
    const title = `${pipelineName} #${pipelineRunId}`;
    const target: BuildWorkbenchTarget = { kind: 'pipeline', pipelineId, jobId, title, runId: pipelineRunId };
    navigateToWorkbenchLogs(target, options?.internal === true);
    await useApp.getState().openLogs(pipelineId, pipelineRunId, jobId, title);
  } catch (error) {
    errorLog('pipeline.openLogs', error);
    useApp.getState().setToast({
      text: `日志查询失败：${humanizeError(error, '未能读取该运行的日志，请稍后重试')}`,
      kind: 'fail',
    });
  }
}
