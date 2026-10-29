import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  GitBranchIcon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { errorLog, humanizeError } from '@/lib/error-format';
import { parseBranchList } from '@/lib/iteration-branches';
import { extractWorkItemKeys } from '@/lib/link';
import { comparisonCommits } from '../iteration/BranchDivergenceCheck';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useShallow } from 'zustand/react/shallow';
import type { BranchInfo } from '@/types';
import { useDebounce } from '@/hooks/use-debounce';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { SearchableSelect } from '../searchable-select';

import { PageHeader } from '../page-header';
import { EmptyHint } from '../empty-hint';
import { WorkitemPeekDrawer } from '../workitem-peek-drawer';
import { AiReleaseNotesDialog } from './ai-release-notes-dialog';
import { OverflowTooltip } from '../overflow-tooltip';

/**
 * 集成分支视图（纯查看，零写操作）：
 * 展示各云效仓库中匹配「集成分支模式」的分支——领先/落后基准多少、最后提交、
 * 分支名命中的需求编号（点击进入详情）。
 *
 * 性能优化：
 * 1. 分支列表 SWR 内存缓存：同仓库在 3 分钟内切换零延迟秒开；
 * 2. 渐进式流式加载：拿到分支列表先立刻呈现基础信息，落差比对在后台并发执行，局部更新；
 * 3. 相同 Commit SHA 快速路径直接判定 0/0，跳过冗余比较请求；
 * 4. 分页控制（每页 20 条，支持 [ / ] 快捷键），仅对当前页可见分支进行落差比对；
 * 5. 限制比对并发数（3），防止瞬间高频请求打满网络并触发限流。
 */

const DEFAULT_PATTERNS = 'release/* integration/* temp/* hotfix/*';
const DEFAULT_BASE = 'master';
const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;
const COMPARE_CONCURRENCY = 3;
const BRANCH_CACHE_TTL = 3 * 60 * 1000;

/** 通配模式（`*` 匹配任意字符，空白分隔多个模式，命中任一即可） */
export function matchPatterns(name: string, patterns: string): boolean {
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

export interface BranchRowState {
  name: string;
  commitMessage: string;
  committedDate: string;
  /** 领先基准的提交数（null = 比较失败或未完成） */
  ahead: number | null;
  /** 落后基准的提交数（null = 比较失败或未完成） */
  behind: number | null;
  keys: string[];
  /** 是否正在比对落差中 */
  comparing?: boolean;
}

export interface ComparisonCacheEntry {
  baseSha: string;
  branchSha: string;
  ahead: number;
  behind: number;
}

/**
 * 依据基准分支 SHA、自身 SHA 及缓存快速推导首屏行状态
 * 命中 Fast-path（同名或同 SHA）或缓存时直接归零/复用，跳过不必要的网络比对
 */
export function deriveInitialBranchRow(
  branch: BranchInfo,
  baseBranchName: string,
  baseSha: string,
  linkPattern: string,
  cached?: ComparisonCacheEntry,
): BranchRowState {
  const branchSha = branch.commit?.id ?? branch.commit?.message ?? 'unknown_branch';
  const row: BranchRowState = {
    name: branch.name,
    commitMessage: (branch.commit?.message ?? '').split('\n')[0],
    committedDate: branch.commit?.committedDate ?? '',
    ahead: null,
    behind: null,
    keys: extractWorkItemKeys(branch.name, linkPattern),
    comparing: false,
  };

  if (branch.name === baseBranchName) {
    row.ahead = 0;
    row.behind = 0;
    return row;
  }

  if (baseSha !== 'unknown_base' && branchSha !== 'unknown_branch' && baseSha === branchSha) {
    row.ahead = 0;
    row.behind = 0;
    return row;
  }

  if (cached && cached.baseSha === baseSha && cached.branchSha === branchSha) {
    row.ahead = cached.ahead;
    row.behind = cached.behind;
    return row;
  }

  row.comparing = true;
  return row;
}

interface BranchListCacheEntry {
  branches: BranchInfo[];
  fetchedAt: number;
}

/** 仓库分支列表缓存（按 repoId） */
const branchListCache = new Map<number, BranchListCacheEntry>();

/** 分支比对结果缓存（按 repoId:base:branch 缓存，SHA 未变时跳过重复网络调用） */
const comparisonCache = new Map<string, ComparisonCacheEntry>();

/** 日期统一取 YYYY-MM-DD */
const dayOf = (value?: string): string => (value ? value.slice(0, 10) : '—');

export function IntegrationView() {
  const { repositories, settings, items } = useApp(
    useShallow((s) => ({
      repositories: s.repositories,
      settings: s.settings,
      items: s.items,
    })),
  );
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

  // 仓库全量分支数据与拉取状态
  const [allBranches, setAllBranches] = useState<BranchInfo[]>([]);
  const [branchPhase, setBranchPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // 分页状态
  const [page, setPage] = useState(1);

  // 当前页表格渲染行（渐进式注入比对结果）
  const [rows, setRows] = useState<BranchRowState[]>([]);

  // 详情与弹窗状态
  const [drawerWorkitemId, setDrawerWorkitemId] = useState<string | null>(null);
  const [selectedReleaseBranch, setSelectedReleaseBranch] = useState<BranchRowState | null>(null);

  // 仓库选项就绪后选中第一个
  useEffect(() => {
    if (repoId == null && repoOptions.length) {
      setRepoId(Number(repoOptions[0].value));
    }
  }, [repoOptions, repoId]);

  // 手动强制刷新（清空当前仓库缓存并重新拉取）
  const handleRefresh = useCallback(() => {
    if (repoId) {
      branchListCache.delete(repoId);
    }
    setReloadKey((k) => k + 1);
  }, [repoId]);

  // 第一步：拉取仓库全量分支列表（仅在 repoId 改变或手动刷新时触发，带 SWR 内存缓存）
  useEffect(() => {
    if (!repoId) return;

    // 检查缓存
    const cached = branchListCache.get(repoId);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < BRANCH_CACHE_TTL && reloadKey === 0) {
      setAllBranches(cached.branches);
      setBranchPhase('ready');
      return;
    }

    let active = true;
    setBranchPhase('loading');
    setErrorMessage('');

    void (async () => {
      try {
        const raw = await api.listBranches(repoId);
        const parsed = parseBranchList(raw);
        if (!active) return;

        branchListCache.set(repoId, { branches: parsed, fetchedAt: Date.now() });
        setAllBranches(parsed);
        setBranchPhase('ready');
      } catch (error) {
        errorLog('integration-view', error);
        if (active) {
          setBranchPhase('error');
          setErrorMessage(humanizeError(error, '分支列表加载失败'));
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [repoId, reloadKey]);

  // 第二步：纯前端过滤出匹配的分支（名称倒序排序）
  const matchedBranches = useMemo(() => {
    if (!allBranches.length) return [];
    return allBranches
      .filter((branch) => matchPatterns(branch.name, debouncedPatterns))
      .sort((a, b) => b.name.localeCompare(a.name));
  }, [allBranches, debouncedPatterns]);

  // 总页数与当前页重置
  const totalPages = Math.max(1, Math.ceil(matchedBranches.length / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [repoId, debouncedPatterns]);

  // 当前页切片
  const currentPageBranches = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return matchedBranches.slice(start, start + PAGE_SIZE);
  }, [matchedBranches, page]);

  // 第三步：当前页行状态构建与后台渐进式落差比对
  // 借助 generationId 取消已过期的后台比对
  const compareGenRef = useRef(0);

  useEffect(() => {
    if (!repoId || branchPhase !== 'ready') {
      setRows([]);
      return;
    }

    const currentGen = ++compareGenRef.current;
    let active = true;

    const baseBranch = allBranches.find((b) => b.name === debouncedBase);
    const baseSha = baseBranch?.commit?.id ?? baseBranch?.commit?.message ?? 'unknown_base';

    // 1. 同步构建初始行，首屏毫秒级直接上屏
    const initialRows: BranchRowState[] = currentPageBranches.map((branch) => {
      const cacheKey = `${repoId}:${debouncedBase}:${branch.name}`;
      const cached = comparisonCache.get(cacheKey);
      return deriveInitialBranchRow(branch, debouncedBase, baseSha, linkPattern, cached);
    });

    setRows(initialRows);

    // 2. 收集需要后台网络比对的分支（comparing === true）
    const needCompareBranches = currentPageBranches.filter((_, idx) => {
      return Boolean(initialRows[idx]?.comparing);
    });

    if (needCompareBranches.length > 0) {
      void (async () => {
        let cursor = 0;
        const worker = async () => {
          while (cursor < needCompareBranches.length && active && compareGenRef.current === currentGen) {
            const branch = needCompareBranches[cursor++];
            if (!branch) break;

            const branchSha = branch.commit?.id ?? branch.commit?.message ?? 'unknown_branch';
            const cacheKey = `${repoId}:${debouncedBase}:${branch.name}`;

            try {
              const [aheadDiff, behindDiff] = await Promise.all([
                api.compareBranches(repoId, debouncedBase, branch.name),
                api.compareBranches(repoId, branch.name, debouncedBase),
              ]);

              if (!active || compareGenRef.current !== currentGen) return;

              const ahead = comparisonCommits(aheadDiff).length;
              const behind = comparisonCommits(behindDiff).length;

              if (comparisonCache.size > 500) comparisonCache.clear();
              comparisonCache.set(cacheKey, { baseSha, branchSha, ahead, behind });

              setRows((prev) =>
                prev.map((r) =>
                  r.name === branch.name ? { ...r, ahead, behind, comparing: false } : r,
                ),
              );
            } catch {
              if (!active || compareGenRef.current !== currentGen) return;
              setRows((prev) =>
                prev.map((r) =>
                  r.name === branch.name ? { ...r, ahead: null, behind: null, comparing: false } : r,
                ),
              );
            }
          }
        };

        const workers = Array.from(
          { length: Math.min(COMPARE_CONCURRENCY, needCompareBranches.length) },
          () => worker(),
        );
        await Promise.all(workers);
      })();
    }

    return () => {
      active = false;
    };
  }, [currentPageBranches, debouncedBase, repoId, linkPattern, allBranches, branchPhase]);

  // 键盘快捷键翻页：[ 上一页，] 下一页
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === '[') {
        e.preventDefault();
        setPage((p) => Math.max(1, p - 1));
      } else if (e.key === ']') {
        e.preventDefault();
        setPage((p) => Math.min(totalPages, p + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages]);

  const repoName = repoOptions.find((option) => Number(option.value) === repoId)?.label ?? '';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        sticky
        navigation={<SidebarTrigger aria-label="折叠/展开侧栏" />}
        title="集成分支"
        titleClassName="text-sm font-semibold tracking-tight text-foreground"
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="刷新"
            title="重新拉取分支数据"
            onClick={handleRefresh}
          >
            <RefreshCwIcon className={cn(branchPhase === 'loading' && 'animate-spin')} />
          </Button>
        }
        toolbar={
          <>
            <SearchableSelect
              className="w-56 text-xs"
              ariaLabel="切换仓库"
              value={repoId == null ? null : String(repoId)}
              onValueChange={(value) => {
                if (value) setRepoId(Number(value));
              }}
              items={repoOptions}
            />
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
            {branchPhase === 'ready' && (
              <OverflowTooltip
                text={`${repoName} · 命中 ${matchedBranches.length} 条${matchedBranches.length > PAGE_SIZE ? ` (第 ${page}/${totalPages} 页)` : ''}`}
                className="min-w-0 truncate text-xs text-muted-foreground"
              />
            )}
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        {branchPhase === 'loading' && (
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
                <Skeleton
                  className="h-3.5 min-w-0 flex-1 rounded"
                  style={{ width: `${50 + ((key * 13) % 40)}%` }}
                />
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

        {branchPhase === 'error' && (
          <EmptyHint
            icon={FolderIcon}
            title="分支列表加载失败"
            description={errorMessage}
            action={(
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCwIcon data-icon="inline-start" />
                重试
              </Button>
            )}
          />
        )}

        {branchPhase === 'ready' && !matchedBranches.length && (
          <EmptyHint
            icon={FolderIcon}
            title="未匹配到集成分支"
            description={`当前模式「${debouncedPatterns || '（空）'}」没有命中任何分支，可调整上方匹配模式。`}
          />
        )}

        {branchPhase === 'ready' && matchedBranches.length > 0 && (
          <>
            {/* 仓库分组横带（Linear 组头形态） */}
            <div className="flex h-8 items-center gap-2 rounded-md bg-muted/70 px-3">
              <FolderIcon className="size-3.5 text-muted-foreground" />
              <OverflowTooltip text={repoName} className="min-w-0 truncate text-[13px] font-medium" />
              <span className="text-xs text-muted-foreground tabular-nums">
                共 {matchedBranches.length} 条
              </span>
              <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground font-mono">
                <OverflowTooltip
                  text={`基准 ${debouncedBase}`}
                  className="max-w-40 truncate"
                />
                {totalPages > 1 && (
                  <div className="flex items-center gap-1 font-sans">
                    <span className="text-[11px] tabular-nums">
                      {page} / {totalPages}
                    </span>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        title="上一页（快捷键 [）"
                        aria-label="上一页"
                      >
                        <ChevronLeftIcon className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        title="下一页（快捷键 ]）"
                        aria-label="下一页"
                      >
                        <ChevronRightIcon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </span>
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
                const requirementButtons = row.keys.map((key) => {
                  const workitem = items.find(
                    (i) => i.identifier.toUpperCase() === key.toUpperCase(),
                  );
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

                const diverged =
                  row.ahead != null && row.behind != null && (row.ahead > 0 || row.behind > 0);

                return (
                  <div
                    key={row.name}
                    className="group flex h-11 w-full items-center gap-2 rounded-lg px-3 transition-colors hover:bg-muted/60"
                  >
                    <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <OverflowTooltip
                      text={row.name}
                      className="w-64 shrink-0 truncate font-mono text-xs text-foreground"
                    />
                    <OverflowTooltip
                      text={row.commitMessage || '—'}
                      className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground"
                    />

                    {/* 领先 / 落后基准（比对中展示微动画，比对完成即时呈现） */}
                    <span
                      className={cn(
                        'flex w-24 shrink-0 items-center gap-1 text-xs tabular-nums',
                        row.comparing
                          ? 'text-muted-foreground/60'
                          : diverged
                            ? 'text-foreground font-medium'
                            : 'text-muted-foreground',
                      )}
                      title={
                        row.comparing
                          ? '正在比对与基准分支的双向落差...'
                          : row.ahead == null || row.behind == null
                            ? '与基准的比较失败'
                            : diverged
                              ? `领先 ${row.ahead} 个提交 · 落后 ${row.behind} 个提交`
                              : '与基准一致'
                      }
                    >
                      {row.comparing ? (
                        <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/50 animate-pulse">
                          <RefreshCwIcon className="size-2.5 animate-spin" />
                          <span>比对中</span>
                        </span>
                      ) : (
                        <>
                          <ArrowUpIcon className="size-3" />
                          {row.ahead ?? '—'}
                          <ArrowDownIcon className="ml-1 size-3" />
                          {row.behind ?? '—'}
                        </>
                      )}
                    </span>

                    {/* 命中的需求编号：有工作项则可点击进入详情 */}
                    <span className="flex w-28 shrink-0 items-center gap-1 truncate">
                      {requirementButtons.length ? (
                        requirementButtons
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </span>

                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {dayOf(row.committedDate)}
                    </span>

                    <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        className="h-6 text-[11px] px-1.5 text-primary hover:text-primary hover:bg-primary/10"
                        title="AI 生成此分支的发版交付报告 (Release Notes)"
                        onClick={() => setSelectedReleaseBranch(row)}
                      >
                        <SparklesIcon className="size-3 mr-1 text-primary" />
                        交付报告
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 底部导航与说明 */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <p>纯查看视图：比较结果来自云效 Codeup，打包/触发等写操作请前往对应流水线。</p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">
                    第 {page} / {totalPages} 页（共 {matchedBranches.length} 条分支）
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeftIcon className="size-3 mr-0.5" />
                      上一页 [
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      下一页 ]
                      <ChevronRightIcon className="size-3 ml-0.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {branchPhase === 'idle' && !repoOptions.length && (
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

      {/* AI 发版交付报告 (Release Notes) 弹窗 */}
      {selectedReleaseBranch && repoId && (
        <AiReleaseNotesDialog
          open={Boolean(selectedReleaseBranch)}
          onOpenChange={(v) => {
            if (!v) setSelectedReleaseBranch(null);
          }}
          repoId={repoId}
          repoName={repoName}
          branchName={selectedReleaseBranch.name}
          baseBranch={debouncedBase}
          workitemKeys={selectedReleaseBranch.keys}
        />
      )}
    </div>
  );
}
