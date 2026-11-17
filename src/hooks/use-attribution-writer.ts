// 变更归属 → 云效动态回写（滚动评论模式）。
//
// 行为约定（docs/change-attribution.md §4）：
// - 每个工作项只维护「一条」nervd 评论：首次创建，之后在原评论上更新（不新增）；
// - 只有出现新的回写候选（或内容确实变化）时才编辑评论；没有变更新时不发任何请求、不产生动态；
// - 评论正文由最近变更重新生成（最多 20 条），内容指纹不变则跳过；
// - 需求 milestone 模式只把里程碑事件渲染进评论；daily 模式只汇总「已翻篇」的日期；
// - 失败按 1m / 5m / 15m 退避，最多 3 次；成功 / 跳过都记账。
import { useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import * as attributionApi from '@/lib/attribution-api';
import { isTauriRuntime } from '@/lib/attribution-api';
import { createWorkitemComment, listWorkitemComments } from '@/lib/api';
import { markdownToHtml, sanitizeForYunxiao } from '@/lib/richtext';
import { useApp } from '@/store/app';
import { errorLog } from '@/lib/error-format';
import {
  describeAttributionError,
  isTerminalBuildEvent,
  isTerminalMrEvent,
  localDateKey,
  shouldPostParentEvent,
  isRequirementIdentifier,
} from '@/lib/attribution-format';
import {
  buildWorkitemSummaryMarkdown,
  findSummaryCommentId,
  summaryContentHash,
  SUMMARY_MARKER,
} from '@/lib/activity-summary';
import { isWritebackPaused } from '@/lib/writeback-pause';
import type {
  ActivityCandidate,
  ActivityPolicy,
  WorkitemChange,
} from '@/types/attribution';

const WRITER_INTERVAL_MS = 30_000;
/**
 * 回写范围锁定：只处理代码记录（提交 / MR / 构建）。
 * 工作项状态流转不进动态——状态由云效原生工作项状态与子任务自身历史承载，
 * 父需求动态只做里程碑/每日代码汇总。
 */
const WRITE_KINDS = new Set<ActivityCandidate['event']['kind']>(['commit', 'mr', 'build']);
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];
/** 单次拉取时间线的条数（用于生成滚动评论正文）。 */
const SUMMARY_TIMELINE_LIMIT = 50;

interface RetryEntry {
  attempts: number;
  nextRetryAt: number;
}

interface DailyCounter {
  date: string;
  count: number;
}

const postedEventIds = new Set<string>();
const retryState = new Map<string, RetryEntry>();
const dailyCounters = new Map<string, DailyCounter>();
/** 每个工作项最近一次渲染的评论指纹：内容未变化时不重复编辑。 */
const summaryHashes = new Map<string, string>();
/**
 * 当前组织的 PAT 是否支持「编辑工作项评论」。
 * 云效公开 API 中 UpdateWorkitemComment 仅旧 ROA（AK 鉴权），PAT 的 oapi/v1 代理无更新端点；
 * 探测到 404 / AccessKeyId 必填后不再重试更新，降级为「每次聚合后新增一条摘要评论」。
 */
let summaryUpdateUnsupported = false;

let running = false;
let lastToastText = '';
let lastToastAt = 0;

/** 仅供测试：清空模块内的幂等 / 退避 / 日上限记账。 */
export function resetActivityWriterState(): void {
  postedEventIds.clear();
  retryState.clear();
  dailyCounters.clear();
  summaryHashes.clear();
  summaryUpdateUnsupported = false;
  running = false;
  lastToastText = '';
  lastToastAt = 0;
}

export interface ActivityWriterOptions {
  /** 固定“当前时间”，便于测试日上限与退避。 */
  now?: number;
  /** 覆盖 allowWriteOps（测试用）；缺省读 useApp.settings.allowWriteOps。 */
  allowWriteOps?: boolean;
  /** 后台轮询：失败不弹 toast。 */
  silent?: boolean;
}

export interface ActivityWriterResult {
  posted: number;
  skipped: number;
  failed: number;
  pending: number;
  reason?: 'paused' | 'write-disabled' | 'no-viewer' | 'policy-disabled' | 'no-candidates' | 'error';
}

/**
 * 解析「我」的身份：写回只处理负责人是我的工作项。
 * - id/name 来自 `GET /oapi/v1/platform/user`；
 * - aliases 取设置里的自定义花名（`workitemHighlight.customName`），仅在姓名匹配时生效；
 * - 拿不到身份时返回 null，调用方必须 fail-closed（不请求候选）。
 */
function resolveViewer(): attributionApi.ActivityViewer | null {
  const state = useApp.getState();
  const id = state.currentUser?.id?.trim();
  const name = state.currentUser?.name?.trim();
  if (!id && !name) return null;
  const alias = state.workitemHighlight?.customName?.trim();
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(alias ? { aliases: [alias] } : {}),
  };
}

function notifyFailure(text: string, options: ActivityWriterOptions): void {
  errorLog('attribution.writer', text);
  if (options.silent) return;
  const now = options.now ?? Date.now();
  // 后台每 30s 可能重复失败：同一文案 5 分钟内只提醒一次，避免 toast 刷屏。
  if (text === lastToastText && now - lastToastAt < 5 * 60_000) return;
  lastToastText = text;
  lastToastAt = now;
  useApp.getState().setToast({ kind: 'fail', text });
}

function extractCommentId(result: unknown): string | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  const record = result as Record<string, unknown>;
  const raw = record.id ?? record.commentId ?? record.comment_id;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return undefined;
}

function retryBlocked(eventId: string, now: number): boolean {
  const entry = retryState.get(eventId);
  if (!entry) return false;
  if (entry.attempts >= MAX_ATTEMPTS) return true;
  return entry.nextRetryAt > now;
}

function countForToday(workitemId: string, date: string): number {
  const counter = dailyCounters.get(workitemId);
  return counter?.date === date ? counter.count : 0;
}

function recordPost(workitemId: string, date: string): void {
  const counter = dailyCounters.get(workitemId);
  if (counter?.date === date) {
    counter.count += 1;
  } else {
    dailyCounters.set(workitemId, { date, count: 1 });
  }
}

async function markEvents(
  candidates: ActivityCandidate[],
  workitemId: string,
  input: { status: 'skipped' | 'failed'; error: string; commentId?: string },
): Promise<void> {
  for (const candidate of candidates) {
    if (input.status === 'skipped') postedEventIds.add(candidate.eventId);
    try {
      await attributionApi.markActivity({
        eventId: candidate.eventId,
        workitemId,
        status: input.status,
        ...(input.commentId ? { commentId: input.commentId } : {}),
        error: input.error,
      });
    } catch (error) {
      errorLog('attribution.writer.markActivity', error);
    }
  }
}

function filterByPolicy(
  candidates: ActivityCandidate[],
  policy: ActivityPolicy,
): ActivityCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.relation === 'rollup' || isRequirementIdentifier(candidate.identifier)) {
      if (policy.parentMode === 'off') return false;
      if (policy.parentMode === 'milestone') {
        return shouldPostParentEvent(candidate.event, 'milestone');
      }
      return true;
    }
    if (policy.childMode === 'off') return false;
    // 提交按窗口批量延迟；MR / 构建只有终态才立即回写，避免运行中刷屏。
    if (candidate.event.kind === 'mr') return isTerminalMrEvent(candidate.event);
    if (candidate.event.kind === 'build') return isTerminalBuildEvent(candidate.event);
    return true;
  });
}

function fallbackChanges(candidates: ActivityCandidate[]): WorkitemChange[] {
  return candidates.map((candidate) => ({
    ...candidate.event,
    relation: candidate.relation,
    confidence: 'explicit',
    identifier: candidate.identifier,
    workitemId: candidate.workitemId,
  })) as WorkitemChange[];
}

/**
 * 为一个工作项创建或更新「滚动评论」。
 *
 * - 候选事件只是「触发器」：正文由该工作项最近变更重新生成；
 * - 已有带 `SUMMARY_MARKER` 的评论 → 原地编辑；没有则创建一次；
 * - 更新失败不降级为「新增评论」，避免用户看到重复动态。
 */
async function syncWorkitemSummary(input: {
  workitemId: string;
  identifier: string;
  candidates: ActivityCandidate[];
  policy: ActivityPolicy;
  now: number;
  options: ActivityWriterOptions;
}): Promise<'posted' | 'skipped' | 'failed'> {
  const { workitemId, identifier, candidates, policy, now, options } = input;
  const date = localDateKey(now);
  const isParent = candidates.some(
    (candidate) =>
      candidate.relation === 'rollup' || isRequirementIdentifier(candidate.identifier),
  );
  const parentMilestoneOnly = isParent && policy.parentMode === 'milestone';
  const beforeDate = isParent && policy.parentMode === 'daily' ? date : undefined;

  let changes: WorkitemChange[];
  try {
    const page = await attributionApi.listWorkitemChanges({
      workitemId,
      limit: SUMMARY_TIMELINE_LIMIT,
      includeRollup: isParent,
    });
    changes = page.items;
  } catch (error) {
    const message = describeAttributionError(error, '读取变更时间线失败');
    await markEvents(candidates, workitemId, { status: 'failed', error: message });
    notifyFailure(`动态回写失败：${message}`, { ...options, now });
    return 'failed';
  }
  if (!changes.length) changes = fallbackChanges(candidates);

  const repoPathById = Object.fromEntries(
    (useApp.getState().repositories ?? [])
      .filter((repo) => Boolean(repo.pathWithNamespace || repo.name))
      .map((repo) => [repo.id, repo.pathWithNamespace || repo.name]),
  );
  const markdown = buildWorkitemSummaryMarkdown({
    identifier,
    changes,
    now,
    options: { parentMilestoneOnly, beforeDate, repoPathById },
  });
  if (!markdown) {
    // 触发事件全部不在可见范围（例如非里程碑、未翻篇的 daily）：不产生动态。
    await markEvents(candidates, workitemId, { status: 'skipped', error: '无可见变更' });
    return 'skipped';
  }

  const hash = summaryContentHash(markdown);
  if (summaryHashes.get(workitemId) === hash) {
    await markEvents(candidates, workitemId, { status: 'skipped', error: '内容未变化' });
    return 'skipped';
  }

  const html = `${markdownToHtml(sanitizeForYunxiao(markdown))}\n${SUMMARY_MARKER}`;
  try {
    let commentId: string | undefined;
    if (!summaryUpdateUnsupported) {
      try {
        const comments = await listWorkitemComments(workitemId);
        commentId = findSummaryCommentId(comments);
      } catch {
        // 评论列表读取失败按「尚未创建」处理，后续仍可创建一条汇总评论。
        commentId = undefined;
      }
    }

    if (commentId && !summaryUpdateUnsupported) {
      try {
        await attributionApi.updateWorkitemComment({
          workitemId,
          commentId,
          content: html,
          formatType: 'RICHTEXT',
        });
      } catch (error) {
        const message = describeAttributionError(error, '评论更新失败');
        if (/404|not[\s_-]?found|AccessKeyId|not supported|method not allowed/i.test(message)) {
          // 当前组织不支持 PAT 编辑评论：后续降级为「每轮聚合后新增摘要」，避免一直回写失败。
          summaryUpdateUnsupported = true;
          errorLog(
            'attribution.writer.updateUnsupported',
            `当前组织不支持编辑工作项评论，已降级为新增摘要：${message}`,
          );
          const created = await createWorkitemComment(workitemId, html, 'RICHTEXT');
          commentId = extractCommentId(created);
        } else if (/不存在|无效.*评论/i.test(message)) {
          const created = await createWorkitemComment(workitemId, html, 'RICHTEXT');
          commentId = extractCommentId(created);
        } else {
          throw error;
        }
      }
    } else {
      const created = await createWorkitemComment(workitemId, html, 'RICHTEXT');
      commentId = extractCommentId(created);
    }

    summaryHashes.set(workitemId, hash);
    recordPost(workitemId, date);
    for (const candidate of candidates) {
      postedEventIds.add(candidate.eventId);
      retryState.delete(candidate.eventId);
      try {
        await attributionApi.markActivity({
          eventId: candidate.eventId,
          workitemId,
          status: 'posted',
          ...(commentId ? { commentId } : {}),
        });
      } catch (error) {
        errorLog('attribution.writer.markPosted', error);
      }
    }
    return 'posted';
  } catch (error) {
    const message = describeAttributionError(error, '评论更新失败，请稍后重试');
    for (const candidate of candidates) {
      const attempts = (retryState.get(candidate.eventId)?.attempts ?? 0) + 1;
      retryState.set(candidate.eventId, {
        attempts,
        nextRetryAt:
          now + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)],
      });
    }
    await markEvents(candidates, workitemId, { status: 'failed', error: message });
    notifyFailure(`动态回写失败：${message}`, { ...options, now });
    return 'failed';
  }
}

/**
 * 执行一轮候选回写。可被 hook 定时调用，也可在测试中直接调用。
 */
export async function writeActivityCandidates(
  options: ActivityWriterOptions = {},
): Promise<ActivityWriterResult> {
  const now = options.now ?? Date.now();
  // 本地暂停开关优先于一切：暂停期间不读取策略、不拉候选、不发任何评论请求。
  if (isWritebackPaused()) {
    return { posted: 0, skipped: 0, failed: 0, pending: 0, reason: 'paused' };
  }
  const allowWriteOps =
    options.allowWriteOps ?? useApp.getState().settings?.allowWriteOps ?? false;
  if (!allowWriteOps) {
    return { posted: 0, skipped: 0, failed: 0, pending: 0, reason: 'write-disabled' };
  }
  // 写回范围只处理「我的」工作项：没有身份时不拉候选，避免默认写到全组织。
  const viewer = resolveViewer();
  if (!viewer) {
    return { posted: 0, skipped: 0, failed: 0, pending: 0, reason: 'no-viewer' };
  }
  if (running) {
    return { posted: 0, skipped: 0, failed: 0, pending: 0 };
  }

  running = true;
  try {
    let policy: ActivityPolicy;
    try {
      policy = await attributionApi.getActivityPolicy();
    } catch (error) {
      notifyFailure(
        `回写策略读取失败：${describeAttributionError(error, '请稍后重试')}`,
        options,
      );
      return { posted: 0, skipped: 0, failed: 0, pending: 0, reason: 'error' };
    }
    if (!policy.enabled) {
      return { posted: 0, skipped: 0, failed: 0, pending: 0, reason: 'policy-disabled' };
    }

    let candidates: ActivityCandidate[];
    try {
      candidates = await attributionApi.listActivityCandidates({ limit: 100, viewer });
    } catch (error) {
      notifyFailure(
        `回写候选读取失败：${describeAttributionError(error, '请稍后重试')}`,
        options,
      );
      return { posted: 0, skipped: 0, failed: 0, pending: 0, reason: 'error' };
    }

    const fresh = candidates.filter(
      (candidate) =>
        !postedEventIds.has(candidate.eventId)
        && WRITE_KINDS.has(candidate.event.kind),
    );
    const date = localDateKey(now);
    const policyFiltered = filterByPolicy(fresh, policy);
    // daily 是「次日汇总」：当天需求事件先留在 pending，等本地日期翻篇后
    // 按 (workitem, 日期) 汇总进滚动评论，避免每 30s 给同一天补发。
    const allowed =
      policy.parentMode === 'daily'
        ? policyFiltered.filter(
            (candidate) =>
              candidate.relation !== 'rollup' || localDateKey(candidate.event.occurredAt) < date,
          )
        : policyFiltered;
    if (!allowed.length) {
      return { posted: 0, skipped: 0, failed: 0, pending: 0, reason: 'no-candidates' };
    }

    // 按工作项聚合：每个工作项只维护一条评论，一次周期最多编辑一次。
    const byWorkitem = new Map<string, ActivityCandidate[]>();
    for (const candidate of allowed) {
      const list = byWorkitem.get(candidate.workitemId) ?? [];
      list.push(candidate);
      byWorkitem.set(candidate.workitemId, list);
    }

    let posted = 0;
    let skipped = 0;
    let failed = 0;
    let pending = 0;

    for (const [workitemId, list] of byWorkitem) {
      const identifier = list[0]?.identifier ?? '';
      // 全部候选都在退避窗口内：本轮不触达云效，等下一轮。
      if (list.every((candidate) => retryBlocked(candidate.eventId, now))) {
        pending += 1;
        continue;
      }
      if (countForToday(workitemId, date) >= policy.maxPerDay) {
        await markEvents(list, workitemId, { status: 'skipped', error: '超出每日回写上限' });
        skipped += 1;
        continue;
      }
      const outcome = await syncWorkitemSummary({
        workitemId,
        identifier,
        candidates: list,
        policy,
        now,
        options,
      });
      if (outcome === 'posted') posted += 1;
      else if (outcome === 'skipped') skipped += 1;
      else failed += 1;
    }

    return { posted, skipped, failed, pending };
  } finally {
    running = false;
  }
}

/**
 * 挂载后每 30s 回写一次；收到 `attribution-updated` 立即触发一轮。
 * 非 Tauri 宿主直接跳过（Web 预览无 invoke）。
 */
export function useAttributionWriter(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    const run = () => {
      if (disposed) return;
      void writeActivityCandidates();
    };

    const timer = setInterval(run, WRITER_INTERVAL_MS);
    let unlisten: UnlistenFn | null = null;
    void listen('attribution-updated', run)
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error) => errorLog('attribution.writer.listen', error));

    return () => {
      disposed = true;
      clearInterval(timer);
      unlisten?.();
    };
  }, []);
}