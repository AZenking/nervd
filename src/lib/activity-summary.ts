// 「一个工作项一条滚动评论」的摘要渲染与定位。
//
// 与逐事件评论不同：评论正文由最近变更重新生成，内容不变则完全不更新；
// 只保留最近 N 条，避免评论无限增长；marker 用于在云效评论列表里找回同一条评论。
import {
  buildOfEvent,
  commitOfEvent,
  isMilestoneEvent,
  localDateKey,
  mrOfEvent,
} from './attribution-format';
import type { ChangeEvent, WorkitemChange } from '@/types/attribution';

/** 滚动评论的隐藏标记：只在 nervd 内识别，不参与展示。 */
export const SUMMARY_MARKER = '<!-- nervd:summary -->';
/** 评论里最多保留的变更条数，避免评论无限膨胀。 */
export const MAX_SUMMARY_CHANGES = 20;

export interface WorkitemSummaryOptions {
  /** 需求 milestone 模式：只渲染里程碑事件（MR 合入/关闭、构建失败）。 */
  parentMilestoneOnly?: boolean;
  /** 只渲染该本地日期之前的事件（daily 模式「次日汇总」用）。 */
  beforeDate?: string;
  /** repoId → Codeup 仓库路径（org/repo），用于生成提交链接。 */
  repoPathById?: Record<number, string>;
}

function timeLabel(ts: number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hh}:${mm}`;
}

/** Codeup 提交链接：优先用绑定仓库的 org/repo 路径拼装。 */
function commitWebUrl(
  repoId: number,
  sha: string,
  options: WorkitemSummaryOptions,
): string | undefined {
  const path = options.repoPathById?.[repoId]?.trim().replace(/^\/+|\/+$/g, '');
  if (!path || !sha) return undefined;
  return `https://codeup.aliyun.com/${path}/commit/${sha}`;
}

function linkSuffix(label: string, url?: string): string {
  return url ? ` [${label}](${url})` : '';
}

/** 按策略过滤摘要里展示的事件（不影响回写触发判断）。 */
export function filterSummaryChanges(
  changes: WorkitemChange[],
  options: WorkitemSummaryOptions = {},
): WorkitemChange[] {
  return changes.filter((change) => {
    if (options.parentMilestoneOnly && !isMilestoneEvent(change)) return false;
    if (options.beforeDate && localDateKey(change.occurredAt) >= options.beforeDate) return false;
    return true;
  });
}

function describeChange(change: WorkitemChange, options: WorkitemSummaryOptions): string {
  const time = timeLabel(change.occurredAt);
  if (change.kind === 'mr') {
    const mr = mrOfEvent(change as ChangeEvent);
    const state = buildMrStateLabel(mr.state);
    const suffix = linkSuffix('MR', mr.webUrl);
    return `- ${time} · MR !${mr.localId} ${state}${mr.sourceBranch ? `（${mr.sourceBranch} → ${mr.targetBranch}）` : ''}${suffix}`;
  }
  if (change.kind === 'build') {
    const build = buildOfEvent(change as ChangeEvent);
    const suffix = linkSuffix('构建', build.webUrl);
    return `- ${time} · 构建 #${build.runId || change.externalId} ${buildStatusLabel(build.status)}${suffix}`;
  }
  const commit = commitOfEvent(change as ChangeEvent);
  const url = commitWebUrl(change.repoId, commit.sha || change.externalId, options);
  return `- ${time} · 提交 ${commit.shortSha || commit.sha.slice(0, 7)} ${commit.message || change.title}${linkSuffix('提交', url)}`;
}

function buildMrStateLabel(state: string): string {
  const value = state.trim().toLowerCase();
  if (value === 'merged') return '已合入';
  if (value === 'closed') return '已关闭';
  if (value === 'open' || value === 'opened') return '进行中';
  return state || '状态未知';
}

function buildStatusLabel(status: string): string {
  const value = status.trim().toUpperCase();
  if (value === 'SUCCESS') return '成功';
  if (value === 'FAIL' || value === 'FAILED') return '失败';
  if (value === 'RUNNING') return '运行中';
  if (value === 'CANCELED' || value === 'CANCELLED') return '已取消';
  return status || '状态未知';
}

/**
 * 生成工作项滚动评论正文（Markdown）。无可见变更时返回空串，调用方应直接跳过，
 * 不发请求、不产生动态。
 */
export function buildWorkitemSummaryMarkdown(input: {
  identifier: string;
  changes: WorkitemChange[];
  now: number;
  options?: WorkitemSummaryOptions;
}): string {
  const { identifier } = input;
  const visible = filterSummaryChanges(input.changes, input.options)
    .slice()
    .sort((left, right) => right.occurredAt - left.occurredAt);
  if (!visible.length) return '';

  const counts = { commit: 0, mr: 0, build: 0 };
  for (const change of visible) {
    if (change.kind === 'commit') counts.commit += 1;
    else if (change.kind === 'mr') counts.mr += 1;
    else counts.build += 1;
  }
  const parts: string[] = [];
  if (counts.commit) parts.push(`${counts.commit} 个提交`);
  if (counts.mr) parts.push(`${counts.mr} 个 MR`);
  if (counts.build) parts.push(`${counts.build} 次构建`);

  const recent = visible.slice(0, MAX_SUMMARY_CHANGES);
  const omitted = visible.length - recent.length;
  const lines = [
    `交付进展 · ${identifier}`,
    '',
    `汇总：${parts.join(' · ')}`,
    '',
    '最近变更：',
    ...recent.map((change) => describeChange(change, input.options ?? {})),
  ];
  if (omitted > 0) lines.push(`… 另有 ${omitted} 条更早变更未展示`);
  return lines.join('\n');
}

/** 内容指纹：用于「内容未变化时不更新评论」。 */
export function summaryContentHash(markdown: string): string {
  let hash = 5381;
  for (let index = 0; index < markdown.length; index += 1) {
    hash = ((hash << 5) + hash + markdown.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

/** 在评论文档（可能包 result/comments 多层）里找带滚动标记的评论 ID。 */
export function findSummaryCommentId(payload: unknown): string | undefined {
  const seen = new Set<unknown>();
  const walk = (value: unknown): string | undefined => {
    if (value == null || typeof value !== 'object' || seen.has(value)) return undefined;
    seen.add(value);
    const record = value as Record<string, unknown>;
    const content = typeof record.content === 'string' ? record.content : '';
    if (content.includes(SUMMARY_MARKER)) {
      const raw = record.id ?? record.commentId ?? record.comment_id;
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
      if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    }
    for (const child of Object.values(record)) {
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(payload);
}