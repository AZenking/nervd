// 单条代码变更事件卡（commit / MR / build）。
//
// 契约见 `src/types/attribution.ts`：payload 是联合类型且允许通用对象，
// 因此所有字段读取都走 `asCommitPayload` / `mrOfEvent` / `buildOfEvent` 的防御式解析，
// 缺字段只降级展示，不抛错。归属与回写状态只读展示，不触发任何写操作。
import { useState } from 'react';
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  PlayIcon,
  UserIcon,
} from 'lucide-react';
import type {
  ActivityPostStatus,
  AttributionConfidence,
  BuildChangePayload,
  ChangeEvent,
  CommitChangePayload,
  MrChangePayload,
  WorkitemChange,
} from '@/types/attribution';
import {
  buildOfEvent,
  buildStatusLabel,
  commitOfEvent,
  mrOfEvent,
  mrStateLabel,
  shortShaOf,
} from '@/lib/attribution-format';
import { openExternal } from '@/lib/yunxiao-link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { statusMeta, type StatusTone } from '@/components/StatusBadge';

export interface ChangeEventCardProps {
  change: WorkitemChange;
  /** 子项抽屉内的紧凑形态：隐去次要字段、收紧间距。 */
  compact?: boolean;
}

type BadgeColor = 'default' | 'accent' | 'success' | 'warning' | 'danger';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** payload → 提交摘要；payload 为 `unknown` / 缺字段时回退 event 自身信息。 */
export function asCommitPayload(change: ChangeEvent): CommitChangePayload {
  const payload = isRecord(change.payload) ? change.payload : {};
  const base = commitOfEvent(change);
  const files = Array.isArray(payload.files)
    ? payload.files.filter((file): file is string => typeof file === 'string' && file.trim().length > 0)
    : base.files;
  return {
    ...base,
    files: files && files.length > 0 ? files : base.files,
  };
}

function asMrPayload(change: ChangeEvent): MrChangePayload {
  return mrOfEvent(change);
}

function asBuildPayload(change: ChangeEvent): BuildChangePayload {
  return buildOfEvent(change);
}

function firstLine(text: string | undefined): string {
  const raw = (text ?? '').trim();
  if (!raw) return '（无提交说明）';
  return raw.split(/\r?\n/, 1)[0] ?? raw;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 事件发生的本地时钟（HH:mm）。 */
export function formatClock(ts: number): string {
  const date = new Date(ts);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 本地日期 + 时间（M月D日 HH:mm）。 */
export function formatChangeDate(ts: number): string {
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${formatClock(ts)}`;
}

/** 构建耗时的人类可读文本。 */
export function formatDuration(ms?: number): string | undefined {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return undefined;
  if (ms < 1000) return `${Math.round(ms)} 毫秒`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;
}

function toneColor(tone: StatusTone): BadgeColor {
  return tone === 'ok' ? 'success' : tone === 'fail' ? 'danger' : tone === 'run' ? 'warning' : 'default';
}

const CONFIDENCE_META: Record<AttributionConfidence, { short: string; label: string; hint: string }> = {
  explicit: {
    short: '显式',
    label: '显式归属',
    hint: '提交信息或 MR 中直接引用了该工作项编号',
  },
  branch: {
    short: '分支',
    label: '分支推断',
    hint: '根据分支名中的工作项编号自动推断',
  },
  target: {
    short: '目标',
    label: '目标推断',
    hint: '根据 MR 目标分支上的工作项编号自动推断',
  },
  inherited: {
    short: '继承',
    label: '继承归属',
    hint: '由子任务/缺陷归属汇总到父需求',
  },
  manual: {
    short: '手动',
    label: '手动归属',
    hint: '由人工在待归属队列中指派',
  },
};

const ACTIVITY_META: Record<ActivityPostStatus, { label: string; className: string }> = {
  pending: { label: '待回写', className: 'text-muted-foreground' },
  posted: { label: '已回写', className: 'text-sig-ok' },
  failed: { label: '回写失败', className: 'text-sig-fail' },
  skipped: { label: '已跳过', className: 'text-muted-foreground/70' },
};

function AttributionBadge({ change, compact }: { change: WorkitemChange; compact?: boolean }) {
  const meta = CONFIDENCE_META[change.confidence] ?? CONFIDENCE_META.explicit;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex cursor-default rounded-xs focus-visible:outline-none" />}
      >
        <span className="inline-flex items-center rounded-xs border border-border/60 bg-surface-secondary/40 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-muted-foreground">
          {compact ? meta.short : meta.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{meta.hint}</TooltipContent>
    </Tooltip>
  );
}

function ActivityBadge({ change }: { change: WorkitemChange }) {
  const status = change.activityStatus;
  const meta = status
    ? ACTIVITY_META[status]
    : change.pushed === false || change.source === 'local'
      ? { label: '仅本地', className: 'text-muted-foreground' }
      : null;
  if (!meta) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] leading-4', meta.className)}>
      <span className="size-1 rounded-full bg-current" aria-hidden />
      {meta.label}
    </span>
  );
}

function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <Chip
      size="sm"
      variant="soft"
      color={toneColor(tone)}
      className="shrink-0 gap-1 font-medium"
    >
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}

function MetaDivider() {
  return <span className="text-border/80" aria-hidden>·</span>;
}

function ExternalLinkButton({ url }: { url?: string }) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="在浏览器中打开"
            title="在浏览器中打开"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onPress={() => void openExternal(url)}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <ExternalLinkIcon className="size-3" />
      </TooltipTrigger>
      <TooltipContent>在浏览器中打开</TooltipContent>
    </Tooltip>
  );
}

/**
 * 代码变更事件卡：
 * - commit：短 SHA + 标题 + 作者/分支/增删行/文件数，点击展开文件明细；
 * - MR：!localId + 状态 + source → target；
 * - build：runId + 状态 + 耗时 + stage，失败使用危险语义色。
 * 右上角常驻归属徽标（显式/分支/目标/继承/手动）与回写状态，不使用原生 title。
 */
export function ChangeEventCard({ change, compact = false }: ChangeEventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isCommit = change.kind === 'commit';
  const commit = isCommit ? asCommitPayload(change) : null;
  const mr = change.kind === 'mr' ? asMrPayload(change) : null;
  const build = change.kind === 'build' ? asBuildPayload(change) : null;

  const mrLocalId = mr ? (mr.localId > 0 ? mr.localId : change.externalId) : '';
  const buildRunId = build ? build.runId || change.externalId : '';
  const primaryId = isCommit
    ? shortShaOf(commit?.sha ?? change.externalId, commit?.shortSha)
    : mr
      ? `!${mrLocalId}`
      : `#${buildRunId}`;

  const title = isCommit ? firstLine(commit?.message) : (change.title || '（无标题）');
  const mrStatus = mr ? statusMeta(mr.state) : null;
  const buildStatus = build ? statusMeta(build.status) : null;
  const failedBuild = buildStatus?.tone === 'fail';

  const fileCount = commit
    ? commit.filesChanged ?? commit.files?.length ?? 0
    : 0;
  const canExpand = isCommit && (Boolean(commit?.files?.length) || fileCount > 0);
  const files = commit?.files ?? [];

  const branch = isCommit ? change.branch : mr?.sourceBranch || change.branch;
  const secondaryBranch = mr?.targetBranch || change.targetBranch;

  const activity = change.activityStatus;

  return (
    <article
      data-testid="change-event-card"
      data-kind={change.kind}
      role={canExpand ? 'button' : undefined}
      tabIndex={canExpand ? 0 : undefined}
      aria-expanded={canExpand ? expanded : undefined}
      onClick={canExpand ? () => setExpanded((value) => !value) : undefined}
      onKeyDown={canExpand ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setExpanded((value) => !value);
      } : undefined}
      className={cn(
        'group rounded-lg border bg-surface transition-colors',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
        failedBuild ? 'border-danger/35' : 'border-border/60',
        canExpand && 'cursor-pointer hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center',
            failedBuild ? 'text-sig-fail' : 'text-muted-foreground',
          )}
          aria-hidden
        >
          {isCommit ? (
            <GitCommitIcon className="size-3.5" />
          ) : mr ? (
            <GitPullRequestIcon className="size-3.5" />
          ) : (
            <PlayIcon className="size-3.5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 font-mono text-xs font-medium text-foreground">{primaryId}</span>
            <span
              className="shrink-0 rounded-sm border border-border/40 bg-surface-secondary/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              data-testid="change-identifier"
            >
              {change.identifier}
            </span>
            {mr && mrStatus && <StatusPill label={mrStateLabel(mr.state)} tone={mrStatus.tone} />}
            {build && buildStatus && (
              <StatusPill label={buildStatusLabel(build.status)} tone={buildStatus.tone} />
            )}
            {isCommit && change.pushed === false && (
              <Chip size="sm" variant="soft" color="warning" className="shrink-0 gap-1">
                <Chip.Label>本地未推送</Chip.Label>
              </Chip>
            )}
            <OverflowTooltip
              text={title}
              className="min-w-0 flex-1 text-[13px] font-medium text-foreground"
            />
            {canExpand && (
              <ChevronRightIcon
                className={cn(
                  'size-3 shrink-0 text-muted-foreground/70 transition-transform',
                  expanded && 'rotate-90',
                )}
              />
            )}
          </div>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-0 text-[11px] text-muted-foreground">
            {isCommit && (
              <>
                {commit?.author && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <UserIcon className="size-3 shrink-0" />
                    <span className="max-w-28 truncate">{commit.author}</span>
                  </span>
                )}
                {branch && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <GitBranchIcon className="size-3 shrink-0" />
                    <OverflowTooltip text={branch} className="max-w-40 truncate font-mono" />
                  </span>
                )}
                {(commit?.additions != null || commit?.deletions != null) && (
                  <span className="shrink-0 font-mono tabular-nums">
                    <span className="text-sig-ok">+{commit?.additions ?? 0}</span>
                    <span className="mx-0.5 text-muted-foreground/60">/</span>
                    <span className="text-sig-fail">-{commit?.deletions ?? 0}</span>
                  </span>
                )}
                {fileCount > 0 && (
                  <span className="shrink-0" data-testid="commit-file-count">{fileCount} 个文件</span>
                )}
              </>
            )}

            {mr && (
              <>
                {mr.author && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <UserIcon className="size-3 shrink-0" />
                    <span className="max-w-28 truncate">{mr.author}</span>
                  </span>
                )}
                {(branch || secondaryBranch) && (
                  <span className="inline-flex min-w-0 items-center gap-1 font-mono">
                    <OverflowTooltip text={branch || '未标记分支'} className="max-w-36 truncate" />
                    <span className="shrink-0 text-muted-foreground/70">→</span>
                    <OverflowTooltip text={secondaryBranch || '未标记目标'} className="max-w-36 truncate" />
                  </span>
                )}
                <ExternalLinkButton url={mr.webUrl} />
              </>
            )}

            {build && (
              <>
                {build.stage && <span className="shrink-0">{build.stage}</span>}
                {formatDuration(build.durationMs) && (
                  <span className="shrink-0 font-mono tabular-nums">{formatDuration(build.durationMs)}</span>
                )}
                <span className="shrink-0">{build.provider === 'jenkins' ? 'Jenkins' : 'Flow'}</span>
                <ExternalLinkButton url={build.webUrl} />
              </>
            )}

            {!compact && <MetaDivider />}
            <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground/80">
              {formatClock(change.occurredAt)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 pl-1">
          <AttributionBadge change={change} compact={compact} />
          <ActivityBadge change={change} />
        </div>
      </div>

      {isCommit && expanded && canExpand && (
        <div
          className="mt-2 rounded-md border border-border/50 bg-surface-secondary/25 p-2"
          onClick={(event) => event.stopPropagation()}
        >
          {files.length > 0 ? (
            <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto">
              {files.map((file) => (
                <li key={file} className="truncate font-mono text-[11px] text-muted-foreground">
                  {file}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {activity === 'skipped' ? '该提交已跳过回写，未提供文件明细' : '未提供文件明细'}
            </p>
          )}
        </div>
      )}
    </article>
  );
}