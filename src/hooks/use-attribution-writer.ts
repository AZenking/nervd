// 变更归属 → 云效动态回写。
//
// 设计要点（docs/change-attribution.md §4）：
// - 只有 allowWriteOps=true 才发起任何请求；否则候选保持 pending。
// - 每 30s 或收到 `attribution-updated` 时拉取候选；commit 按 10 分钟窗口聚合，
//   MR / 构建终态即时回写；需求级只在里程碑 / daily 聚合时回写。
// - 评论内嵌 `<!-- nervd:evt:<eventId> -->`，配合后端 activity_posts 唯一键保证幂等。
// - 失败按 1m / 5m / 15m 退避，最多 3 次；成功 / 跳过都记账。
import { useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import * as attributionApi from '@/lib/attribution-api';
import { isTauriRuntime } from '@/lib/attribution-api';
import { createWorkitemComment } from '@/lib/api';
import { markdownToHtml, sanitizeForYunxiao } from '@/lib/richtext';
import { useApp } from '@/store/app';
import { errorLog } from '@/lib/error-format';
import {
  describeAttributionError,
  groupCandidates,
  isTerminalBuildEvent,
  isTerminalMrEvent,
  localDateKey,
  renderGroupMarkdown,
  shouldPostParentEvent,
  isRequirementIdentifier,
  type CandidateGroup,
} from '@/lib/attribution-format';
import type { ActivityCandidate, ActivityPolicy } from '@/types/attribution';

const WRITER_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];

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

let running = false;
let lastToastText = '';
let lastToastAt = 0;

/** 仅供测试：清空模块内的幂等 / 退避 / 日上限记账。 */
export function resetActivityWriterState(): void {
  postedEventIds.clear();
  retryState.clear();
  dailyCounters.clear();
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
  reason?: 'write-disabled' | 'policy-disabled' | 'no-candidates' | 'error';
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

async function markSkipped(group: CandidateGroup, reason: string): Promise<void> {
  for (const eventId of group.eventIds) {
    postedEventIds.add(eventId);
    try {
      await attributionApi.markActivity({
        eventId,
        workitemId: group.workitemId,
        status: 'skipped',
        error: reason,
      });
    } catch (error) {
      errorLog('attribution.writer.markSkipped', error);
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

async function postGroup(
  group: CandidateGroup,
  policy: ActivityPolicy,
  now: number,
  options: ActivityWriterOptions,
): Promise<'posted' | 'failed'> {
  const body = renderGroupMarkdown(group, { perEvent: policy.childMode === 'per_event' });
  // marker 必须在 Markdown 转换之后拼接：`commit:` 会被 richtext 的等宽高亮规则拆成
  // `<strong>commit:</strong>`，导致幂等标记损坏。
  const markers = group.eventIds.map((eventId) => `<!-- nervd:evt:${eventId} -->`);
  const html = `${markdownToHtml(sanitizeForYunxiao(body))}\n${markers.join('\n')}`;

  try {
    const comment = await createWorkitemComment(group.workitemId, html, 'RICHTEXT');
    const commentId = extractCommentId(comment);
    // 评论已发出即视为成功：即使记账失败也不能在本次会话内重复发评论。
    for (const eventId of group.eventIds) postedEventIds.add(eventId);
    recordPost(group.workitemId, localDateKey(now));
    for (const eventId of group.eventIds) {
      retryState.delete(eventId);
      try {
        await attributionApi.markActivity({
          eventId,
          workitemId: group.workitemId,
          status: 'posted',
          commentId,
        });
      } catch (error) {
        errorLog('attribution.writer.markPosted', error);
      }
    }
    return 'posted';
  } catch (error) {
    const message = describeAttributionError(error, '评论发布失败，请稍后重试');
    for (const eventId of group.eventIds) {
      const attempts = (retryState.get(eventId)?.attempts ?? 0) + 1;
      retryState.set(eventId, {
        attempts,
        nextRetryAt: now + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)],
      });
      try {
        await attributionApi.markActivity({
          eventId,
          workitemId: group.workitemId,
          status: 'failed',
          error: message,
        });
      } catch (markError) {
        errorLog('attribution.writer.markFailed', markError);
      }
    }
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
  const allowWriteOps =
    options.allowWriteOps ?? useApp.getState().settings?.allowWriteOps ?? false;
  if (!allowWriteOps) {
    return { posted: 0, skipped: 0, failed: 0, pending: 0, reason: 'write-disabled' };
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
      candidates = await attributionApi.listActivityCandidates({ limit: 100 });
    } catch (error) {
      notifyFailure(
        `回写候选读取失败：${describeAttributionError(error, '请稍后重试')}`,
        options,
      );
      return { posted: 0, skipped: 0, failed: 0, pending: 0, reason: 'error' };
    }

    const fresh = candidates.filter((candidate) => !postedEventIds.has(candidate.eventId));
    const date = localDateKey(now);
    const policyFiltered = filterByPolicy(fresh, policy);
    // daily 是「次日汇总」：当天需求事件先留在 pending，等本地日期翻篇后
    // 按 (workitem, 日期) 各组一条，避免每 30s 给同一天补发多条汇总。
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

    const groups = groupCandidates(allowed, { parentDaily: policy.parentMode === 'daily' });
    let posted = 0;
    let skipped = 0;
    let failed = 0;
    let pending = 0;

    for (const group of groups) {
      if (group.eventIds.some((eventId) => retryBlocked(eventId, now))) {
        pending += 1;
        continue;
      }
      if (countForToday(group.workitemId, date) >= policy.maxPerDay) {
        await markSkipped(group, '超出每日回写上限');
        skipped += 1;
        continue;
      }

      const outcome = await postGroup(group, policy, now, options);
      if (outcome === 'posted') posted += 1;
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