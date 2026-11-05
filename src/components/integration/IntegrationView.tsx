import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FolderIcon,
  GitBranchIcon,
  RefreshCwIcon,
  SparklesIcon,
} from 'lucide-react';
import { Alert, Button, Chip, Input, ListBox, Pagination, Select, Table, Tooltip } from '@heroui/react';
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
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

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
    <div className="flex flex-col gap-4">
      {/* 页头（sticky 单行）：navigation=侧栏开关｜title=集成分支｜actions=刷新；筛选工具行下放正文 */}
      <PageHeader
        sticky
        navigation={<SidebarTrigger aria-label="折叠/展开侧栏" />}
        title="集成分支"
        titleClassName="text-sm font-semibold tracking-tight text-foreground"
        actions={
          <Tooltip>
            <Button
              variant="ghost"
              isIconOnly
              size="sm"
              aria-label="刷新"
              onPress={handleRefresh}
            >
              <RefreshCwIcon className={cn(branchPhase === 'loading' && 'animate-spin')} />
            </Button>
            <Tooltip.Content>重新拉取分支数据</Tooltip.Content>
          </Tooltip>
        }
      />

      {/* 工具行（自吸顶页头下放正文）：仓库选择 + 基准分支 + 匹配模式 + 命中计数，随页面滚动 */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <Select
            className="w-56 text-xs"
            aria-label="切换仓库"
            placeholder="切换仓库"
            selectedKey={repoId == null ? null : String(repoId)}
            onSelectionChange={(key) => {
              if (key) setRepoId(Number(key));
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {repoOptions.map((option) => (
                  <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                    {option.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Input
            value={base}
            onChange={(event) => setBase(event.target.value)}
            placeholder="基准分支 (如 master)"
            aria-label="基准分支"
            className="h-8 w-28 font-mono text-xs"
          />
          <Input
            value={patterns}
            onChange={(event) => setPatterns(event.target.value)}
            placeholder={DEFAULT_PATTERNS}
            aria-label="集成分支匹配模式"
            className="h-8 w-56 font-mono text-xs"
          />
          {branchPhase === 'ready' && (
            <OverflowTooltip
              text={`${repoName} · 命中 ${matchedBranches.length} 条${matchedBranches.length > PAGE_SIZE ? ` (第 ${page}/${totalPages} 页)` : ''}`}
              className="ml-auto min-w-0 truncate text-xs text-muted-foreground"
            />
          )}
        </div>

        {branchPhase === 'loading' && (
          <div className="flex flex-col gap-1" aria-hidden>
            {[0, 1, 2, 3, 4].map((key) => (
              <div
                key={key}
                className="flex h-11 w-full items-center gap-2 rounded-lg px-4 bg-muted/20"
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
              <Button variant="outline" size="sm" onPress={handleRefresh}>
                <RefreshCwIcon className="size-3.5" />
                <span>重试</span>
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
            {/* 仓库分组（HeroUI Alert）：仓库名 + 命中数 + 基准，分页靠右 */}
            <Alert status="default">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  <OverflowTooltip text={repoName} className="min-w-0 truncate text-[13px]" />
                </Alert.Title>
                <Alert.Description className="flex items-center gap-3 text-xs">
                  <span className="tabular-nums">共 {matchedBranches.length} 条</span>
                  <OverflowTooltip
                    text={`基准 ${debouncedBase}`}
                    className="max-w-40 truncate font-mono"
                  />
                </Alert.Description>
              </Alert.Content>
              {totalPages > 1 && (
                <Pagination size="sm" className="ml-auto shrink-0 self-center font-sans text-muted-foreground">
                  <Pagination.Content>
                    <Pagination.Item>
                      <Tooltip>
                        <Pagination.Previous
                          aria-label="上一页"
                          isDisabled={page <= 1}
                          onPress={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          <Pagination.PreviousIcon />
                        </Pagination.Previous>
                        <Tooltip.Content>上一页（快捷键 [）</Tooltip.Content>
                      </Tooltip>
                    </Pagination.Item>
                    <Pagination.Item>
                      <span className="px-1 text-[11px] tabular-nums">
                        {page} / {totalPages}
                      </span>
                    </Pagination.Item>
                    <Pagination.Item>
                      <Tooltip>
                        <Pagination.Next
                          aria-label="下一页"
                          isDisabled={page >= totalPages}
                          onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                          <Pagination.NextIcon />
                        </Pagination.Next>
                        <Tooltip.Content>下一页（快捷键 ]）</Tooltip.Content>
                      </Tooltip>
                    </Pagination.Item>
                  </Pagination.Content>
                </Pagination>
              )}
            </Alert>

            {/* 分支表格（HeroUI Table）：严格组件默认样式（secondary 变体自带分隔线/悬停/排印），不复写组件 CSS */}
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="集成分支列表">
                  <Table.Header>
                    <Table.Column isRowHeader>分支</Table.Column>
                    <Table.Column>最新提交</Table.Column>
                    <Table.Column>基准对比</Table.Column>
                    <Table.Column>关联需求</Table.Column>
                    <Table.Column className="text-end">提交日期</Table.Column>
                    <Table.Column>操作</Table.Column>
                  </Table.Header>

                  <Table.Body>
                    {rows.map((row) => {
                      const requirementButtons = row.keys.map((key) => {
                        const workitem = items.find(
                          (i) => i.identifier.toUpperCase() === key.toUpperCase(),
                        );
                        if (!workitem) {
                          return (
                            <Chip key={key} size="sm" variant="soft" className="font-mono">
                              {key}
                            </Chip>
                          );
                        }
                        return (
                          <Chip
                            key={key}
                            size="sm"
                            variant="soft"
                            color={workitem.workitemId === drawerWorkitemId ? 'accent' : 'default'}
                            className="cursor-pointer font-mono"
                            onClick={() => {
                              setDrawerWorkitemId(workitem.workitemId);
                              void useApp.getState().select(workitem.workitemId);
                            }}
                          >
                            {key}
                          </Chip>
                        );
                      });

                      const diverged =
                        row.ahead != null && row.behind != null && (row.ahead > 0 || row.behind > 0);

                      const compareTooltip = row.comparing
                        ? '正在比对与基准分支的双向落差...'
                        : row.ahead == null || row.behind == null
                          ? '与基准的比较失败'
                          : diverged
                            ? `领先 ${row.ahead} 个提交 · 落后 ${row.behind} 个提交`
                            : '与基准一致';

                      return (
                        <Table.Row key={row.name} className="group">
                          <Table.Cell>
                            <div className="flex items-center gap-2 font-mono">
                              <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                              <OverflowTooltip text={row.name} />
                            </div>
                          </Table.Cell>

                          <Table.Cell>
                            <OverflowTooltip
                              text={row.commitMessage || '—'}
                              className="text-muted-foreground"
                            />
                          </Table.Cell>

                          {/* 领先 / 落后基准（比对中展示微动画，比对完成即时呈现） */}
                          <Table.Cell>
                            <Tooltip>
                              <span
                                className={cn(
                                  'flex items-center gap-1 tabular-nums',
                                  row.comparing
                                    ? 'text-muted-foreground/60'
                                    : diverged
                                      ? 'text-foreground font-medium'
                                      : 'text-muted-foreground',
                                )}
                              >
                                {row.comparing ? (
                                  <span className="flex items-center gap-1 animate-pulse">
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
                              <Tooltip.Content>{compareTooltip}</Tooltip.Content>
                            </Tooltip>
                          </Table.Cell>

                          {/* 命中的需求编号：有工作项则可点击进入详情 */}
                          <Table.Cell>
                            <span className="flex items-center gap-1">
                              {requirementButtons.length ? (
                                requirementButtons
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </span>
                          </Table.Cell>

                          <Table.Cell className="text-end">
                            <span className="text-muted-foreground tabular-nums">
                              {dayOf(row.committedDate)}
                            </span>
                          </Table.Cell>

                          <Table.Cell>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <Tooltip>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onPress={() => setSelectedReleaseBranch(row)}
                                >
                                  <SparklesIcon className="size-3 text-primary" />
                                  <span>交付报告</span>
                                </Button>
                                <Tooltip.Content>AI 生成此分支的发版交付报告 (Release Notes)</Tooltip.Content>
                              </Tooltip>
                            </div>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>

            {/* 底部导航与说明 */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <p>纯查看视图：比较结果来自云效 Codeup，打包/触发等写操作请前往对应流水线。</p>
              {totalPages > 1 && (
                <Pagination size="sm" className="text-muted-foreground">
                  <Pagination.Summary className="tabular-nums">
                    第 {page} / {totalPages} 页（共 {matchedBranches.length} 条分支）
                  </Pagination.Summary>
                  <Pagination.Content>
                    <Pagination.Item>
                      <Pagination.Previous
                        aria-label="上一页（快捷键 [）"
                        isDisabled={page <= 1}
                        onPress={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <Pagination.PreviousIcon />
                      </Pagination.Previous>
                    </Pagination.Item>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <Pagination.Item key={p}>
                        <Pagination.Link isActive={p === page} onPress={() => setPage(p)}>
                          {p}
                        </Pagination.Link>
                      </Pagination.Item>
                    ))}
                    <Pagination.Item>
                      <Pagination.Next
                        aria-label="下一页（快捷键 ]）"
                        isDisabled={page >= totalPages}
                        onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        <Pagination.NextIcon />
                      </Pagination.Next>
                    </Pagination.Item>
                  </Pagination.Content>
                </Pagination>
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
