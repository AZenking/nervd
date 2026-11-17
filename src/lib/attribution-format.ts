// 变更归属纯函数：Markdown 摘要、候选分组与里程碑判定。
//
// 该模块不 import store / React / Tauri，便于 Vitest 直接覆盖；
// 时间线展示与回写共用同一份格式化口径，避免 UI 文案与评论正文漂移。
import type {
  ActivityCandidate,
  ActivityPolicy,
  AttributionRelation,
  BuildChangePayload,
  ChangeEvent,
  ChangeEventKind,
  CommitChangePayload,
  MrChangePayload,
} from '@/types/attribution';
import { humanizeError } from './error-format';

/** 提交批次聚合窗口：同一 (工作项, 仓库, 分支) 的 10 分钟窗口合并为一条评论。 */
export const COMMIT_BATCH_WINDOW_MS = 10 * 60_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function payloadRecord(event: ChangeEvent): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function numberOf(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function stringOf(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function toInt(v: unknown, fallback = 0): number {
  const n = numberOf(v);
  return n === undefined ? fallback : Math.trunc(n);
}

/** 本地日期键（YYYY-MM-DD），daily 回写按用户本地时区聚合。 */
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shortShaOf(sha: string, shortSha?: string): string {
  const trimmed = (shortSha || sha || '').trim();
  return trimmed.length > 7 && !shortSha ? trimmed.slice(0, 7) : trimmed;
}

const MR_STATE_LABELS: Record<string, string> = {
  open: '开启',
  opened: '开启',
  merged: '已合入',
  accepted: '已合入',
  closed: '已关闭',
  declined: '已拒绝',
  locked: '已锁定',
};

const BUILD_STATUS_LABELS: Record<string, string> = {
  success: '成功',
  succeeded: '成功',
  passed: '成功',
  failed: '失败',
  failure: '失败',
  fail: '失败',
  error: '失败',
  running: '运行中',
  building: '运行中',
  queued: '排队中',
  waiting: '等待中',
  canceled: '已取消',
  cancelled: '已取消',
  aborted: '已中止',
  skipped: '已跳过',
  unknown: '未知',
};

export function mrStateLabel(state: string): string {
  const key = (state || '').trim().toLowerCase();
  return MR_STATE_LABELS[key] ?? (state?.trim() || '未知状态');
}

export function buildStatusLabel(status: string): string {
  const key = (status || '').trim().toLowerCase();
  return BUILD_STATUS_LABELS[key] ?? (status?.trim() || '未知状态');
}

/** 事件 payload → 提交摘要（缺字段时回退 event 自身信息）。 */
export function commitOfEvent(event: ChangeEvent): CommitChangePayload {
  const p = payloadRecord(event);
  const sha = stringOf(p.sha) ?? event.externalId;
  return {
    sha,
    shortSha: stringOf(p.shortSha) ?? shortShaOf(sha),
    message: stringOf(p.message) ?? event.title,
    author: stringOf(p.author) ?? event.author,
    committedAt: numberOf(p.committedAt) ?? event.occurredAt,
    filesChanged: numberOf(p.filesChanged),
    additions: numberOf(p.additions),
    deletions: numberOf(p.deletions),
    files: Array.isArray(p.files) ? p.files.filter((f): f is string => typeof f === 'string') : undefined,
  };
}

/** 事件 payload → MR 摘要。 */
export function mrOfEvent(event: ChangeEvent): MrChangePayload {
  const p = payloadRecord(event);
  return {
    localId: toInt(p.localId, toInt(event.externalId)),
    state: stringOf(p.state) ?? 'unknown',
    sourceBranch: stringOf(p.sourceBranch) ?? event.branch ?? '',
    targetBranch: stringOf(p.targetBranch) ?? event.targetBranch ?? '',
    author: stringOf(p.author) ?? event.author,
    webUrl: stringOf(p.webUrl),
  };
}

/** 事件 payload → 构建摘要。 */
export function buildOfEvent(event: ChangeEvent): BuildChangePayload {
  const p = payloadRecord(event);
  return {
    runId: stringOf(p.runId) ?? event.externalId,
    provider: p.provider === 'jenkins' ? 'jenkins' : 'flow',
    status: stringOf(p.status) ?? 'unknown',
    durationMs: numberOf(p.durationMs),
    stage: stringOf(p.stage),
    webUrl: stringOf(p.webUrl),
  };
}

export interface CommitBatchMarkdownInput {
  identifier: string;
  branch?: string;
  commits: CommitChangePayload[];
}

/**
 * 子项提交批次摘要：
 *
 * ```
 * [nervd] 代码变更 · REQ-101
 * 分支：feature/req-101
 * 提交：2 个（7a3f8b1、9c2d4e6）
 * 变更：3 个文件，+42 / -7
 * ```
 */
export function buildCommitBatchMarkdown(input: CommitBatchMarkdownInput): string {
  const commits = input.commits ?? [];
  const shas = commits.map((c) => shortShaOf(c.sha, c.shortSha)).filter(Boolean);
  const listed = shas.length > 5 ? `${shas.slice(0, 5).join('、')}…` : shas.join('、');
  const totals = commits.reduce(
    (acc, c) => ({
      files: acc.files + (c.filesChanged ?? c.files?.length ?? 0),
      additions: acc.additions + (c.additions ?? 0),
      deletions: acc.deletions + (c.deletions ?? 0),
    }),
    { files: 0, additions: 0, deletions: 0 },
  );

  return [
    `[nervd] 代码变更 · ${input.identifier}`,
    `分支：${input.branch?.trim() || '未标记分支'}`,
    `提交：${commits.length} 个（${listed || '无'}）`,
    `变更：${totals.files} 个文件，+${totals.additions} / -${totals.deletions}`,
  ].join('\n');
}

export interface MrMarkdownInput extends MrChangePayload {
  identifier: string;
}

/** MR 摘要：`[nervd] 合并请求 · REQ-101 · !12 已合入 feature/a → master`。 */
export function buildMrMarkdown(input: MrMarkdownInput): string {
  return `[nervd] 合并请求 · ${input.identifier} · !${input.localId} ${mrStateLabel(input.state)} ${input.sourceBranch || '未标记分支'} → ${input.targetBranch || '未标记目标'}`;
}

export interface BuildMarkdownInput extends BuildChangePayload {
  identifier: string;
}

/** 构建摘要：`[nervd] 构建 · REQ-101 · #142 失败`。 */
export function buildBuildMarkdown(input: BuildMarkdownInput): string {
  return `[nervd] 构建 · ${input.identifier} · #${input.runId} ${buildStatusLabel(input.status)}`;
}

const MERGED_STATES = new Set(['merged', 'accepted', '已合入', '已合并']);
const CLOSED_STATES = new Set(['closed', 'declined', '已关闭', '已拒绝']);
const FAILED_BUILD_STATES = new Set([
  'failed',
  'failure',
  'error',
  'fail',
  '失败',
  '构建失败',
]);

const TERMINAL_MR_STATES = new Set([
  'merged',
  'accepted',
  'closed',
  'declined',
  '已合入',
  '已合并',
  '已关闭',
  '已拒绝',
]);

const TERMINAL_BUILD_STATUSES = new Set([
  'success',
  'succeeded',
  'passed',
  'failed',
  'failure',
  'error',
  'canceled',
  'cancelled',
  'aborted',
  'skipped',
  '成功',
  '失败',
  '已取消',
  '已中止',
  '已跳过',
]);

export function isMergedMr(event: ChangeEvent): boolean {
  if (event.kind !== 'mr') return false;
  return MERGED_STATES.has(mrOfEvent(event).state.trim().toLowerCase());
}

export function isFailedBuild(event: ChangeEvent): boolean {
  if (event.kind !== 'build') return false;
  return FAILED_BUILD_STATES.has(buildOfEvent(event).status.trim().toLowerCase());
}

/** MR 终态（合入 / 关闭）——子项回写只对终态即时发评论。 */
export function isTerminalMrEvent(event: ChangeEvent): boolean {
  if (event.kind !== 'mr') return false;
  return TERMINAL_MR_STATES.has(mrOfEvent(event).state.trim().toLowerCase());
}

/** 构建终态（成功 / 失败 / 取消等）——运行中不刷评论。 */
export function isTerminalBuildEvent(event: ChangeEvent): boolean {
  if (event.kind !== 'build') return false;
  return TERMINAL_BUILD_STATUSES.has(buildOfEvent(event).status.trim().toLowerCase());
}

/**
 * 需求级里程碑事件：MR 合入 / MR 关闭（未合入风险）/ 构建失败。
 * 注意：冻结的 ChangeEventKind 只有 commit/mr/build，「子项关闭」暂无法从事件流表达，
 * 需要 Rust 侧后续补 workitem 状态事件（已在交付报告中标注）。
 */
export function isMilestoneEvent(event: ChangeEvent): boolean {
  if (event.kind === 'mr') {
    const state = mrOfEvent(event).state.trim().toLowerCase();
    return MERGED_STATES.has(state) || CLOSED_STATES.has(state);
  }
  return isFailedBuild(event);
}

export function shouldPostParentEvent(event: ChangeEvent, mode: ActivityPolicy['parentMode']): boolean {
  if (mode === 'off') return false;
  if (mode === 'daily') return true;
  return isMilestoneEvent(event);
}

export interface ParentDigestInput {
  identifier: string;
  candidates: ActivityCandidate[];
  /** daily 聚合的本地日期（YYYY-MM-DD）；缺省取候选中最晚事件的时间。 */
  date?: string;
}

/**
 * 需求级简短汇总（milestone 单条 / daily 一天一条）。
 *
 * ```
 * [nervd] 需求进展 · REQ-101
 * 日期：2026-11-13
 * 汇总：3 个提交、1 个 MR（合入 1）、1 次构建（失败 1）
 * - MR !12 已合入 feature/a → master
 * - 构建 #88 失败
 * ```
 */
export function buildParentDigest(input: ParentDigestInput): string {
  const candidates = input.candidates ?? [];
  const commits = candidates.filter((c) => c.event.kind === 'commit');
  const mrs = candidates.filter((c) => c.event.kind === 'mr');
  const builds = candidates.filter((c) => c.event.kind === 'build');
  const mergedCount = mrs.filter((c) => isMergedMr(c.event)).length;
  const failedCount = builds.filter((c) => isFailedBuild(c.event)).length;

  const summary: string[] = [];
  if (commits.length) summary.push(`${commits.length} 个提交`);
  if (mrs.length) summary.push(`${mrs.length} 个 MR${mergedCount ? `（合入 ${mergedCount}）` : ''}`);
  if (builds.length) summary.push(`${builds.length} 次构建${failedCount ? `（失败 ${failedCount}）` : ''}`);

  const date =
    input.date ??
    (candidates.length
      ? localDateKey(Math.max(...candidates.map((c) => c.event.occurredAt)))
      : undefined);

  const lines = [`[nervd] 需求进展 · ${input.identifier}`];
  if (date) lines.push(`日期：${date}`);
  lines.push(`汇总：${summary.join('、') || '无变更'}`);
  lines.push(...parentDigestDetails(candidates));
  return lines.join('\n');
}

function parentDigestDetails(candidates: ActivityCandidate[]): string[] {
  const details: string[] = [];
  for (const candidate of candidates) {
    const event = candidate.event;
    if (event.kind === 'mr') {
      const mr = mrOfEvent(event);
      const label = mrStateLabel(mr.state);
      details.push(`- MR !${mr.localId} ${label} ${mr.sourceBranch || '未标记分支'} → ${mr.targetBranch || '未标记目标'}`);
    } else if (event.kind === 'build' && isFailedBuild(event)) {
      const build = buildOfEvent(event);
      details.push(`- 构建 #${build.runId} ${buildStatusLabel(build.status)}`);
    }
  }
  if (!details.length && candidates.length) {
    const commits = candidates.filter((c) => c.event.kind === 'commit');
    if (commits.length) {
      const shas = commits.map((c) => shortShaOf(commitOfEvent(c.event).sha)).filter(Boolean);
      details.push(`- 提交 ${commits.length} 个（${shas.slice(0, 5).join('、')}${shas.length > 5 ? '…' : ''}）`);
    }
  }
  // 汇总保持简短：详情最多 6 行，避免评论刷屏。
  return details.slice(0, 6);
}

export interface BatchKeyInput {
  workitemId: string;
  event: ChangeEvent;
  /** Rust 侧已算好的批次键优先。 */
  batchKey?: string;
}

/** 批次键：workitemId + repoId + branch + 10 分钟窗口（或后端显式 batchKey）。 */
export function batchKeyOf(input: BatchKeyInput, windowMs = COMMIT_BATCH_WINDOW_MS): string {
  if (input.batchKey) return input.batchKey;
  const bucket = Math.floor(input.event.occurredAt / windowMs);
  return `commit:${input.workitemId}:${input.event.repoId}:${input.event.branch ?? '-'}:${bucket}`;
}

export interface CandidateGroup {
  key: string;
  kind: ChangeEventKind;
  relation: AttributionRelation;
  workitemId: string;
  identifier: string;
  branch?: string;
  eventIds: string[];
  candidates: ActivityCandidate[];
  /** 组内最新事件时间（用于按时间顺序回写）。 */
  occurredAt: number;
}

export interface GroupCandidatesOptions {
  commitWindowMs?: number;
  /** 需求 daily 模式：rollup 候选按 (workitem, 本地日期) 聚合为一条。 */
  parentDaily?: boolean;
}

/** 默认 linkPattern 的 REQ 前缀：需求级事件按 parentMode 处理。 */
export function isRequirementIdentifier(identifier: string): boolean {
  return /^REQ[-_]/i.test(identifier.trim());
}

/** 候选分组：commit 按 10 分钟窗口聚合；MR / 构建终态即时单条；需求 daily 按本地日期聚合。 */
export function groupCandidates(
  candidates: ActivityCandidate[],
  options: GroupCandidatesOptions = {},
): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const candidate of candidates) {
    const event = candidate.event;
    const parentDailyCandidate = Boolean(
      options.parentDaily
      && (candidate.relation === 'rollup' || isRequirementIdentifier(candidate.identifier)),
    );
    let key: string;
    if (parentDailyCandidate) {
      key = `parent:${candidate.workitemId}:${localDateKey(event.occurredAt)}`;
    } else if (event.kind === 'commit') {
      key = batchKeyOf(
        { workitemId: candidate.workitemId, event, batchKey: candidate.batchKey },
        options.commitWindowMs,
      );
    } else {
      key = `event:${event.id}`;
    }

    const existing = groups.get(key);
    if (existing) {
      existing.candidates.push(candidate);
      existing.eventIds.push(event.id);
      existing.occurredAt = Math.max(existing.occurredAt, event.occurredAt);
    } else {
      groups.set(key, {
        key,
        kind: event.kind,
        relation: parentDailyCandidate ? 'rollup' : candidate.relation,
        workitemId: candidate.workitemId,
        identifier: candidate.identifier,
        branch: event.branch,
        eventIds: [event.id],
        candidates: [candidate],
        occurredAt: event.occurredAt,
      });
    }
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.candidates.sort((a, b) => a.event.occurredAt - b.event.occurredAt);
    group.eventIds = group.candidates.map((c) => c.event.id);
  }
  return result.sort((a, b) => a.occurredAt - b.occurredAt);
}

export interface RenderGroupOptions {
  /** childMode=per_event：每个 commit 单独一条（仍使用提交摘要格式）。 */
  perEvent?: boolean;
}

/** 候选组 → Markdown 正文（不含内嵌 event marker，marker 由 writer 追加）。 */
export function renderGroupMarkdown(group: CandidateGroup, options: RenderGroupOptions = {}): string {
  if (group.relation === 'rollup') {
    return buildParentDigest({
      identifier: group.identifier,
      candidates: group.candidates,
      date: localDateKey(group.occurredAt),
    });
  }

  const first = group.candidates[0];
  if (!first) return '';
  if (group.kind === 'mr') {
    return buildMrMarkdown({ identifier: group.identifier, ...mrOfEvent(first.event) });
  }
  if (group.kind === 'build') {
    return buildBuildMarkdown({ identifier: group.identifier, ...buildOfEvent(first.event) });
  }

  const commits = options.perEvent
    ? [commitOfEvent(first.event)]
    : group.candidates.map((c) => commitOfEvent(c.event));
  return buildCommitBatchMarkdown({
    identifier: group.identifier,
    branch: group.branch,
    commits,
  });
}

/** 把 Rust / 网络异常转成可读中文；未实现命令与只读门控给出明确指引。 */
export function describeAttributionError(err: unknown, fallback = '请稍后重试'): string {
  const message = humanizeError(err, fallback);
  if (/NOT_IMPLEMENTED/i.test(message)) {
    return '后端变更归属能力尚未就绪，请更新应用后重试';
  }
  if (/not allowed|denied|permission|allow_?write|只读/i.test(message)) {
    return '当前处于只读保护模式，请前往「设置 → 安全与权限策略」开启写操作';
  }
  return message;
}