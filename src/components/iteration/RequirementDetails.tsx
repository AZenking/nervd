import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftIcon, CalendarIcon, CheckIcon, ChevronRightIcon, CopyIcon, DatabaseIcon,
  ExternalLinkIcon, GitBranchIcon, InboxIcon, Loader2Icon, Maximize2Icon, MousePointerClickIcon, PencilIcon, PlusIcon, RefreshCwIcon, SparklesIcon, UserIcon, XIcon,
} from 'lucide-react';
import { findRemoteBranch } from '@/lib/iteration-branches';
import { useFusedBranchTemplates } from '@/lib/iteration-templates';
import { errorLog, humanizeError } from '@/lib/error-format';
import { aiRecommendRepositories } from '@/lib/ai-api';
import type { AiRepoRecommendation } from '@/types/ai';
import type { WorkitemChild } from '@/lib/api';
import { openWorkitemInYunxiao } from '@/lib/yunxiao-link';
import { probeRepoSignalHits, repoSignalScores } from '@/lib/repo-signals';
import { cn } from '@/lib/utils';
import { useRecentTracker } from '@/hooks/use-recent-tracker';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { CATEGORY_LABELS, type Category } from '@/types';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchableSelect, type SearchableSelectOption } from '../searchable-select';
import { PageHeader, STICKY_PAGE_HEADER_CLASS } from '../page-header';
import { AppBreadcrumb } from '../nav/app-breadcrumb';
import { EmptyHint } from '../empty-hint';
import { OverflowTooltip } from '../overflow-tooltip';
import type { BranchSyncRepo } from './BranchStateDiagram';
import { RichDescription } from './rich-description';
import { ChildDetailDrawer } from './child-detail-drawer';
import { SectionHeader } from '../section-header';
import { StatusIcon } from '../status-icon';
import {
  resolveRepoBranchRule,
  type IterationBaselineCheck,
  type RequirementDetailsProps,
  type ResolvedRepoBranchRule,
} from './requirement/types';
import { RequirementDetailsSkeleton } from './requirement/requirement-skeleton';
import { ChildrenCard } from './requirement/children-card';
import { LinkedRepoCard } from './requirement/linked-repo-card';
import { DetailAssigneePopover, DetailStatusPopover, RequirementProperties } from './requirement/requirement-properties';
import { RequirementActivity } from './requirement/requirement-activity';

export { RequirementDetailsSkeleton };
export type { RequirementDetailsProps };

/**
 * 单栏窄窗口扩展 props（IterationView 在 < SINGLE_COLUMN_WORKSPACE_WIDTH 时传入）：
 * 提供顶部「返回列表」入口，点击后由父组件收起详情态并恢复全宽列表现场。
 * 独立扩展接口而不改 requirement/types.ts，保持原契约文件不动。
 */
export interface RequirementDetailsBackToListProps {
  onBackToList?: () => void;
}

/** 分支同步状态图（教学用静态图）：默认折叠，展开时才加载 React Flow 代码（lazy chunk） */
const BranchStateDiagram = lazy(() => import('./BranchStateDiagram'));
/** 两段式仓库推荐：默认云效仓库池至少给出这么多条高置信结果即收手，不再扩到其他仓库 */
const MIN_SUFFICIENT_REPOS = 1;

/** 需求/工作项详情（1:1 对齐 Linear 工具风格） */
export function RequirementDetails({
  embedded = false,
  parentWorkitem,
  onOpenWorkbench,
  onClose,
  onSelectChild,
  onSelectParent,
  onBackToList,
}: RequirementDetailsProps & RequirementDetailsBackToListProps = {}) {
  const {
    selectedId, detail, comments, children, childrenError, childrenDebug, loadingDetail, items, settings, repositories,
    iterations, trace, traceLoading, currentUser,
    saveWorkitemRepos, saveWorkitemRepoBranchTemplate, setToast, reloadCurrentDetail, loadTrace,
  } = useApp();
  const allowWrite = settings?.allowWriteOps ?? false;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingCodeArea, setRefreshingCodeArea] = useState(false);
  const [codeAreaRefreshSignal, setCodeAreaRefreshSignal] = useState(0);
  const [isEditingDesc, setIsEditingDesc] = useState(false);

  useEffect(() => {
    setIsEditingDesc(false);
  }, [selectedId]);

  const handleRefreshDetail = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await reloadCurrentDetail();
      if (result.status === 'success') {
        setToast({ text: '工作项已更新至最新状态', kind: 'ok' });
      } else if (result.status === 'partial') {
        setToast({ text: `工作项已部分更新：${result.errors.join('；')}`, kind: 'info' });
      } else {
        setToast({ text: `刷新失败：${result.errors.join('；')}`, kind: 'fail' });
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshCodeArea = async () => {
    if (refreshingCodeArea || traceLoading) return;
    setRefreshingCodeArea(true);
    try {
      setCodeAreaRefreshSignal((s) => s + 1);
      setBaselineRetry((v) => v + 1);
      const result = await loadTrace();
      if (result.status === 'success') {
        setToast({ text: '已刷新关联仓库的分支、提交与合并请求', kind: 'ok' });
      } else if (result.status === 'partial') {
        setToast({ text: `追溯数据已部分更新：${result.errors.join('；')}`, kind: 'info' });
      } else {
        setToast({ text: `刷新失败：${result.errors.join('；')}`, kind: 'fail' });
      }
    } catch (e) {
      errorLog('repo-code-refresh', e);
      setToast({ text: `刷新失败：${humanizeError(e)}`, kind: 'fail' });
    } finally {
      setRefreshingCodeArea(false);
    }
  };

  const { openWorkitem, chain } = useUi();
  const currentCrumb = chain[chain.length - 1];
  const parentCrumb = chain.length > 1 ? chain[0] : null;
  const parent = parentWorkitem ?? parentCrumb;

  const cur = items.find((i) => i.workitemId === selectedId);
  const childFromStore = children.find((c) => c.workitemId === selectedId);
  const wi = (detail?.workitem ?? detail ?? {}) as Record<string, unknown>;

  const identifier = (typeof wi.identifier === 'string' && wi.identifier)
    || (typeof wi.serialNumber === 'string' && wi.serialNumber)
    || childFromStore?.identifier
    || (currentCrumb?.workitemId === selectedId ? currentCrumb.identifier : '')
    || cur?.identifier
    || '';

  const subject = (typeof wi.subject === 'string' && wi.subject)
    || (typeof wi.name === 'string' && wi.name)
    || childFromStore?.subject
    || (currentCrumb?.workitemId === selectedId ? currentCrumb.subject : '')
    || cur?.subject
    || '';

  const category = (typeof wi.category === 'string' && wi.category)
    || childFromStore?.category
    || cur?.category
    || (parent ? 'Task' : 'Req');

  const isRequirement = category === 'Req';
  const subtasks = isRequirement ? children.filter((c) => c.category !== 'Bug') : [];
  const defects = isRequirement ? children.filter((c) => c.category === 'Bug') : [];

  const statusName = (typeof wi.status === 'string' && wi.status)
    || (wi.status && typeof wi.status === 'object' && typeof (wi.status as any).name === 'string' ? (wi.status as any).name : '')
    || childFromStore?.status
    || cur?.status
    || '';

  const statusId = (typeof wi.statusId === 'string' && wi.statusId)
    || (wi.status && typeof wi.status === 'object' && typeof (wi.status as any).id === 'string' ? (wi.status as any).id : '')
    || childFromStore?.statusId
    || cur?.statusId
    || undefined;

  const assignedToName = (typeof wi.assignedTo === 'string' && wi.assignedTo)
    || (wi.assignedTo && typeof wi.assignedTo === 'object' && typeof (wi.assignedTo as any).name === 'string' ? (wi.assignedTo as any).name : '')
    || childFromStore?.assignedTo
    || cur?.assignedTo
    || '';

  const parentAssigneeId = (wi.assignedTo && typeof wi.assignedTo === 'object'
    ? (typeof (wi.assignedTo as any).identifier === 'string' ? (wi.assignedTo as any).identifier
      : typeof (wi.assignedTo as any).id === 'string' ? (wi.assignedTo as any).id
      : typeof (wi.assignedTo as any).userId === 'string' ? (wi.assignedTo as any).userId : undefined)
    : (typeof wi.assignedTo === 'string' && wi.assignedTo ? wi.assignedTo : undefined))
    || (wi.creator && typeof wi.creator === 'object'
      ? (typeof (wi.creator as any).identifier === 'string' ? (wi.creator as any).identifier
        : typeof (wi.creator as any).id === 'string' ? (wi.creator as any).id : undefined)
      : (typeof wi.creator === 'string' && wi.creator ? wi.creator : undefined));

  // 汇总候选处理人：当前登录用户、父需求负责人、创建人、参与人、已有子项负责人及当前迭代成员
  const candidateAssignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role?: string }>();
    if (currentUser?.id && currentUser?.name) {
      map.set(currentUser.id, { id: currentUser.id, name: currentUser.name, role: '当前用户' });
    }
    if (parentAssigneeId && assignedToName) {
      map.set(parentAssigneeId, { id: parentAssigneeId, name: assignedToName, role: '需求负责人' });
    }
    const creator = (wi.creator ?? {}) as Record<string, unknown>;
    const creatorId = typeof creator.id === 'string' ? creator.id
      : typeof creator.identifier === 'string' ? creator.identifier : undefined;
    const creatorName = typeof creator.name === 'string' ? creator.name
      : typeof creator.displayName === 'string' ? creator.displayName : undefined;
    if (creatorId && creatorName && !map.has(creatorId)) {
      map.set(creatorId, { id: creatorId, name: creatorName, role: '创建人' });
    }
    if (Array.isArray(wi.participants)) {
      for (const p of wi.participants as Record<string, unknown>[]) {
        const pid = typeof p.id === 'string' ? p.id : typeof p.identifier === 'string' ? p.identifier : '';
        const pname = typeof p.name === 'string' ? p.name : typeof p.displayName === 'string' ? p.displayName : '';
        if (pid && pname && !map.has(pid)) {
          map.set(pid, { id: pid, name: pname, role: '参与人' });
        }
      }
    }
    for (const c of children) {
      if (c.assignedTo && !map.has(c.assignedTo)) {
        map.set(c.assignedTo, { id: c.assignedTo, name: c.assignedTo, role: '成员' });
      }
    }
    for (const it of items) {
      const id = it.assignedToId || it.assignedTo;
      const name = it.assignedTo || it.assignedToId;
      if (id && name && !map.has(id)) {
        map.set(id, { id, name, role: '项目成员' });
      }
      if (it.creatorId && it.creator && !map.has(it.creatorId)) {
        map.set(it.creatorId, { id: it.creatorId, name: it.creator, role: '项目成员' });
      }
    }
    return Array.from(map.values());
  }, [currentUser, parentAssigneeId, assignedToName, wi, children, items]);

  const spaceName = (typeof wi.spaceName === 'string' && wi.spaceName)
    || (wi.space && typeof wi.space === 'object' && typeof (wi.space as any).name === 'string' ? (wi.space as any).name : '')
    || cur?.spaceName
    || '';

  const spaceId = (wi.space && typeof wi.space === 'object' && typeof (wi.space as any).id === 'string' ? (wi.space as any).id : '')
    || (wi.space && typeof wi.space === 'object' && typeof (wi.space as any).identifier === 'string' ? (wi.space as any).identifier : '')
    || (typeof wi.spaceId === 'string' && wi.spaceId)
    || (typeof wi.projectId === 'string' && wi.projectId)
    || settings?.defaultSpaceIdentifier
    || '';

  // 持续检视停留 30s+ 自动收录为「最近查看」
  useRecentTracker({
    workitemId: selectedId,
    identifier,
    subject,
    category,
    status: statusName,
    spaceName,
  });

  const handleOpenInYunxiao = () => {
    void openWorkitemInYunxiao({
      workitemId: selectedId,
      spaceIdentifier: spaceId,
      category,
      organizationId: settings?.organizationId,
    });
  };

  const updatedAt = (typeof wi.gmtModified === 'string' && wi.gmtModified)
    || (typeof wi.updatedAt === 'string' && wi.updatedAt)
    || childFromStore?.gmtModified
    || cur?.updatedAt
    || '';

  const hasRepoOverride = selectedId != null && Object.prototype.hasOwnProperty.call(settings?.workitemRepos ?? {}, selectedId);
  const effectiveRepoIds = hasRepoOverride
    ? settings?.workitemRepos[selectedId!] ?? []
    : settings?.watchedRepos ?? [];
  const [linkDraft, setLinkDraft] = useState('');
  const [linkDraftTemplateId, setLinkDraftTemplateId] = useState('');
  const [savingRepos, setSavingRepos] = useState(false);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const [recommendingRepos, setRecommendingRepos] = useState(false);
  const [recommendedRepos, setRecommendedRepos] = useState<AiRepoRecommendation[]>([]);

  // 子工作项/缺陷详情侧滑抽屉（Linear Peek 机制）：免刷新浏览，保留父需求完整上下文与列表焦点
  const [drawerChild, setDrawerChild] = useState<WorkitemChild | null>(null);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const latestDrawerChild = drawerChild
    ? children.find((child) => child.workitemId === drawerChild.workitemId) ?? drawerChild
    : null;

  useEffect(() => {
    setDrawerChild(null);
    setActiveChildId(null);
    setRecommendedRepos([]);
  }, [selectedId]);

  const copyIdentifier = () => {
    if (!identifier) return;
    void navigator.clipboard.writeText(identifier);
    setCopiedId(true);
    setToast({ text: `已复制编号 ${identifier}`, kind: 'ok' });
    setTimeout(() => setCopiedId(false), 2000);
  };

  const sprint = wi.sprint && typeof wi.sprint === 'object'
    ? wi.sprint as Record<string, unknown>
    : {};
  const sprintId = cur?.sprintId || (typeof sprint.id === 'string' ? sprint.id : '');
  const iterationId = isRequirement && sprintId && !sprintId.startsWith('placeholder-')
    ? sprintId
    : undefined;
  const placeholderIteration = Boolean(isRequirement && sprintId.startsWith('placeholder-'));
  const iterationName = iterationId
    ? iterations.find((iteration) => iteration.id === iterationId)?.name
      || cur?.sprintName
      || (typeof sprint.name === 'string' ? sprint.name : '')
    : (cur?.sprintName || (typeof sprint.name === 'string' ? sprint.name : ''));
  const fusedTemplates = useFusedBranchTemplates(iterationId);
  const repoBranchRules: Record<number, ResolvedRepoBranchRule> = iterationId && selectedId
    ? Object.fromEntries(effectiveRepoIds.flatMap((repoId) => {
      const rule = resolveRepoBranchRule(settings, selectedId, repoId, iterationName, identifier, fusedTemplates);
      return rule ? [[repoId, rule]] : [];
    }))
    : {};
  const baselineLookups = iterationId
    ? effectiveRepoIds.flatMap((repoId) => {
      const rule = repoBranchRules[repoId];
      return rule?.baselineBranch.trim() ? [{ repoId, branch: rule.baselineBranch.trim() }] : [];
    })
    : [];
  const baselineLookupKey = JSON.stringify(baselineLookups);
  const [baselineChecks, setBaselineChecks] = useState<Record<number, IterationBaselineCheck>>({});
  const [baselineRetry, setBaselineRetry] = useState(0);

  useEffect(() => {
    if (!iterationId) {
      setBaselineChecks({});
      return;
    }
    let active = true;
    const initial: Record<number, IterationBaselineCheck> = {};
    for (const lookup of baselineLookups) {
      initial[lookup.repoId] = { branch: lookup.branch, state: 'loading' };
    }
    setBaselineChecks(initial);
    void Promise.all(baselineLookups.map(async ({ repoId, branch }) => {
      try {
        const remote = await findRemoteBranch(repoId, branch);
        return [repoId, remote
          ? { branch, state: 'exists' as const }
          : { branch, state: 'missing' as const }] as const;
      } catch (error) {
        return [repoId, { branch, state: 'error' as const, error: humanizeError(error) }] as const;
      }
    })).then((results) => {
      if (active) setBaselineChecks(Object.fromEntries(results));
    });
    return () => { active = false; };
  }, [iterationId, baselineLookupKey, baselineRetry]);

  const configuredBaselineCount = iterationId ? Object.keys(repoBranchRules).length : 0;
  const iterationBranchValue = !isRequirement
    ? '—'
    : !sprintId
      ? '未关联迭代'
      : !configuredBaselineCount
        ? '未选择模板'
        : configuredBaselineCount === effectiveRepoIds.length && effectiveRepoIds.length === 1
          ? repoBranchRules[effectiveRepoIds[0]].templateName
          : configuredBaselineCount + ' 个仓库已选择模板';

  if (!selectedId) {
    return (
      <EmptyHint
        icon={MousePointerClickIcon}
        title="未选择工作项"
        description="在侧栏「迭代」分组或迭代页工作项卡片中选择一项以查看详情"
        className={embedded ? 'py-16' : 'mt-16'}
      />
    );
  }
  if (loadingDetail) {
    return <RequirementDetailsSkeleton embedded={embedded} />;
  }

  const linkedRepos = repositories.filter((r) => effectiveRepoIds.includes(r.id));
  const branchesByRepoId = new Map(
    (trace?.repositories ?? []).map((repository) =>
      [repository.repoId, repository.branches.map((branch) => branch.name)] as const,
    ),
  );
  const mergeRequestsByRepoId = new Map(
    (trace?.repositories ?? []).map((repository) =>
      [repository.repoId, repository.mergeRequests] as const,
    ),
  );

  // 分支同步状态图数据：有模板规则的仓库（开发分支未匹配到时也出占位节点，与行内 BranchDivergenceCheck 同源）
  const syncDiagramRepos: BranchSyncRepo[] = isRequirement && iterationId
    ? linkedRepos.flatMap((repo) => {
        const rule = repoBranchRules[repo.id];
        if (!rule) return [];
        const branches = branchesByRepoId.get(repo.id) ?? [];
        const baselineCheck = baselineChecks[repo.id];
        const baselineState = baselineCheck?.branch === rule.baselineBranch ? baselineCheck.state : 'loading';
        const base = {
          key: `${repo.id}`,
          repoId: repo.id,
          repoName: repo.pathWithNamespace || repo.name,
          sourceBranch: rule.sourceBranch,
          baselineBranch: rule.baselineBranch,
          baselineState,
        };
        if (!branches.length) return [base];
        return branches.map((branch) => ({ ...base, key: `${repo.id}:${branch}`, developmentBranch: branch }));
      })
    : [];

  const linkRepository = () => {
    if (!selectedId || !linkDraft) return;
    const repo = repositories.find((r) => (r.pathWithNamespace || r.name) === linkDraft);
    if (!repo || effectiveRepoIds.includes(repo.id)) return;
    setSavingRepos(true);
    void (async () => {
      let repoLinked = false;
      try {
        await saveWorkitemRepos(selectedId, [...effectiveRepoIds, repo.id]);
        repoLinked = true;
        if (iterationId && linkDraftTemplateId) {
          await saveWorkitemRepoBranchTemplate(selectedId, repo.id, linkDraftTemplateId);
        }
        setToast({ text: `已关联云效仓库 ${linkDraft}${linkDraftTemplateId ? ' 并应用分支模板' : ''}`, kind: 'ok' });
        setLinkDraft('');
        setLinkDraftTemplateId('');
        setShowAddRepo(false);
      } catch (error) {
        setToast({
          text: (repoLinked ? '仓库已关联，但分支模板保存失败' : '云效仓库关联保存失败') + '：' + humanizeError(error),
          kind: 'fail',
        });
      } finally {
        setSavingRepos(false);
      }
    })();
  };

  const handleRecommendRepos = async () => {
    if (recommendingRepos) return;
    setRecommendingRepos(true);
    try {
      const watched = settings?.watchedRepos ?? [];
      const watchedSet = new Set(watched);
      const unlinked = repositories.filter((r) => !effectiveRepoIds.includes(r.id));
      const descriptionText = typeof wi.description === 'string'
        ? wi.description
        : typeof wi.content === 'string' ? wi.content : '';
      const selectedRow = items.find((item) => item.workitemId === selectedId);
      // 共现只统计真正同迭代（sprint）的工作项；store.items 是全量已加载列表
      const iterationItems = selectedRow?.sprintId
        ? items.filter((item) => item.sprintId === selectedRow.sprintId)
        : items;
      const watchedPool = unlinked.filter((r) => watchedSet.has(r.id));
      // trace 只覆盖已关联仓库：默认仓库池现扫分支/作者，让信号 1/4 对候选真正生效
      const probes = watchedPool.length > 0
        ? await probeRepoSignalHits({
            repositories: watchedPool,
            identifier,
            linkPattern: settings?.linkPattern ?? '',
            assigneeName: selectedRow?.assignedTo,
          })
        : undefined;
      const signals = repoSignalScores({
        repositories: unlinked,
        settings,
        items: iterationItems,
        currentWorkitemId: selectedId,
        assigneeName: selectedRow?.assignedTo,
        trace,
        probes,
      });
      const scoreOf = (repoId: number) => signals.get(repoId)?.score ?? 0;
      // 候选排序：确定性信号（追溯/处理人/共现/CI）优先，同分时默认云效仓库优先
      const ranked = [...unlinked].sort((a, b) => scoreOf(b.id) - scoreOf(a.id)
        || Number(watchedSet.has(b.id)) - Number(watchedSet.has(a.id)));
      const ask = (list: typeof unlinked) => aiRecommendRepositories({
        subject,
        description: descriptionText,
        availableRepos: list.map((r) => ({
          id: r.id,
          name: r.pathWithNamespace || r.name,
          description: [
            watchedSet.has(r.id) ? '默认云效仓库（团队主战场，优先考虑）' : '',
            signals.get(r.id)?.reasons.join('；') ?? '',
            'description' in r && typeof r.description === 'string' ? r.description : '',
          ].filter(Boolean).join('；') || undefined,
        })),
      });

      // 两段式：先只在默认云效仓库中找；充分（数量达标且全为高置信）即收手，否则再扩到其余仓库
      const watchedRanked = ranked.filter((r) => watchedSet.has(r.id));
      const primary = watchedRanked.length > 0 ? await ask(watchedRanked) : [];
      const primarySufficient = primary.length >= MIN_SUFFICIENT_REPOS
        && primary.every((r) => r.confidence === 'high');
      let res = primary;
      if (!primarySufficient) {
        const seen = new Set(primary.map((r) => r.repoId));
        const rest = ranked.filter((r) => !watchedSet.has(r.id) && !seen.has(r.id));
        if (rest.length > 0) res = [...primary, ...await ask(rest)];
      }
      // 默认云效仓库排前，同组内按确定性信号分排序，最多 3 个
      setRecommendedRepos(
        [...res]
          .sort((a, b) => Number(watchedSet.has(b.repoId)) - Number(watchedSet.has(a.repoId))
            || scoreOf(b.repoId) - scoreOf(a.repoId))
          .slice(0, 3),
      );
      setShowAddRepo(true);
      if (res.length === 0) {
        setToast({ text: '未找到明显匹配的代码仓库，请手动选择关联', kind: 'info' });
      } else if (primarySufficient) {
        setToast({ text: `AI 在默认云效仓库中推荐了 ${res.length} 个高置信仓库`, kind: 'ok' });
      } else {
        setToast({ text: `AI 为您推荐了 ${res.length} 个相关代码仓库（含默认云效仓库优先命中）`, kind: 'ok' });
      }
    } catch (err) {
      setToast({ text: `AI 推荐仓库失败：${humanizeError(err)}`, kind: 'fail' });
    } finally {
      setRecommendingRepos(false);
    }
  };

  const handleQuickLinkRepo = async (repoId: number) => {
    if (!selectedId || effectiveRepoIds.includes(repoId)) return;
    const repo = repositories.find((r) => r.id === repoId);
    if (!repo) return;
    setSavingRepos(true);
    let repoLinked = false;
    try {
      await saveWorkitemRepos(selectedId, [...effectiveRepoIds, repo.id]);
      repoLinked = true;
      const tId = fusedTemplates[0]?.id;
      if (iterationId && tId) {
        await saveWorkitemRepoBranchTemplate(selectedId, repo.id, tId);
      }
      setToast({ text: `已成功关联仓库 ${repo.pathWithNamespace || repo.name}`, kind: 'ok' });
      setRecommendedRepos((prev) => prev.filter((r) => r.repoId !== repoId));
    } catch (error) {
      setToast({
        text: (repoLinked ? '仓库已关联，但分支模板保存失败' : '云效仓库关联保存失败') + '：' + humanizeError(error),
        kind: 'fail',
      });
    } finally {
      setSavingRepos(false);
    }
  };

  const saveRepoTemplate = async (repoId: number, templateId: string | null) => {
    if (!selectedId) return;
    try {
      await saveWorkitemRepoBranchTemplate(selectedId, repoId, templateId);
      setToast({ text: templateId ? '已为此需求仓库应用分支模板' : '已清除此需求仓库的分支模板', kind: 'ok' });
      setBaselineRetry((value) => value + 1);
    } catch (error) {
      errorLog('branch-template-save', error);
      setToast({ text: `保存分支模板选择失败：${humanizeError(error)}`, kind: 'fail' });
    }
  };

  const unlinkRepo = (repoId: number) => {
    if (!selectedId) return;
    setSavingRepos(true);
    const nextRepoIds = effectiveRepoIds.filter((id) => id !== repoId);
    void saveWorkitemRepos(selectedId, nextRepoIds)
      .then(() => setToast({ text: '已取消关联云效仓库', kind: 'ok' }))
      .catch((e) => {
        errorLog('repo-unlink', e);
        setToast({ text: `取消关联云效仓库失败：${humanizeError(e)}`, kind: 'fail' });
      })
      .finally(() => setSavingRepos(false));
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {embedded ? (
        <PageHeader
          density="compact"
          className="sticky top-0 z-20 shrink-0 border-b border-border/70 bg-popover/95 px-5 pt-7 pb-3 backdrop-blur-sm"
          navigation={onBackToList || parent ? (
            <>
              {onBackToList && (
                <>
                  <Button
                    variant="ghost"
                    size="xs"
                    data-testid="back-to-list"
                    className="shrink-0 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={onBackToList}
                    title="返回列表 (Esc)"
                    aria-label="返回列表"
                  >
                    <ArrowLeftIcon className="size-3.5" />
                    <span>返回列表</span>
                  </Button>
                  <span className="h-3.5 w-px shrink-0 bg-border/70" aria-hidden />
                </>
              )}
              {parent && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-6 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => {
                    if (onSelectParent) onSelectParent(parent.workitemId);
                    else openWorkitem(parent.workitemId, parent);
                  }}
                  title={`返回父需求 ${parent.identifier}`}
                >
                  <ArrowLeftIcon className="size-3.5" />
                </Button>
              )}
            </>
          ) : undefined}
          title={(
            <span className="flex min-w-0 items-center gap-2.5">
              <StatusIcon status={statusName} className="size-4 shrink-0" />
              {identifier && (
                <button
                  type="button"
                  onClick={copyIdentifier}
                  className="group inline-flex shrink-0 items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                  title="点击复制编号"
                >
                  <span>{identifier}</span>
                  {copiedId ? <CheckIcon className="size-3 text-sig-ok" /> : <CopyIcon className="size-3 text-muted-foreground group-hover:text-foreground" />}
                </button>
              )}
              <OverflowTooltip
                text={subject}
                className="min-w-0 truncate text-base font-semibold text-foreground"
              />
            </span>
          )}
          titleClassName="flex min-w-0 items-center gap-2.5 select-text cursor-text"
          actions={(
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => void handleRefreshDetail()}
                title="刷新当前工作项（含讨论、子任务与追溯）"
                aria-label="刷新工作项"
              >
                <RefreshCwIcon className={cn('size-3.5', (refreshing || traceLoading) && 'animate-spin')} />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleOpenInYunxiao}
                title="在云效中打开"
                aria-label="在云效中打开"
              >
                <ExternalLinkIcon className="size-3.5" />
              </Button>
              {onOpenWorkbench && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onOpenWorkbench}
                  title="在工作台全屏打开"
                  aria-label="在工作台全屏打开"
                >
                  <Maximize2Icon className="size-3.5" />
                </Button>
              )}
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onClose}
                  title="关闭分栏 (Esc)"
                  aria-label="关闭分栏 (Esc)"
                >
                  <XIcon className="size-3.5" />
                </Button>
              )}
            </>
          )}
        />
      ) : (
        <PageHeader
          breadcrumb={<AppBreadcrumb />}
          title={(
            <span className="flex min-w-0 items-center gap-2.5">
              <StatusIcon status={statusName} className="size-4 shrink-0" />
              <OverflowTooltip
                text={subject}
                className="min-w-0 truncate text-xl sm:text-2xl font-semibold tracking-tight text-foreground"
              />
            </span>
          )}
          titleBadge={identifier ? (
            <button
              type="button"
              onClick={copyIdentifier}
              className="group inline-flex items-center gap-1.5 rounded-md bg-muted/70 px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              title="点击复制编号"
            >
              <span>{identifier}</span>
              {copiedId ? <CheckIcon className="size-3 text-sig-ok" /> : <CopyIcon className="size-3 text-muted-foreground group-hover:text-foreground" />}
            </button>
          ) : undefined}
          titleClassName="text-2xl font-semibold tracking-tight"
          actions={(
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenInYunxiao}
                className="gap-1.5"
                title="在云效中打开"
              >
                <ExternalLinkIcon className="size-3.5" />
                <span>在云效中打开</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRefreshDetail()}
                className="gap-1.5"
                title="刷新当前工作项（含讨论、子任务与追溯）"
              >
                <RefreshCwIcon className={cn('size-3.5', (refreshing || traceLoading) && 'animate-spin')} />
                <span>刷新详情</span>
              </Button>
            </div>
          )}
          className={STICKY_PAGE_HEADER_CLASS}
        />
      )}

      {/* 嵌入分栏模式下的紧凑元数据条（替代占用整列的右属性栏，释放横向空间） */}
      {embedded && (
        <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/50 bg-muted/20 px-5 py-2 text-xs text-muted-foreground">
          <DetailStatusPopover
            status={statusName}
            statusId={statusId}
            workitemId={selectedId ?? undefined}
            variant="badge"
          />
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <UserIcon className="size-3.5 text-muted-foreground" />
            <DetailAssigneePopover
              assignedToName={assignedToName}
              workitemId={selectedId}
              candidateAssignees={candidateAssignees}
              variant="cell"
            />
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            <span className="text-foreground">{iterationName || '未关联迭代'}</span>
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <DatabaseIcon className="size-3.5 text-muted-foreground" />
            <span>{effectiveRepoIds.length} 个仓库</span>
          </div>
          <Collapsible className="ml-auto">
            <CollapsibleTrigger className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              更多属性
              <ChevronRightIcon className="ml-1 inline-block size-3 transition-transform group-data-panel-open/collapsible:rotate-90" />
            </CollapsibleTrigger>
            <CollapsibleContent className="absolute right-5 z-30 mt-2 flex min-w-64 flex-col gap-2 rounded-lg border border-border/70 bg-popover p-3 text-xs text-muted-foreground shadow-level-2">
              <div className="flex items-center justify-between gap-3">
                <span>类型</span>
                <span className="text-foreground">{category in CATEGORY_LABELS ? CATEGORY_LABELS[category as Category] : category}</span>
              </div>
              {parent && (
                <div className="flex items-center justify-between gap-3">
                  <span>父需求</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectParent) onSelectParent(parent.workitemId);
                      else openWorkitem(parent.workitemId, parent);
                    }}
                    className="font-mono text-primary hover:underline cursor-pointer"
                  >
                    {parent.identifier}
                  </button>
                </div>
              )}
              {spaceName && (
                <div className="flex items-center justify-between gap-3">
                  <span>空间</span>
                  <span className="text-foreground">{spaceName}</span>
                </div>
              )}
              {updatedAt && (
                <div className="flex items-center justify-between gap-3 font-mono">
                  <span className="font-sans">更新时间</span>
                  <span className="text-foreground">{String(updatedAt).slice(0, 16).replace('T', ' ')}</span>
                </div>
              )}
              {iterationBranchValue && iterationBranchValue !== '—' && (
                <div className="flex items-center justify-between gap-3">
                  <span>迭代基准</span>
                  <span className="min-w-0 break-all text-right font-mono text-foreground">{iterationBranchValue}</span>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* 正文容器：embedded 下全宽单列呼吸感布局，非 embedded 下保留 xl:grid 右属性栏 */}
      <div className={cn(
        'mx-auto flex w-full flex-col gap-8 pb-12',
        embedded
          ? 'max-w-full px-5 py-2'
          : 'max-w-7xl xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-10 px-5 py-2',
      )}>
        {/* 左主列：无卡片白框，纯粹呼吸感的 Linear 画布 */}
        <div className="flex min-w-0 flex-col gap-8">
          {parent && (
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">
                  {category === 'Bug' ? '关联缺陷挂载于需求：' : '子任务挂载于需求：'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (embedded && onSelectParent) {
                      onSelectParent(parent.workitemId);
                    } else {
                      openWorkitem(parent.workitemId, parent);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline cursor-pointer truncate"
                >
                  <span className="font-mono text-xs shrink-0">{parent.identifier}</span>
                  <OverflowTooltip text={parent.subject} className="truncate max-w-xs" />
                </button>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="h-6 text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => {
                  if (embedded && onSelectParent) {
                    onSelectParent(parent.workitemId);
                  } else {
                    openWorkitem(parent.workitemId, parent);
                  }
                }}
              >
                查看父需求 ›
              </Button>
            </div>
          )}

          {/* 需求描述 (Linear 风格无边框融入画板) */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="描述"
              hint="来自云效的图文描述与内联附件"
              action={
                selectedId && allowWrite && !isEditingDesc ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setIsEditingDesc(true)}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    title="编辑描述"
                  >
                    <PencilIcon className="size-3 mr-1" />
                    编辑
                  </Button>
                ) : null
              }
            />
            <div className="text-sm leading-relaxed text-foreground/90">
              <RichDescription
                raw={wi.description ?? wi.content}
                workitemId={selectedId ?? undefined}
                isEditing={isEditingDesc}
                onEditingChange={setIsEditingDesc}
              />
            </div>
          </section>

          {/* 关联云效仓库与代码操作 (Linear Integrations 风格) */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="关联云效仓库与代码操作"
              count={`${effectiveRepoIds.length} 个仓库`}
              hint={hasRepoOverride
                ? '此需求使用单独配置的云效仓库；可在列表中配置模板并创建开发分支或 MR'
                : '当前使用设置中的默认云效仓库；保存选择后将覆盖默认值'}
              action={(
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={refreshingCodeArea || traceLoading}
                    onClick={() => void handleRefreshCodeArea()}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="重新从云效拉取关联仓库的分支、合并请求、Commit 及分支落差"
                  >
                    <RefreshCwIcon
                      className={cn(
                        'size-3.5 mr-1',
                        (refreshingCodeArea || traceLoading) && 'animate-spin text-primary',
                      )}
                    />
                    {refreshingCodeArea || traceLoading ? '刷新中…' : '刷新代码与 MR'}
                  </Button>
                  {hasRepoOverride && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={savingRepos}
                      onClick={() => {
                        if (!selectedId) return;
                        setSavingRepos(true);
                        void saveWorkitemRepos(selectedId, null)
                          .then(() => setToast({ text: '已恢复默认云效仓库', kind: 'ok' }))
                          .catch((e) => { errorLog('repo-link-save', e); setToast({ text: `云效仓库关联保存失败：${humanizeError(e)}`, kind: 'fail' }); })
                          .finally(() => setSavingRepos(false));
                      }}
                    >
                      恢复默认
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={recommendingRepos}
                    onClick={() => void handleRecommendRepos()}
                    className="h-8 text-xs text-primary hover:bg-primary/10 transition-colors"
                  >
                    {recommendingRepos ? (
                      <>
                        <Loader2Icon className="size-3.5 mr-1 animate-spin" />
                        AI 推荐中…
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="size-3.5 mr-1" />
                        AI 推荐仓库
                      </>
                    )}
                  </Button>
                  <Button
                    variant={showAddRepo ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setShowAddRepo((v) => !v)}
                  >
                    <PlusIcon data-icon="inline-start" />
                    {showAddRepo ? '收起表单' : '关联仓库'}
                  </Button>
                </div>
              )}
            />

            {/* 按需展开的添加仓库表单 */}
            {showAddRepo && (
              <div className="@container flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-3.5">
                {/* AI 推荐结果展示 */}
                {recommendedRepos.length > 0 && (
                  <div className="flex flex-col gap-2 pb-3 border-b border-border/60">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-primary flex items-center gap-1.5">
                        <SparklesIcon className="size-3.5" />
                        AI 智能推荐的相关代码仓库：
                      </span>
                      <button
                        type="button"
                        onClick={() => setRecommendedRepos([])}
                        className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        清空推荐
                      </button>
                    </div>
                    <div className={cn('grid gap-2', embedded ? 'grid-cols-1' : 'grid-cols-1 @lg:grid-cols-2')}>
                      {recommendedRepos.map((rec) => {
                        const targetRepo = repositories.find((r) => r.id === rec.repoId);
                        const repoName = targetRepo?.name
                          || (rec.repoName.includes('/') ? rec.repoName.split('/').pop() : rec.repoName)
                          || '未知仓库';
                        const repoPath = targetRepo?.pathWithNamespace || rec.repoName;

                        return (
                          <div
                            key={rec.repoId}
                            className="flex items-start justify-between gap-3 rounded-md border border-primary/25 bg-background p-2.5 transition-colors hover:border-primary/50 shadow-2xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <GitBranchIcon className="size-3.5 shrink-0 text-primary" />
                                <span className="font-semibold text-xs text-foreground tracking-tight truncate" title={repoName}>
                                  {repoName}
                                </span>
                              </div>
                              {repoPath && repoPath !== repoName && (
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground cursor-help" />
                                    }
                                  >
                                    {repoPath}
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-md break-all font-mono text-[11px]">
                                    {repoPath}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                {rec.reason}
                              </p>
                            </div>
                            <Button
                              size="xs"
                              disabled={savingRepos}
                              onClick={() => void handleQuickLinkRepo(rec.repoId)}
                              className="shrink-0 text-xs mt-0.5"
                            >
                              关联
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div
                  className={cn(
                    'grid gap-3',
                    embedded
                      ? 'grid-cols-1'
                      : isRequirement && iterationId
                        ? 'grid-cols-1 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] @2xl:items-end'
                        : 'grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_auto] @lg:items-end',
                  )}
                >
                  <Field className="min-w-0">
                    <FieldLabel>添加云效仓库</FieldLabel>
                    <SearchableSelect
                      value={linkDraft || null}
                      onValueChange={(v) => setLinkDraft(v ?? '')}
                      items={repositories
                        .filter((r) => !effectiveRepoIds.includes(r.id))
                        .map((r): SearchableSelectOption<string> => ({ label: r.pathWithNamespace || r.name, value: r.pathWithNamespace || r.name }))}
                      placeholder="搜索并选择云效仓库"
                    />
                  </Field>
                  {isRequirement && iterationId && (
                    <Field className="min-w-0">
                      <FieldLabel>应用分支模板</FieldLabel>
                      <SearchableSelect
                        value={linkDraftTemplateId || '__none'}
                        onValueChange={(value) => setLinkDraftTemplateId(value && value !== '__none' ? value : '')}
                        items={[
                          { label: '不应用模板', value: '__none' },
                          ...fusedTemplates.map((template): SearchableSelectOption<string> => {
                            const scopeTag = template.scope === 'iteration' ? ' (迭代专属)' : ' (全局)';
                            return {
                              label: `${template.name}${scopeTag}`,
                              value: template.id,
                            };
                          }),
                        ]}
                      />
                      {!fusedTemplates.length && (
                        <p className="text-xs text-muted-foreground">请先在全局设置或当前迭代页创建分支模板。</p>
                      )}
                    </Field>
                  )}
                  <div className={cn('flex items-end', embedded && 'pt-1')}>
                    <Button
                      onClick={linkRepository}
                      disabled={!linkDraft || savingRepos}
                      className={cn('shrink-0', embedded ? 'w-full' : 'w-full @2xl:w-auto')}
                    >
                      确认关联
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3.5">
              {linkedRepos.map((repo) => {
                const rule = repoBranchRules[repo.id];
                const baselineCheck = baselineChecks[repo.id];
                return (
                  <LinkedRepoCard
                    key={repo.id}
                    repo={repo}
                    identifier={identifier}
                    subject={subject}
                    iterationId={iterationId}
                    placeholderIteration={placeholderIteration}
                    branchRule={rule}
                    mergeRequests={mergeRequestsByRepoId.get(repo.id) ?? []}
                    matchedBranches={branchesByRepoId.get(repo.id) ?? []}
                    loadingBranches={traceLoading && !branchesByRepoId.has(repo.id)}
                    traceAvailable={branchesByRepoId.has(repo.id)}
                    templateId={selectedId ? settings?.workitemRepoBranchTemplates?.[selectedId]?.[String(repo.id)] : undefined}
                    templates={fusedTemplates}
                    templateEnabled={Boolean(isRequirement && iterationId)}
                    baselineBranch={rule?.baselineBranch}
                    baselineState={rule
                      ? baselineCheck?.branch === rule.baselineBranch ? baselineCheck.state : 'loading'
                      : undefined}
                    refreshSignal={codeAreaRefreshSignal}
                    onRetryBaseline={() => setBaselineRetry((value) => value + 1)}
                    onTemplateChange={(templateId) => void saveRepoTemplate(repo.id, templateId)}
                    onUnlinkRepo={effectiveRepoIds.length > 0 ? (repoId) => unlinkRepo(repoId) : undefined}
                  />
                );
              })}
              {!linkedRepos.length && (
                <EmptyHint
                  icon={InboxIcon}
                  title="未关联云效仓库"
                  description="可在上方「关联仓库」选择后添加，或在设置中指定默认云效仓库"
                  className="rounded-xl border border-dashed py-8"
                />
              )}
            </div>

            {/* 分支同步状态图：折叠 */}
            <Collapsible defaultOpen={false} render={<div className="rounded-lg border border-border/70" />}>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">分支同步状态图</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    以需求为根的分支树：仓库 → 基准 / 迭代 / 开发分支；绿 / 橙箭头标注各段合并状态（按真实双向比较结果）。
                  </p>
                </div>
                <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
                  <ChevronRightIcon className="transition-transform duration-200 group-data-panel-open/collapsible:rotate-90" />
                  展开 / 收起
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="border-t border-border/70 p-4">
                  <Suspense
                    fallback={(
                      <div className="flex h-72 w-full flex-col items-center justify-center gap-4 rounded-lg border border-border/40 bg-muted/10 p-6" aria-hidden>
                        <Skeleton className="h-9 w-36 rounded-md" />
                        <div className="h-6 w-px bg-border/60" />
                        <div className="flex items-center gap-8">
                          <Skeleton className="h-9 w-32 rounded-md" />
                          <Skeleton className="h-9 w-32 rounded-md" />
                        </div>
                      </div>
                    )}
                  >
                    <BranchStateDiagram
                      requirement={{ identifier, subject }}
                      repos={syncDiagramRepos}
                    />
                  </Suspense>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </section>

          {/* 子工作项与缺陷 (Linear Sub-issues 风格) */}
          {isRequirement && (() => {
            const openChild = (child: WorkitemChild) => {
              setActiveChildId(child.workitemId);
              setDrawerChild(child);
            };

            return (
              <div className="flex flex-col gap-6">
                <ChildrenCard
                  title="子任务"
                  category="Task"
                  description="挂载在该需求下的子任务"
                  items={subtasks}
                  error={childrenError}
                  debug={childrenDebug}
                  parentWorkitemId={selectedId ?? ''}
                  parentIdentifier={identifier}
                  parentSubject={subject}
                  parentDescription={typeof wi.description === 'string' ? wi.description : typeof wi.content === 'string' ? wi.content : undefined}
                  parentAssigneeId={parentAssigneeId}
                  parentAssigneeName={assignedToName}
                  candidateAssignees={candidateAssignees}
                  selectedChildId={activeChildId}
                  onSelect={openChild}
                />
                <ChildrenCard
                  title="缺陷"
                  category="Bug"
                  description="挂载在该需求下的缺陷"
                  items={defects}
                  error={childrenError}
                  debug={childrenDebug}
                  parentWorkitemId={selectedId ?? ''}
                  parentIdentifier={identifier}
                  parentSubject={subject}
                  parentDescription={typeof wi.description === 'string' ? wi.description : typeof wi.content === 'string' ? wi.content : undefined}
                  parentAssigneeId={parentAssigneeId}
                  parentAssigneeName={assignedToName}
                  candidateAssignees={candidateAssignees}
                  selectedChildId={activeChildId}
                  onSelect={openChild}
                />
              </div>
            );
          })()}

          {/* Activity / 评论讨论（1:1 对齐 Linear Activity 时间轴与 AI 赋能） */}
          <RequirementActivity
            comments={comments}
            workitemId={selectedId ?? undefined}
            identifier={identifier}
            subject={subject}
            subtaskStats={{
              total: subtasks.length + defects.length,
              done: [...subtasks, ...defects].filter((s) => s.status === '已完成' || s.status === '已解决' || s.status === '已关闭').length,
            }}
          />
        </div>

        {/* 右侧边栏：Linear 式属性栏（全屏/非 embedded 模式下展示） */}
        {!embedded && (
          <RequirementProperties
            statusName={statusName}
            statusId={statusId}
            selectedId={selectedId}
            assignedToName={assignedToName}
            candidateAssignees={candidateAssignees}
            category={category}
            parent={parent}
            spaceName={spaceName}
            iterationName={iterationName}
            updatedAt={updatedAt}
            effectiveRepoCount={effectiveRepoIds.length}
            iterationBranchValue={iterationBranchValue}
            embedded={embedded}
            onSelectParent={onSelectParent}
          />
        )}
      </div>

      {/* 子工作项/缺陷详情侧滑抽屉（Linear Peek 面板） */}
      <ChildDetailDrawer
        child={latestDrawerChild}
        parentWorkitem={selectedId && identifier ? { workitemId: selectedId, identifier, subject } : null}
        candidateAssignees={candidateAssignees}
        onClose={() => setDrawerChild(null)}
        onOpenInWorkbench={(child) => {
          setDrawerChild(null);
          if (!selectedId) return;
          if (embedded && onSelectChild) {
            onSelectChild(child);
          } else {
            openWorkitem(
              child.workitemId,
              { workitemId: child.workitemId, identifier: child.identifier, subject: child.subject },
              { workitemId: selectedId, identifier, subject },
            );
          }
        }}
      />
    </div>
  );
}
