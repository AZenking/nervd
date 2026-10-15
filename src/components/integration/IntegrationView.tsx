import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownIcon, ArrowUpIcon, FolderIcon, GitBranchIcon, RefreshCwIcon, SearchIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { errorLog, humanizeError } from '@/lib/error-format';
import { parseBranchList } from '@/lib/iteration-branches';
import { extractWorkItemKeys } from '@/lib/link';
import { comparisonCommits } from '../iteration/BranchDivergenceCheck';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import type { BranchInfo } from '@/types';
import { useDebounce } from '@/hooks/use-debounce';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '../searchable-select';

import { STICKY_PAGE_HEADER_CLASS } from '../page-header';
import { EmptyHint } from '../empty-hint';
import { WorkitemPeekDrawer } from '../workitem-peek-drawer';

/**
 * 集成分支视图（纯查看，零写操作）：
 * 展示各云效仓库中匹配「集成分支模式」的分支——领先/落后基准多少、最后提交、
 * 分支名命中的需求编号（点击进入详情）。全部数据来自只读命令
 * list_branches / compare_branches，不含任何触发/创建入口。
 */

const DEFAULT_PATTERNS = 'release/* integration/* temp/* hotfix/*';
const DEFAULT_BASE = 'master';
const MAX_BRANCHES_PER_REPO = 20;
const DEBOUNCE_MS = 400;

/** 通配模式（`*` 匹配任意字符，空白分隔多个模式，命中任一即可） */
function matchPatterns(name: string, patterns: string): boolean {
  const tokens = patterns.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.some((token) => {
    const source = token
      .split('*')
      .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${source}$`).test(name);
  });
}

interface BranchRowState {
  name: string;
  commitMessage: string;
  committedDate: string;
  /** 领先基准的提交数（null = 比较失败） */
  ahead: number | null;
  /** 落后基准的提交数（null = 比较失败） */
  behind: number | null;
  keys: string[];
}

/** 日期统一取 YYYY-MM-DD */const dayOf = (value?: string): string => (value ? value.slice(0, 10) : '—');

export function IntegrationView() {
  const { repositories, settings, items } = useApp();
  const linkPattern = settings?.linkPattern || '(?:REQ|BUG|TASK)[-_]?(\\d+)';

  // 可选仓库：优先设置中的默认云效仓库，未配置时回退全部已加载仓库
  const watchedIds = settings?.watchedRepos ?? [];
  const repoOptions = useMemo(() => {
    const scoped = watchedIds.length
      ? repositories.filter((r) => watchedIds.includes(r.id))
      : repositories;
    return (scoped.length ? scoped : repositories).map((r) => ({
      label: r.pathWithNamespace || r.name,
      value: String(r.id),
    }));
  }, [repositories, watchedIds]);

  const [repoId, setRepoId] = useState<number | null>(null);
  const [base, setBase] = useState(DEFAULT_BASE);
  const [patterns, setPatterns] = useState(DEFAULT_PATTERNS);
  const debouncedBase = useDebounce(base.trim() || DEFAULT_BASE, DEBOUNCE_MS);
  const debouncedPatterns = useDebounce(patterns.trim(), DEBOUNCE_MS);
  const debounced = useMemo(
    () => ({ base: debouncedBase, patterns: debouncedPatterns }),
    [debouncedBase, debouncedPatterns],
  );
  const [rows, setRows] = useState<BranchRowState[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [drawerWorkitemId, setDrawerWorkitemId] = useState<string | null>(null);

  // 仓库选项就绪后选中第一个
  useEffect(() => {
    if (repoId == null && repoOptions.length) {
      setRepoId(Number(repoOptions[0].value));
    }
  }, [repoOptions, repoId]);

  const load = useCallback(() => setReloadKey((key) => key + 1), []);

  // 主加载：分支列表 → 过滤 → 成对比较（领先/落后）
  useEffect(() => {
    if (!repoId) return;
    let active = true;
    setPhase('loading');
    void (async () => {
      try {
        const raw = await api.listBranches(repoId, undefined, 1, 100);
        const matched = parseBranchList(raw)
          .filter((branch) => matchPatterns(branch.name, debounced.patterns))
          .slice(0, MAX_BRANCHES_PER_REPO);
        const loaded = await Promise.all(matched.map(async (branch: BranchInfo): Promise<BranchRowState> => {
          const row: BranchRowState = {
            name: branch.name,
            commitMessage: (branch.commit?.message ?? '').split('\n')[0],
            committedDate: branch.commit?.committedDate ?? '',
            ahead: null,
            behind: null,
            keys: extractWorkItemKeys(branch.name, linkPattern),
          };
          if (branch.name === debounced.base) {
            row.ahead = 0;
            row.behind = 0;
            return row;
          }
          try {
            const [aheadDiff, behindDiff] = await Promise.all([
              api.compareBranches(repoId, debounced.base, branch.name),
              api.compareBranches(repoId, branch.name, debounced.base),
            ]);
            row.ahead = comparisonCommits(aheadDiff).length;
            row.behind = comparisonCommits(behindDiff).length;
          } catch {
            // 比较失败保持 null，行内以「—」呈现（不阻塞其他分支）
          }
          return row;
        }));
        if (active) {
          loaded.sort((x, y) => y.name.localeCompare(x.name));
          setRows(loaded);
          setPhase('ready');
        }
      } catch (error) {
        errorLog('integration-view', error);
        if (active) {
          setPhase('error');
          setErrorMessage(humanizeError(error, '分支列表加载失败'));
        }
      }
    })();
    return () => { active = false; };
  }, [repoId, debounced, reloadKey, linkPattern]);

  const repoName = repoOptions.find((option) => Number(option.value) === repoId)?.label ?? '';

  return (
    <div className="flex flex-col gap-5">
      <header className={STICKY_PAGE_HEADER_CLASS}>
        <div className="flex min-h-9 items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">集成分支</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SearchableSelect
              className="w-56 text-xs"
              ariaLabel="切换仓库"
              value={repoId == null ? null : String(repoId)}
              onValueChange={(value) => { if (value) setRepoId(Number(value)); }}
              items={repoOptions}
            />
            <Button variant="ghost" size="icon-sm" aria-label="刷新" onClick={load}>
              <RefreshCwIcon />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-xs">
            <GitBranchIcon className="size-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">基准</span>
            <input
              value={base}
              onChange={(event) => setBase(event.target.value)}
              placeholder="master"
              aria-label="基准分支"
              className="h-6 w-24 bg-transparent font-mono text-xs outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-xs">
            <SearchIcon className="size-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">匹配模式</span>
            <input
              value={patterns}
              onChange={(event) => setPatterns(event.target.value)}
              placeholder={DEFAULT_PATTERNS}
              aria-label="集成分支匹配模式"
              className="h-6 w-56 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          {phase === 'ready' && (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {repoName} · 命中 {rows.length} 条
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        {phase === 'loading' && (
          <div className="flex flex-col gap-1" aria-hidden>
            {[0, 1, 2, 3, 4].map((key) => (
              <div
                key={key}
                className="flex h-11 w-full items-center gap-2 rounded-lg px-3 bg-muted/20"
              >
                <div className="flex w-64 shrink-0 items-center gap-1.5 pl-5">
                  <Skeleton className="size-3.5 rounded" />
                  <Skeleton className="h-3.5 w-36 rounded" />
                </div>
                <Skeleton className="h-3.5 min-w-0 flex-1 rounded" style={{ width: `${50 + ((key * 13) % 40)}%` }} />
                <div className="flex w-24 shrink-0 items-center gap-1">
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <div className="flex w-28 shrink-0 items-center gap-1">
                  <Skeleton className="h-5 w-16 rounded" />
                </div>
                <div className="flex w-20 shrink-0 justify-end">
                  <Skeleton className="h-3.5 w-14 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {phase === 'error' && (
          <EmptyHint
            icon={FolderIcon}
            title="分支列表加载失败"
            description={errorMessage}
            action={(
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCwIcon data-icon="inline-start" />
                重试
              </Button>
            )}
          />
        )}

        {phase === 'ready' && !rows.length && (
          <EmptyHint
            icon={FolderIcon}
            title="未匹配到集成分支"
            description={`当前模式「${debounced.patterns || '（空）'}」没有命中任何分支，可调整上方匹配模式。`}
          />
        )}

        {phase === 'ready' && rows.length > 0 && (
          <>
            {/* 仓库分组横带（Linear 组头形态） */}
            <div className="flex h-8 items-center gap-2 rounded-md bg-muted/70 px-3">
              <FolderIcon className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 truncate text-[13px] font-medium">{repoName}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
              <span className="ml-auto text-xs text-muted-foreground font-mono">基准 {debounced.base}</span>
            </div>
            {/* 列名提示栏（Linear 式微弱字距表头） */}
            <div className="flex h-7 items-center gap-2 px-3 text-[11px] font-medium text-muted-foreground">
              <span className="w-64 shrink-0 pl-5">分支</span>
              <span className="min-w-0 flex-1">最新提交</span>
              <span className="w-24 shrink-0">基准对比</span>
              <span className="w-28 shrink-0">关联需求</span>
              <span className="w-20 shrink-0 text-right">提交日期</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {rows.map((row) => {
                const requirementButtons = row.keys
                  .map((key) => {
                    const workitem = items.find((i) => i.identifier.toUpperCase() === key.toUpperCase());
                    if (!workitem) {
                      return (
                        <span
                          key={key}
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                        >
                          {key}
                        </span>
                      );
                    }
                    return (
                      <button
                        key={key}
                        type="button"
                        className={cn(
                          'cursor-pointer rounded px-1.5 py-0.5 font-mono text-xs transition-colors',
                          workitem.workitemId === drawerWorkitemId
                            ? 'bg-primary text-primary-foreground font-semibold'
                            : 'bg-accent text-foreground hover:bg-accent/70',
                        )}
                        onClick={() => {
                          setDrawerWorkitemId(workitem.workitemId);
                          void useApp.getState().select(workitem.workitemId);
                        }}
                      >
                        {key}
                      </button>
                    );
                  });
                const diverged = row.ahead != null && row.behind != null && (row.ahead > 0 || row.behind > 0);
                return (
                  <div
                    key={row.name}
                    className="group flex h-11 w-full items-center gap-2 rounded-lg px-3 transition-colors hover:bg-muted/60"
                  >
                    <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="w-64 shrink-0 truncate font-mono text-xs text-foreground">{row.name}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                      {row.commitMessage || '—'}
                    </span>
                    {/* 领先 / 落后基准 */}
                    <span
                      className={cn(
                        'flex w-24 shrink-0 items-center gap-1 text-xs tabular-nums',
                        diverged ? 'text-foreground' : 'text-muted-foreground',
                      )}
                      title={row.ahead == null || row.behind == null
                        ? '与基准的比较失败'
                        : diverged
                          ? `领先 ${row.ahead} 个提交 · 落后 ${row.behind} 个提交`
                          : '与基准一致'}
                    >
                      <ArrowUpIcon className="size-3" />
                      {row.ahead ?? '—'}
                      <ArrowDownIcon className="ml-1 size-3" />
                      {row.behind ?? '—'}
                    </span>
                    {/* 命中的需求编号：有工作项则可点击进入详情 */}
                    <span className="flex w-28 shrink-0 items-center gap-1 truncate">
                      {requirementButtons.length ? requirementButtons : <span className="text-xs text-muted-foreground">—</span>}
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {dayOf(row.committedDate)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              纯查看视图：比较结果来自云效 Codeup，打包/触发等写操作请前往对应流水线。
            </p>
          </>
        )}

        {phase === 'idle' && !repoOptions.length && (
          <EmptyHint
            icon={FolderIcon}
            title="未加载云效仓库"
            description="请先在「设置 → 云效连接」配置并保存连接"
          />
        )}
      </div>

      {/* 需求详情抽屉（Linear Peek View）：就地滑出，保留集成分支列表上下文 */}
      <WorkitemPeekDrawer
        workitemId={drawerWorkitemId}
        onClose={() => setDrawerWorkitemId(null)}
      />
    </div>
  );
}

