// 待归属变更队列（时间线顶部内嵌）。
//
// 只消费 `useAttribution.unassigned`：父级负责首次 `loadUnassigned`，
// 这里负责展示前 N 条、打开指派 Dialog、解析工作项编号并调用 store.assign。
// 失败提示优先留在 Dialog 内联展示，避免与 store 的失败 toast 重复。
import { useMemo, useState } from 'react';
import { AlertCircleIcon, GitCommitIcon, GitPullRequestIcon, PlayIcon } from 'lucide-react';
import type { WorkitemChange } from '@/types/attribution';
import * as attributionApi from '@/lib/attribution-api';
import {
  buildOfEvent,
  commitOfEvent,
  mrOfEvent,
  shortShaOf,
} from '@/lib/attribution-format';
import { humanizeError } from '@/lib/error-format';
import { useAttribution } from '@/store/attribution';
import { useApp } from '@/store/app';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { formatChangeDate } from './change-event-card';

export interface UnattributedChangesProps {
  /** 最多展示条数（默认 5）。 */
  limit?: number;
  className?: string;
}

function eventLabel(change: WorkitemChange): string {
  if (change.kind === 'mr') {
    const mr = mrOfEvent(change);
    return `!${mr.localId > 0 ? mr.localId : change.externalId}`;
  }
  if (change.kind === 'build') {
    const build = buildOfEvent(change);
    return `#${build.runId || change.externalId}`;
  }
  const commit = commitOfEvent(change);
  return shortShaOf(commit.sha, commit.shortSha) || change.externalId.slice(0, 7);
}

function eventBranch(change: WorkitemChange): string | undefined {
  if (change.kind === 'mr') return mrOfEvent(change).sourceBranch || change.branch;
  return change.branch;
}

function EventKindIcon({ kind }: { kind: WorkitemChange['kind'] }) {
  if (kind === 'mr') return <GitPullRequestIcon className="size-3.5 shrink-0" />;
  if (kind === 'build') return <PlayIcon className="size-3.5 shrink-0" />;
  return <GitCommitIcon className="size-3.5 shrink-0" />;
}

/**
 * 待归属变更（默认前 5 条）：
 * - 每条显示仓库、短 SHA / !MR / #构建、标题、分支与时间；
 * - 「指派」打开小 Dialog：输入编号经 `resolve_workitem_identifiers` 解析后写入归属；
 * - 也支持从 `useApp.items` 已加载列表里直接选择；成功后 store 会把条目移出队列。
 */
export function UnattributedChanges({ limit = 5, className }: UnattributedChangesProps) {
  const unassigned = useAttribution((state) => state.unassigned);
  const assign = useAttribution((state) => state.assign);
  const loadedItems = useApp((state) => state.items);

  const [target, setTarget] = useState<WorkitemChange | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const total = unassigned.length;
  const visible = unassigned.slice(0, Math.max(1, limit));

  const candidates = useMemo(() => {
    const query = input.trim().toLowerCase();
    if (!query || !Array.isArray(loadedItems)) return [];
    return loadedItems
      .filter((item) => {
        const identifier = (item.identifier ?? '').toLowerCase();
        const subject = (item.subject ?? '').toLowerCase();
        return identifier.includes(query) || subject.includes(query);
      })
      .slice(0, 5);
  }, [input, loadedItems]);

  const openDialog = (change: WorkitemChange) => {
    setTarget(change);
    setInput('');
    setDialogError(null);
  };

  const closeDialog = () => {
    if (busy) return;
    setTarget(null);
    setDialogError(null);
    setInput('');
  };

  const assignTo = async (workitemId: string) => {
    if (!target || busy) return;
    setBusy(true);
    setDialogError(null);
    try {
      const ok = await assign({ eventId: target.id, workitemId, relation: 'primary' });
      if (!ok) {
        setDialogError('指派失败，请稍后重试');
        return;
      }
      setTarget(null);
      setInput('');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!target || busy) return;
    const query = input.trim();
    if (!query) {
      setDialogError('请输入工作项编号，如 TASK-202');
      return;
    }
    setBusy(true);
    setDialogError(null);
    try {
      const refs = await attributionApi.resolveWorkitemIdentifiers({ identifiers: [query] });
      const hit = refs.find((ref) => Boolean(ref.workitemId) && !ref.error);
      if (!hit?.workitemId) {
        const reason = refs.find((ref) => ref.error)?.error;
        setDialogError(
          reason
            ? `未找到该工作项：${reason}`
            : `未找到编号为「${query}」的工作项，请确认编号是否正确`,
        );
        return;
      }
      const ok = await assign({ eventId: target.id, workitemId: hit.workitemId, relation: 'primary' });
      if (!ok) {
        setDialogError('指派失败，请稍后重试');
        return;
      }
      setTarget(null);
      setInput('');
    } catch (error) {
      setDialogError(`查找工作项失败：${humanizeError(error)}`);
    } finally {
      setBusy(false);
    }
  };

  if (total === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-warning/25 bg-warning/5 p-2.5',
        className,
      )}
      data-testid="unattributed-changes"
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertCircleIcon className="size-3.5 shrink-0 text-sig-run" />
        <span className="shrink-0 text-[13px] font-medium text-foreground">
          待归属变更 ({total})
        </span>
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          这些提交 / MR / 构建尚未匹配到工作项，指派后会计入对应时间线
        </span>
      </div>

      <ul className="flex flex-col">
        {visible.map((change) => {
          const branch = eventBranch(change);
          return (
            <li
              key={change.id}
              data-testid="unattributed-row"
              className="flex min-w-0 items-center gap-2 border-t border-border/40 py-1.5 first:border-t-0"
            >
              <span className="inline-flex shrink-0 items-center gap-1 rounded-xs border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <EventKindIcon kind={change.kind} />
                <span className="max-w-24 truncate">{change.repoName || `#${change.repoId}`}</span>
              </span>
              <span className="shrink-0 font-mono text-[11px] font-medium text-foreground">
                {eventLabel(change)}
              </span>
              <OverflowTooltip
                text={change.title || '（无标题）'}
                className="min-w-0 flex-1 text-xs text-foreground/85"
              />
              {branch && (
                <OverflowTooltip
                  text={branch}
                  className="hidden max-w-32 shrink-0 font-mono text-[10px] text-muted-foreground sm:inline-block"
                />
              )}
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                {formatChangeDate(change.occurredAt)}
              </span>
              <Button size="xs" variant="outline" onPress={() => openDialog(change)}>
                指派
              </Button>
            </li>
          );
        })}
      </ul>

      {total > visible.length && (
        <p className="text-[10px] text-muted-foreground">
          还有 {total - visible.length} 条待归属变更未展示
        </p>
      )}

      <Dialog open={target !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="gap-3 p-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>指派变更归属</DialogTitle>
            <DialogDescription>
              {target
                ? `${eventLabel(target)} · ${target.title || '（无标题）'}`
                : '输入工作项编号完成归属'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="attribution-assign-input"
              className="text-xs font-medium text-foreground"
            >
              工作项编号
            </label>
            <Input
              id="attribution-assign-input"
              autoFocus
              placeholder="输入工作项编号（如 TASK-202）"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setDialogError(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void submit();
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              编号会在云效解析为工作项；解析成功后写入本地归属并立即出现在对应时间线。
            </p>

            {dialogError && (
              <p role="alert" className="text-xs leading-relaxed text-sig-fail">
                {dialogError}
              </p>
            )}

            {candidates.length > 0 && (
              <div className="flex flex-col gap-1 pt-1">
                <p className="text-[11px] font-medium text-muted-foreground">从已加载工作项中选择</p>
                {candidates.map((item) => (
                  <button
                    key={item.workitemId}
                    type="button"
                    aria-disabled={busy || undefined}
                    className={cn(
                      'flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      busy && 'cursor-not-allowed opacity-60',
                    )}
                    onClick={() => {
                      if (busy) return;
                      void assignTo(item.workitemId);
                    }}
                  >
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {item.identifier}
                    </span>
                    <OverflowTooltip
                      text={item.subject || item.identifier}
                      className="min-w-0 flex-1 text-xs text-foreground/85"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onPress={closeDialog} aria-disabled={busy}>
              取消
            </Button>
            <Button size="sm" onPress={() => void submit()} aria-disabled={busy}>
              {busy ? <Spinner className="size-3.5" /> : null}
              确认指派
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}