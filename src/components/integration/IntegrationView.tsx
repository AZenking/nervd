import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownIcon, ArrowUpIcon, FolderIcon, GitBranchIcon, RefreshCwIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { errorLog, humanizeError } from '@/lib/error-format';
import { parseBranchList } from '@/lib/iteration-branches';
import { extractWorkItemKeys } from '@/lib/link';
import { comparisonCommits } from '../iteration/BranchDivergenceCheck';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import type { BranchInfo } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '../searchable-select';

import { AppBreadcrumb } from '../nav/app-breadcrumb';
import { STICKY_PAGE_HEADER_CLASS } from '../page-header';
import { EmptyHint } from '../empty-hint';

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
  const { openWorkitem } = useUi();
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
  const [debounced, setDebounced] = useState({ base: DEFAULT_BASE, patterns: DEFAULT_PATTERNS });
  const [rows, setRows] = useState<BranchRowState[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // 仓库选项就绪后选中第一个
  useEffect(() => {
    if (repoId == null && repoOptions.length) {
      setRepoId(Number(repoOptions[0].value));
    }
  }, [repoOptions, repoId]);

  // 输入防抖（模式 / 基准每次击键都会引发成对的 compare 请求）
  const debounceTimer = useRef<number | null>(null);
  useEffect(() => {
    if (debounceTimer.current != null) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      setDebounced({ base: base.trim() || DEFAULT_BASE, patterns: patterns.trim() });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current != null) window.clearTimeout(debounceTimer.current);
    };
  }, [base, patterns]);

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
          <AppBreadcrumb />
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
        <div className="flex items-center gap-3 pt-1">
          <span className="shrink-0 text-xs text-muted-foreground">基准</span>
          <Input
            value={base}
            onChange={(event) => setBase(event.target.value)}
            placeholder="master"
            aria-label="基准分支"
            className="h-7 w-36 font-mono text-xs"
          />
          <span className="shrink-0 text-xs text-muted-foreground">匹配模式（空格分隔，支持 *）</span>
          <Input
            value={patterns}
            onChange={(event) => setPatterns(event.target.value)}
            placeholder={DEFAULT_PATTERNS}
            aria-label="集成分支匹配模式"
            className="h-7 w-72 font-mono text-xs"
          />
          {phase === 'ready' && (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {repoName} · 命中 {rows.length} 条
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        {phase === 'loading' && (
          <div className="flex flex-col gap-1" aria-hidden>
            {[0, 1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-11 w-full rounded-lg" />)}
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
              <span className="ml-auto text-xs text-muted-foreground">基准 {debounced.base}</span>
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
                        className="cursor-pointer rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-foreground transition-colors hover:bg-accent/70"
                        onClick={() => {
                          openWorkitem(workitem.workitemId, {
                            workitemId: workitem.workitemId,
                            identifier: workitem.identifier,
                            subject: workitem.subject,
                          });
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
                        'flex shrink-0 items-center gap-1 text-xs tabular-nums',
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
                    {row.keys.length > 0 && (
                      <span className="flex shrink-0 items-center gap-1">{requirementButtons}</span>
                    )}
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
    </div>
  );
}

