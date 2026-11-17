import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeftIcon, ChevronRightIcon, DatabaseIcon,
  ExternalLinkIcon, GitBranchIcon, GitForkIcon, InboxIcon, LayersIcon, Loader2Icon, Maximize2Icon, MoreHorizontalIcon,
  MousePointerClickIcon, PencilIcon, PlayIcon, PlusIcon, RefreshCwIcon, RotateCcwIcon, SparklesIcon, XIcon,
} from 'lucide-react';
import { findRemoteBranch } from '@/lib/iteration-branches';
import { useFusedBranchTemplates } from '@/lib/iteration-templates';
import { errorLog, humanizeError } from '@/lib/error-format';
import { aiRecommendRepositories } from '@/lib/ai-api';
import type { BreakdownContext, BreakdownRepoCode, BreakdownRepoScope } from '@/types/ai';
import * as attributionApi from '@/lib/attribution-api';
import { comparisonDiffs } from './BranchDivergenceCheck';
import { parseFileDiffs } from './requirement/diff-utils';
import type { AiRepoRecommendation } from '@/types/ai';
import type { WorkitemChild } from '@/lib/api';
import * as api from '@/lib/api';
import { openWorkitemInYunxiao } from '@/lib/yunxiao-link';
import { probeRepoSignalHits, repoSignalScores } from '@/lib/repo-signals';
import { cn } from '@/lib/utils';
import { useRecentTracker } from '@/hooks/use-recent-tracker';
import { useApp } from '@/store/app';
import { useUi, type DetailTabKey } from '@/store/ui';
import { useAttribution } from '@/store/attribution';
import { useShallow } from 'zustand/react/shallow';
import { CATEGORY_LABELS, type Category, type RepoCiBinding } from '@/types';
import { matchPipelineForRepo } from '@/lib/pipeline-match';
import { Tabs } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Surface } from '@/components/ui/surface';
import { CopyButton } from '@/components/ui/copy-button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspaceCompact } from '@/hooks/use-workspace-compact';
import { PageHeader, STICKY_PAGE_HEADER_CLASS } from '../page-header';
import { AppBreadcrumb } from '../nav/app-breadcrumb';
import { EmptyHint } from '../empty-hint';
import { OverflowTooltip } from '../overflow-tooltip';
import type { BranchSyncRepo } from './BranchStateDiagram';
import { RichDescription } from './rich-description';
import { richTextToPlain } from '@/lib/richtext';
import { ChildDetailDrawer } from './child-detail-drawer';
import { SectionHeader } from '../section-header';
import { StatusIcon } from '../status-icon';
import { WriteOpGatedTrigger } from '../WriteOpButton';
import {
  resolveChildMrBranches,
  resolveRepoBranchRule,
  type IterationBaselineCheck,
  type RequirementDetailsProps,
  type ResolvedRepoBranchRule,
} from './requirement/types';
import { RequirementDetailsSkeleton } from './requirement/requirement-skeleton';
import { ChildrenCard } from './requirement/children-card';
import { LinkedRepoCard, isDirectConnectRule } from './requirement/linked-repo-card';
import { Card } from '@/components/ui/card';
import { LinkRepoModal } from './requirement/link-repo-modal';
import { BranchStateDiagramModal } from './requirement/branch-state-diagram-modal';
import { DetailAssigneePopover, DetailStatusPopover, RequirementProperties } from './requirement/requirement-properties';
import { RequirementActivity } from './requirement/requirement-activity';
import { workitemRepoOverride } from '@/lib/workitem-repos';
import { StartProcessingButton } from './start-processing';
import { useDetailTabState } from './requirement/use-detail-tab';

export { RequirementDetailsSkeleton };
export type { RequirementDetailsProps };
// 页签键从 store/ui 单一来源导入并保持既有 import 兼容（不再在本文件重复定义）。
export type { DetailTabKey };

/**
 * 单栏窄窗口扩展 props（IterationView 在 < SINGLE_COLUMN_WORKSPACE_WIDTH 时传入）：
 * 提供顶部「返回列表」入口，点击后由父组件收起详情态并恢复全宽列表现场。
 * 独立扩展接口而不改 requirement/types.ts，保持原契约文件不动。
 */
/** 云效返回的类别可能是 'Bug' / uuid / 空：只接受三种合法语义值，其余交给下一级兜底。 */
function normalizeCategoryValue(value?: string | null): Category | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'req') return 'Req';
  if (normalized === 'bug') return 'Bug';
  if (normalized === 'task') return 'Task';
  return null;
}

export interface RequirementDetailsBackToListProps {
  onBackToList?: () => void;
}

/** 子项「在工作台打开」扩展：嵌入态由 Peek 抽屉注入，接收目标子项。
 *  基座契约 `onOpenWorkbench?: () => void` 未参数化，这里仅做局部收窄，不改冻结契约文件。 */
export interface RequirementDetailsChildWorkbenchProps {
  onOpenWorkbench?: (child?: WorkitemChild) => void;
}

/** 页签受控扩展：嵌入态由 Peek 抽屉持有页签（j/k 换工作项保留、关闭重置）。
 *  局部接口，不改 requirement/types.ts 的基座契约。 */
export interface RequirementDetailsTabControlProps {
  /** 受控页签；缺省时嵌入态默认「交付进展」、全屏工作台挂载时从 store 初始化。 */
  detailTab?: DetailTabKey;
  /** 受控页签变更回调（本组件同时写回 useUi.detailTab）。 */
  onDetailTabChange?: (tab: DetailTabKey) => void;
}

/** 页头「更多操作」菜单行：复用既有 HeroUI Button 视觉，不用原生菜单项嵌套可交互按钮。 */
function MoreActionsMenuRow({
  icon,
  children,
  onPress,
}: {
  icon: ReactNode;
  children: ReactNode;
  onPress: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full min-w-0 justify-start gap-2 font-normal"
      onPress={onPress}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </Button>
  );
}

/**
 * 页头「更多操作」：开始处理（复用 StartProcessingButton）/ 分支拓扑 / 云效直达。
 *
 * StartProcessingButton 的「选择本地仓库」弹窗状态在组件内部，若直接渲染在 Popover 里，
 * 弹窗打开时浮层关闭会连带卸载它自身；因此这里常驻挂载一个视觉隐藏的实例，
 * 菜单项只代理触发其按钮点击，弹窗状态始终存活。
 */
function RequirementMoreActionsMenu({
  workitemId,
  category,
  parentWorkitemId,
  activeRepoLabel,
  showBranchTopology,
  onOpenBranchTopology,
  onOpenYunxiao,
}: {
  workitemId: string;
  category: Category;
  parentWorkitemId?: string;
  activeRepoLabel?: string;
  showBranchTopology: boolean;
  onOpenBranchTopology: () => void;
  onOpenYunxiao: () => void;
}) {
  const startProcessingHolder = useRef<HTMLDivElement>(null);
  return (
    <>
      {/* 常驻挂载（视觉隐藏）：开始处理的活动状态需要提前载入，菜单文案才能显示「当前处理仓库」；
          同时避免浮层关闭时卸载它，导致「选择本地仓库」弹窗状态丢失。 */}
      <div ref={startProcessingHolder} hidden aria-hidden="true">
        <StartProcessingButton
          workitemId={workitemId}
          category={category}
          parentWorkitemId={parentWorkitemId}
          size="xs"
        />
      </div>
      <Popover>
        <PopoverTrigger
          render={(
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="更多操作"
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          )}
        />
        <PopoverContent
          placement="bottom end"
          aria-label="更多操作"
          className="flex w-60 flex-col gap-0.5 p-1.5"
        >
            <MoreActionsMenuRow
              icon={<PlayIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
              onPress={() => startProcessingHolder.current?.querySelector('button')?.click()}
            >
              {activeRepoLabel ? `当前处理仓库 · ${activeRepoLabel}` : '开始处理'}
            </MoreActionsMenuRow>
            {showBranchTopology && (
              <MoreActionsMenuRow
                icon={<GitForkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                onPress={onOpenBranchTopology}
              >
                分支拓扑
              </MoreActionsMenuRow>
            )}
            <MoreActionsMenuRow
              icon={<ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
              onPress={onOpenYunxiao}
            >
              云效直达
            </MoreActionsMenuRow>
        </PopoverContent>
      </Popover>
    </>
  );
}

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
  detailTab,
  onDetailTabChange,
}: RequirementDetailsProps
  & RequirementDetailsBackToListProps
  & RequirementDetailsChildWorkbenchProps
  & RequirementDetailsTabControlProps = {}) {
  // 只订阅详情工作台真正消费的字段：避免日志/CI 轮询等高频 set 触发整个详情树重渲。
  const {
    selectedId, detail, comments, children, childrenError, childrenDebug, childrenTruncated, loadingDetail, items, settings, repositories,
    iterations, trace, traceLoading, currentUser, pipelines,
    saveWorkitemRepos, saveWorkitemRepoBranchTemplate, saveRepoCiBinding, setToast, reloadCurrentDetail, loadTrace,
    parentIdOf,
  } = useApp(
    useShallow((s) => ({
      selectedId: s.selectedId,
      detail: s.detail,
      comments: s.comments,
      children: s.children,
      childrenError: s.childrenError,
      childrenDebug: s.childrenDebug,
      childrenTruncated: s.childrenTruncated,
      loadingDetail: s.loadingDetail,
      items: s.items,
      settings: s.settings,
      repositories: s.repositories,
      iterations: s.iterations,
      trace: s.trace,
      traceLoading: s.traceLoading,
      currentUser: s.currentUser,
      pipelines: s.pipelines,
      saveWorkitemRepos: s.saveWorkitemRepos,
      saveWorkitemRepoBranchTemplate: s.saveWorkitemRepoBranchTemplate,
      saveRepoCiBinding: s.saveRepoCiBinding,
      setToast: s.setToast,
      reloadCurrentDetail: s.reloadCurrentDetail,
      loadTrace: s.loadTrace,
      parentIdOf: s.parentIdOf,
    })),
  );
  const allowWrite = settings?.allowWriteOps ?? false;
  // 「更多操作」里的开始处理入口文案：当前工作项已被写入某个本地仓库时显示「当前处理仓库 · 名称」。
  const activeWorkitems = useAttribution((state) => state.activeWorkitems);
  const activeRepoName = useMemo(() => {
    const current = Object.values(activeWorkitems)
      .filter((item) => item.workitemId === selectedId)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    if (!current) return undefined;
    const repo = repositories.find((item) => item.id === current.repoId);
    return repo?.name || `#${current.repoId}`;
  }, [activeWorkitems, repositories, selectedId]);
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
      const result = await loadTrace({ force: true });
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

  const openWorkitem = useUi((s) => s.openWorkitem);
  // DESIGN §F.3：全屏详情页头同样随工作区 <760px 收 compact
  const compactHeader = useWorkspaceCompact();
  const chain = useUi((s) => s.chain);
  const currentCrumb = chain[chain.length - 1];
  const parentCrumb = chain.length > 1 ? chain[0] : null;

  // 父级上下文兜底：子项未经过父详情钻取直接打开（如最近查看冷启动）时，
  // 经 store 运行期子→父索引重建父需求（列表行优先，缺失时懒拉父详情补 identifier/subject）。
  const [indexedParent, setIndexedParent] = useState<RequirementDetailsProps['parentWorkitem']>(null);
  useEffect(() => {
    if (parentWorkitem || parentCrumb || !selectedId || loadingDetail) {
      setIndexedParent(null);
      return;
    }
    const parentId = parentIdOf(selectedId);
    if (!parentId) {
      setIndexedParent(null);
      return;
    }
    const row = useApp.getState().items.find((i) => i.workitemId === parentId);
    if (row) {
      setIndexedParent({ workitemId: parentId, identifier: row.identifier, subject: row.subject });
      return;
    }
    let alive = true;
    void api.getWorkitem(parentId)
      .then((res) => {
        if (!alive) return;
        const wi = ((res as Record<string, unknown>)?.workitem ?? res ?? {}) as Record<string, unknown>;
        const identifier = (typeof wi.identifier === 'string' && wi.identifier)
          || (typeof wi.serialNumber === 'string' ? wi.serialNumber : '');
        const subject = (typeof wi.subject === 'string' && wi.subject)
          || (typeof wi.name === 'string' ? wi.name : '');
        if (identifier) setIndexedParent({ workitemId: parentId, identifier, subject: subject || undefined });
      })
      .catch(() => {
        // 父级详情拉取失败不阻断子项详情展示
      });
    return () => { alive = false; };
  }, [selectedId, loadingDetail, parentWorkitem, parentCrumb, parentIdOf]);

  const parent = parentWorkitem ?? parentCrumb ?? indexedParent;

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

  const category = normalizeCategoryValue(typeof wi.category === 'string' ? wi.category : '')
    ?? normalizeCategoryValue(typeof wi.categoryId === 'string' ? wi.categoryId : '')
    ?? normalizeCategoryValue(childFromStore?.category)
    ?? normalizeCategoryValue(cur?.category)
    ?? (parent ? 'Task' : 'Req');

  const isRequirement = category === 'Req';
  // 类别大小写归一：后端已按检索类别回填，这里再兜一层脏数据（空/UUID 不会误入缺陷）
  const isBugChild = (c: WorkitemChild) => (c.category ?? '').trim().toLowerCase() === 'bug';
  const subtasks = isRequirement ? children.filter((c) => !isBugChild(c)) : [];
  const defects = isRequirement ? children.filter(isBugChild) : [];

  // 页签顺序：交付进展（默认，复用原「关联仓库」页签）/ 描述 / 子工作项 / 活动动态。
  const [activeTab, setActiveTab] = useDetailTabState({ embedded, detailTab, onDetailTabChange });

  useEffect(() => {
    if (!isRequirement && activeTab === 'children') {
      setActiveTab('description');
    }
  }, [isRequirement, activeTab, setActiveTab]);

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

  const creator = (wi.creator ?? {}) as Record<string, unknown>;
  const creatorId = typeof creator.id === 'string' ? creator.id
    : typeof creator.identifier === 'string' ? creator.identifier : undefined;
  const creatorName = (typeof creator.name === 'string' && creator.name)
    || (typeof creator.displayName === 'string' && creator.displayName)
    || '';

  // 汇总候选处理人：当前登录用户、父需求负责人、创建人、参与人、已有子项负责人及当前迭代成员
  const candidateAssignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role?: string }>();
    if (currentUser?.id && currentUser?.name) {
      map.set(currentUser.id, { id: currentUser.id, name: currentUser.name, role: '当前用户' });
    }
    if (parentAssigneeId && assignedToName) {
      map.set(parentAssigneeId, { id: parentAssigneeId, name: assignedToName, role: '需求负责人' });
    }
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

  // 关联仓库上下文（方案 A）：展示与编辑只认「显式关联」；
  // 追溯/分支配置仍用扫描范围（显式关联优先，缺省回退默认云效仓库）。
  // 任务/缺陷继承父需求的显式关联，且不向 settings 落盘子项键。
  const repoContextId = isRequirement ? selectedId : parent?.workitemId;
  const repoOverride = useMemo(
    () => (settings && repoContextId
      ? workitemRepoOverride(
        category as Category,
        selectedId ?? '',
        settings,
        isRequirement ? undefined : parent?.workitemId,
      )
      : null),
    [category, isRequirement, parent?.workitemId, repoContextId, selectedId, settings],
  );
  const hasRepoOverride = repoOverride !== null;
  const explicitRepoIds = useMemo(() => repoOverride ?? [], [repoOverride]);
  const scanRepoIds = useMemo(
    () => repoOverride ?? settings?.watchedRepos ?? [],
    [repoOverride, settings?.watchedRepos],
  );
  const [savingRepos, setSavingRepos] = useState(false);
  const [isLinkRepoModalOpen, setIsLinkRepoModalOpen] = useState(false);
  const [isBranchDiagramModalOpen, setIsBranchDiagramModalOpen] = useState(false);
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
    setIsLinkRepoModalOpen(false);
    setRepoFilter('all');
    setShowDefaultPool(false);
  }, [selectedId]);

  const sprint = wi.sprint && typeof wi.sprint === 'object'
    ? wi.sprint as Record<string, unknown>
    : {};
  // 子项迭代上下文：优先父需求行（继承其交付轨道），回退子项自身 sprint
  const parentRow = parent ? items.find((i) => i.workitemId === parent.workitemId) : undefined;
  const sprintId = cur?.sprintId
    || (typeof sprint.id === 'string' && sprint.id ? sprint.id : '')
    || parentRow?.sprintId
    || '';
  const iterationId = sprintId && !sprintId.startsWith('placeholder-')
    ? sprintId
    : undefined;
  const placeholderIteration = Boolean(sprintId.startsWith('placeholder-'));
  const iterationName = iterationId
    ? iterations.find((iteration) => iteration.id === iterationId)?.name
      || cur?.sprintName
      || parentRow?.sprintName
      || (typeof sprint.name === 'string' ? sprint.name : '')
    : (cur?.sprintName || parentRow?.sprintName || (typeof sprint.name === 'string' ? sprint.name : ''));
  const iterationEndDate = iterationId
    ? iterations.find((iteration) => iteration.id === iterationId)?.endDate ?? ''
    : '';
  const fusedTemplates = useFusedBranchTemplates(iterationId);
  // 分支规则上下文：需求取自身；任务/缺陷以父需求为模板查找键（显式覆盖与方案 A 自动继承均生效），
  // {identifier} 用子项自身编号展开 → rule.workitemBranch 即子项开发分支。
  const branchRuleContextId = isRequirement ? selectedId : parent?.workitemId;
  const repoBranchRules: Record<number, ResolvedRepoBranchRule> = useMemo(
    () => (iterationId && branchRuleContextId
      ? Object.fromEntries(explicitRepoIds.flatMap((repoId) => {
        const rule = resolveRepoBranchRule(settings, branchRuleContextId, repoId, iterationName, identifier, fusedTemplates, iterationEndDate);
        return rule ? [[repoId, rule]] : [];
      }))
      : {}),
    [branchRuleContextId, explicitRepoIds, fusedTemplates, identifier, iterationEndDate, iterationId, iterationName, settings],
  );
  // 缺陷页 MR 分支（「缺陷单号分支 → 需求单号分支」）：目标分支按父需求交付轨道以需求编号展开
  const bugMrTargetByRepo: Record<number, string> = useMemo(
    () => (!isRequirement && category === 'Bug' && parent && identifier
      ? Object.fromEntries(explicitRepoIds.flatMap((repoId) => {
        const { targetBranch } = resolveChildMrBranches(settings, {
          parentWorkitemId: parent.workitemId,
          parentIdentifier: parent.identifier,
          childIdentifier: identifier,
          iterationName,
          repoId,
          customTemplates: fusedTemplates,
          iterationEndDate,
        });
        return [[repoId, targetBranch]];
      }))
      : {}),
    [category, explicitRepoIds, fusedTemplates, identifier, isRequirement, iterationEndDate, iterationName, parent, settings],
  );
  const baselineLookups = useMemo(
    () => (iterationId
      ? explicitRepoIds.flatMap((repoId) => {
        const rule = repoBranchRules[repoId];
        if (!rule?.baselineBranch.trim()) return [];
        // 直连主干（Trunk-Based）：不发起独立基准查询，探测模板源分支存在性并归并复用为基准状态
        const branch = isDirectConnectRule(rule)
          ? rule.sourceBranch.trim()
          : rule.baselineBranch.trim();
        return [{ repoId, branch }];
      })
      : []),
    [explicitRepoIds, iterationId, repoBranchRules],
  );
  const baselineLookupKey = useMemo(() => JSON.stringify(baselineLookups), [baselineLookups]);
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
        ? '未配置轨道'
        : configuredBaselineCount === explicitRepoIds.length && explicitRepoIds.length === 1
          ? repoBranchRules[explicitRepoIds[0]].templateName
          : configuredBaselineCount + ' 个仓库已应用交付轨道';

  const linkedRepos = useMemo(
    () => repositories.filter((r) => explicitRepoIds.includes(r.id)),
    [explicitRepoIds, repositories],
  );
  const [repoFilter, setRepoFilter] = useState<'all' | 'pending_merge' | 'active' | 'merged'>('all');
  // 空态下折叠展示默认扫描池，避免把「默认池」误当成显式关联
  const [showDefaultPool, setShowDefaultPool] = useState(false);
  const branchesByRepoId = useMemo(
    () => new Map(
      (trace?.repositories ?? []).map((repository) =>
        [repository.repoId, repository.branches.map((branch) => branch.name)] as const,
      ),
    ),
    [trace],
  );
  const mergeRequestsByRepoId = useMemo(
    () => new Map(
      (trace?.repositories ?? []).map((repository) =>
        [repository.repoId, repository.mergeRequests] as const,
      ),
    ),
    [trace],
  );

  // AI 拆解上下文：改动范围（compare diffs）+ 现有代码节选（文件树 & 关键词命中文件）。
  // 分支尚未创建时仍读取基准分支代码，帮助模型理解模块结构。
  const collectBreakdownContext = useCallback(
    async (repoIds: number[], keywords: string[]): Promise<BreakdownContext> => {
      const unique = [...new Set(repoIds)].slice(0, 5);
      const scope = await Promise.all(
        unique.map(async (repoId) => {
          const repo = repositories.find((item) => item.id === repoId);
          const repoName = repo?.pathWithNamespace || repo?.name || `#${repoId}`;
          const rule = iterationId && branchRuleContextId && settings
            ? resolveRepoBranchRule(
              settings,
              branchRuleContextId,
              repoId,
              iterationName,
              identifier,
              fusedTemplates,
              iterationEndDate,
            )
            : null;
          const workitemBranch = rule?.workitemBranch?.trim() || '';
          const baselineBranch = rule?.baselineBranch?.trim() || rule?.sourceBranch?.trim() || '';
          if (!workitemBranch) {
            return { repoName, branchCreated: false } satisfies BreakdownRepoScope;
          }
          if (!baselineBranch) {
            return {
              repoName,
              workitemBranch,
              branchCreated: true,
              note: '缺少基准分支，未读取变更文件',
            } satisfies BreakdownRepoScope;
          }
          try {
            const raw = await api.compareBranches(repoId, baselineBranch, workitemBranch);
            const files = parseFileDiffs(comparisonDiffs(raw))
              .map((file) => ({
                path: file.newPath || file.oldPath,
                additions: file.additions,
                deletions: file.deletions,
              }))
              .filter((file) => Boolean(file.path))
              .sort((left, right) => (right.additions + right.deletions) - (left.additions + left.deletions))
              .slice(0, 30);
            return {
              repoName,
              workitemBranch,
              baselineBranch,
              branchCreated: true,
              files,
            } satisfies BreakdownRepoScope;
          } catch {
            // trace 未必覆盖用户临时选中的仓库，因此不以本地分支缓存为准：
            // compare 失败通常代表开发分支尚未创建（也涵盖无权/网络失败）。
            return {
              repoName,
              workitemBranch,
              baselineBranch,
              branchCreated: false,
              note: '开发分支尚未创建或无法读取',
            } satisfies BreakdownRepoScope;
          }
        }),
      );

      const code = await Promise.all(
        scope.map(async (entry, index) => {
          const repoId = unique[index];
          const changedPaths = entry.files?.map((file) => file.path) ?? [];
          // 有改动读改动文件；没有改动读基准分支上关键词命中的现有代码
          const refName = entry.branchCreated
            ? entry.workitemBranch
            : entry.baselineBranch || entry.workitemBranch;
          try {
            const context = await attributionApi.readLocalRepoCode({
              repoId,
              refName,
              paths: changedPaths.slice(0, 4),
              keywords: changedPaths.length > 0 ? undefined : keywords,
            });
            return {
              repoName: entry.repoName,
              gitRef: context.gitRef,
              tree: context.tree,
              files: context.files,
            } satisfies BreakdownRepoCode;
          } catch {
            return {
              repoName: entry.repoName,
              note: '本地未绑定该仓库或代码读取失败',
            } satisfies BreakdownRepoCode;
          }
        }),
      );

      return { scope, code };
    },
    [
      branchRuleContextId,
      fusedTemplates,
      identifier,
      iterationEndDate,
      iterationId,
      iterationName,
      repositories,
      settings,
    ],
  );

  // 待合入：存在开放中的 MR（包含待合入、审查中等活跃 MR）
  const pendingMergeCount = useMemo(() => {
    return linkedRepos.filter((repo) => {
      const mrs = mergeRequestsByRepoId.get(repo.id) ?? [];
      return mrs.some((mr) => {
        const state = mr.state?.toLowerCase();
        return state !== 'merged' && state !== 'closed';
      });
    }).length;
  }, [linkedRepos, mergeRequestsByRepoId]);

  // 进行中：有开发分支活动或活跃 MR
  const activeCount = useMemo(() => {
    return linkedRepos.filter((repo) => {
      const mrs = mergeRequestsByRepoId.get(repo.id) ?? [];
      const hasActiveMr = mrs.some((mr) => {
        const state = mr.state?.toLowerCase();
        return state !== 'merged' && state !== 'closed';
      });
      const branches = branchesByRepoId.get(repo.id) ?? [];
      return hasActiveMr || branches.length > 0;
    }).length;
  }, [linkedRepos, mergeRequestsByRepoId, branchesByRepoId]);

  // 已合入：存在已成功合入的 MR，且没有未合入的活跃 MR
  const mergedCount = useMemo(() => {
    return linkedRepos.filter((repo) => {
      const mrs = mergeRequestsByRepoId.get(repo.id) ?? [];
      const hasActiveMr = mrs.some((mr) => {
        const state = mr.state?.toLowerCase();
        return state !== 'merged' && state !== 'closed';
      });
      if (hasActiveMr) return false;
      return mrs.some((mr) => mr.state?.toLowerCase() === 'merged');
    }).length;
  }, [linkedRepos, mergeRequestsByRepoId]);

  const filteredLinkedRepos = useMemo(() => {
    if (repoFilter === 'pending_merge') {
      return linkedRepos.filter((repo) => {
        const mrs = mergeRequestsByRepoId.get(repo.id) ?? [];
        return mrs.some((mr) => {
          const state = mr.state?.toLowerCase();
          return state !== 'merged' && state !== 'closed';
        });
      });
    }
    if (repoFilter === 'active') {
      return linkedRepos.filter((repo) => {
        const mrs = mergeRequestsByRepoId.get(repo.id) ?? [];
        const hasActiveMr = mrs.some((mr) => {
          const state = mr.state?.toLowerCase();
          return state !== 'merged' && state !== 'closed';
        });
        const branches = branchesByRepoId.get(repo.id) ?? [];
        return hasActiveMr || branches.length > 0;
      });
    }
    if (repoFilter === 'merged') {
      return linkedRepos.filter((repo) => {
        const mrs = mergeRequestsByRepoId.get(repo.id) ?? [];
        const hasActiveMr = mrs.some((mr) => {
          const state = mr.state?.toLowerCase();
          return state !== 'merged' && state !== 'closed';
        });
        if (hasActiveMr) return false;
        return mrs.some((mr) => mr.state?.toLowerCase() === 'merged');
      });
    }
    return linkedRepos;
  }, [linkedRepos, repoFilter, mergeRequestsByRepoId, branchesByRepoId]);

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

  // 分支同步状态图数据：有模板规则的仓库（开发分支未匹配到时也出占位节点，与行内 BranchDivergenceCheck 同源）
  const syncDiagramRepos: BranchSyncRepo[] = isRequirement && iterationId
    ? linkedRepos.flatMap((repo) => {
        const rule = repoBranchRules[repo.id];
        if (!rule) return [];
        const directConnect = isDirectConnectRule(rule);
        const branches = branchesByRepoId.get(repo.id) ?? [];
        const baselineCheck = baselineChecks[repo.id];
        // 直连主干：基准状态归并自源分支探测结果，杜绝"迭代基准未创建（missing）"误报
        const expectedBaselineBranch = directConnect
          ? rule.sourceBranch.trim()
          : rule.baselineBranch.trim();
        const baselineState = baselineCheck?.branch === expectedBaselineBranch
          ? baselineCheck.state
          : 'loading';
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

  const handleLinkRepoFromModal = async (
    repoPath: string,
    templateId?: string,
    ciBinding?: RepoCiBinding | null,
  ): Promise<boolean> => {
    if (!selectedId || !repoPath) return false;
    const repo = repositories.find((r) => (r.pathWithNamespace || r.name) === repoPath);
    if (!repo || explicitRepoIds.includes(repo.id)) return false;
    setSavingRepos(true);
    let repoLinked = false;
    try {
      await saveWorkitemRepos(selectedId, repoOverride ? [...explicitRepoIds, repo.id] : [repo.id]);
      repoLinked = true;
      if (iterationId && templateId) {
        await saveWorkitemRepoBranchTemplate(selectedId, repo.id, templateId);
      }
      if (ciBinding !== undefined) {
        await saveRepoCiBinding(repo.id, ciBinding);
      }
      const ciMsg = ciBinding
        ? `，已关联 CI (${ciBinding.provider === 'flow' ? ciBinding.pipelineName : 'Jenkins'})`
        : '';
      setToast({
        text: `已关联云效仓库 ${repoPath}${templateId ? ' 并应用分支模板' : ''}${ciMsg}`,
        kind: 'ok',
      });
      return true;
    } catch (error) {
      setToast({
        text: (repoLinked ? '仓库已关联，但后续配置保存失败' : '云效仓库关联保存失败') + '：' + humanizeError(error),
        kind: 'fail',
      });
      return false;
    } finally {
      setSavingRepos(false);
    }
  };

  const handleRecommendRepos = async () => {
    if (recommendingRepos) return;
    setRecommendingRepos(true);
    try {
      const watched = settings?.watchedRepos ?? [];
      const watchedSet = new Set(watched);
      const unlinked = repositories.filter((r) => !explicitRepoIds.includes(r.id));
      const descriptionText = richTextToPlain(wi.description ?? wi.content);
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
    if (!selectedId || explicitRepoIds.includes(repoId)) return;
    const repo = repositories.find((r) => r.id === repoId);
    if (!repo) return;
    setSavingRepos(true);
    let repoLinked = false;
    try {
      await saveWorkitemRepos(selectedId, repoOverride ? [...explicitRepoIds, repo.id] : [repo.id]);
      repoLinked = true;
      const tId = fusedTemplates[0]?.id;
      if (iterationId && tId) {
        await saveWorkitemRepoBranchTemplate(selectedId, repo.id, tId);
      }
      let ciMsg = '';
      const existingBinding = settings?.repoCiBindings?.[String(repoId)];
      if (!existingBinding && pipelines.length > 0) {
        const match = matchPipelineForRepo(repo.name, pipelines);
        if (match.bestMatch) {
          await saveRepoCiBinding(repo.id, {
            provider: 'flow',
            pipelineId: match.bestMatch.pipelineId,
            pipelineName: match.bestMatch.pipelineName,
          });
          ciMsg = `，并智能关联流水线「${match.bestMatch.pipelineName}」`;
        }
      }
      setToast({ text: `已成功关联仓库 ${repo.pathWithNamespace || repo.name}${ciMsg}`, kind: 'ok' });
      setRecommendedRepos((prev) => prev.filter((r) => r.repoId !== repoId));
    } catch (error) {
      setToast({
        text: (repoLinked ? '仓库已关联，但后续配置保存失败' : '云效仓库关联保存失败') + '：' + humanizeError(error),
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
    const nextRepoIds = explicitRepoIds.filter((id) => id !== repoId);
    void saveWorkitemRepos(selectedId, nextRepoIds)
      .then(() => setToast({ text: '已取消关联云效仓库', kind: 'ok' }))
      .catch((e) => {
        errorLog('repo-unlink', e);
        setToast({ text: `取消关联云效仓库失败：${humanizeError(e)}`, kind: 'fail' });
      })
      .finally(() => setSavingRepos(false));
  };

  /** 恢复使用设置中的默认云效仓库（清除本需求的单独覆盖） */
  const handleResetRepos = () => {
    if (!selectedId) return;
    setSavingRepos(true);
    void saveWorkitemRepos(selectedId, null)
      .then(() => setToast({ text: '已恢复默认云效仓库', kind: 'ok' }))
      .catch((e) => {
        errorLog('repo-link-save', e);
        setToast({ text: `云效仓库关联保存失败：${humanizeError(e)}`, kind: 'fail' });
      })
      .finally(() => setSavingRepos(false));
  };

  return (
    <div className={cn('flex min-w-0 flex-col', embedded ? 'gap-0' : 'gap-6')}>
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
                    onPress={onBackToList}
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
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onPress={() => {
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
                <span className="inline-flex shrink-0 items-center gap-0.5">
                  <Chip size="sm" variant="secondary" className="font-mono gap-1">
                    <Chip.Label>{identifier}</Chip.Label>
                  </Chip>
                  <CopyButton text={identifier} label="复制编号" />
                </span>
              )}
              <OverflowTooltip
                text={subject}
                className="min-w-0 truncate text-base font-semibold text-foreground"
              />
            </span>
          )}
          titleClassName="flex min-w-0 items-center gap-2.5 select-text cursor-text"
          actions={(
            /* 常驻图标操作：刷新 / 全屏 / 关闭；写操作与低频动作收进「更多操作」 */
            <div className="flex shrink-0 items-center gap-1">
              {selectedId && (
                <RequirementMoreActionsMenu
                  workitemId={selectedId}
                  category={category}
                  parentWorkitemId={parent?.workitemId}
                  activeRepoLabel={activeRepoName}
                  showBranchTopology={isRequirement}
                  onOpenBranchTopology={() => setIsBranchDiagramModalOpen(true)}
                  onOpenYunxiao={handleOpenInYunxiao}
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onPress={() => void handleRefreshDetail()}
                aria-label="刷新工作项及追溯"
              >
                <RefreshCwIcon className={cn('size-4', refreshing && 'animate-spin')} />
              </Button>
              {onOpenWorkbench && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onPress={onOpenWorkbench}
                  aria-label="在工作台全屏打开"
                >
                  <Maximize2Icon className="size-4" />
                </Button>
              )}
              {onClose && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onPress={onClose}
                  aria-label="关闭分栏 (Esc)"
                >
                  <XIcon className="size-4" />
                </Button>
              )}
            </div>
          )}
          toolbar={(
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 w-full text-xs">
              {/* 状态与负责人 Select（顶部常驻元数据条最前列：就地快速流转与分配） */}
              <DetailStatusPopover
                status={statusName}
                statusId={statusId}
                workitemId={selectedId ?? undefined}
                variant="badge"
              />
              <DetailAssigneePopover
                assignedToName={assignedToName}
                workitemId={selectedId}
                candidateAssignees={candidateAssignees}
                variant="badge"
              />

              <span className="h-4 w-px bg-border/60 mx-0.5 shrink-0" aria-hidden />

              {/* 类型 Chip */}
              <Chip
                size="sm"
                variant="soft"
                className="gap-1.5 text-foreground/85 select-none"
                title={`工作项类型：${category in CATEGORY_LABELS ? CATEGORY_LABELS[category as Category] : category}`}
              >
                <LayersIcon className="size-3.5 text-muted-foreground shrink-0" />
                <Chip.Label>{category in CATEGORY_LABELS ? CATEGORY_LABELS[category as Category] : category}</Chip.Label>
              </Chip>

              {/* 关联仓库 Chip */}
              <Button
                type="button"
                variant="ghost"
                size="inline"
                className="gap-1.5 p-0 font-normal"
                aria-label={`已关联 ${explicitRepoIds.length} 个代码仓库，点击切换至关联仓库标签页`}
                onPress={() => {
                  setActiveTab('repos');
                  const el = document.getElementById('linked-repos-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <Chip size="sm" variant="soft" className="gap-1.5 text-foreground/85">
                  <DatabaseIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <Chip.Label>{explicitRepoIds.length} 个仓库</Chip.Label>
                </Chip>
              </Button>

              {/* 父需求 Chip */}
              {parent && (
                <Button
                  type="button"
                  variant="ghost"
                  size="inline"
                  className="gap-1.5 p-0 font-normal"
                  aria-label={`所属父需求：${parent.identifier} ${parent.subject || ''}`}
                  onPress={() => {
                    if (onSelectParent) onSelectParent(parent.workitemId);
                    else openWorkitem(parent.workitemId, parent);
                  }}
                >
                  <Chip size="sm" variant="soft" color="accent" className="gap-1.5 max-w-56 font-mono">
                    <GitForkIcon className="size-3.5 shrink-0" />
                    <Chip.Label className="truncate">
                      {parent.identifier}{parent.subject ? ` · ${parent.subject}` : ''}
                    </Chip.Label>
                  </Chip>
                </Button>
              )}
            </div>
          )}
        />
      ) : (
        <PageHeader
          breadcrumb={<AppBreadcrumb />}
          density={compactHeader ? 'compact' : 'regular'}
          title={(
            <span className="flex min-w-0 items-center gap-2.5">
              <StatusIcon status={statusName} className="size-4 shrink-0" />
              <OverflowTooltip
                text={subject}
                className="min-w-0 truncate text-foreground"
              />
            </span>
          )}
          titleBadge={identifier ? (
            <span className="inline-flex shrink-0 items-center gap-0.5">
              <Chip size="sm" variant="secondary" className="font-mono gap-1.5">
                <Chip.Label>{identifier}</Chip.Label>
              </Chip>
              <CopyButton text={identifier} label="复制编号" />
            </span>
          ) : undefined}
          actions={(
            <div className="flex items-center gap-1.5">
              {selectedId && (
                <RequirementMoreActionsMenu
                  workitemId={selectedId}
                  category={category}
                  parentWorkitemId={parent?.workitemId}
                  activeRepoLabel={activeRepoName}
                  showBranchTopology={isRequirement}
                  onOpenBranchTopology={() => setIsBranchDiagramModalOpen(true)}
                  onOpenYunxiao={handleOpenInYunxiao}
                />
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onPress={() => void handleRefreshDetail()}
                aria-label="刷新详情"
                title="刷新工作项及追溯"
              >
                <RefreshCwIcon className={cn('size-4', refreshing && 'animate-spin')} />
              </Button>
            </div>
          )}
          className={STICKY_PAGE_HEADER_CLASS}
        />
      )}

      {/* 正文容器：embedded 下全宽单列呼吸感布局，非 embedded 下保留 xl:grid 右属性栏 */}
      <div className={cn(
        'mx-auto flex w-full flex-col gap-8 pb-12',
        embedded
          ? 'max-w-full px-5 pt-5 pb-12'
          : 'max-w-5xl xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-10 px-5 py-2',
      )}>
        {/* 左主列：无卡片白框，纯粹呼吸感的 Linear 画布 */}
        <div className="flex min-w-0 flex-col gap-8">
          {parent && (
            <Surface variant="secondary" className="flex flex-row items-center justify-between px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">
                  {category === 'Bug' ? '关联缺陷挂载于需求：' : '子任务挂载于需求：'}
                </span>
                <Button
                  type="button"
                  variant="link"
                  onPress={() => {
                    if (embedded && onSelectParent) {
                      onSelectParent(parent.workitemId);
                    } else {
                      openWorkitem(parent.workitemId, parent);
                    }
                  }}
                  className="gap-1.5 truncate"
                >
                  <span className="font-mono text-xs shrink-0">{parent.identifier}</span>
                  <OverflowTooltip text={parent.subject} className="truncate max-w-xs" />
                </Button>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {embedded && !isRequirement && selectedId && (
                  <StartProcessingButton
                    workitemId={selectedId}
                    category={category === 'Bug' ? 'Bug' : 'Task'}
                    parentWorkitemId={parent.workitemId}
                    size="xs"
                  />
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onPress={() => {
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
            </Surface>
          )}

          {/* 分栏导航 Tabs（HeroUI 胶囊分段 Tabs，对齐 Linear / HeroUI Pro 风格）；
              操作按钮与 Tabs 同行右置（仅嵌入模式，全屏工作台操作保留在页头） */}
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => setActiveTab(String(key) as DetailTabKey)}
            className="w-full gap-4"
          >
            <div className="flex w-full min-w-0 items-center justify-between gap-2">
              <Tabs.ListContainer className="w-fit min-w-0">
                <Tabs.List aria-label="需求详情分栏导航">
                  <Tabs.Tab id="repos">
                    <span className="flex items-center gap-1.5">
                      <span>交付进展</span>
                      {explicitRepoIds.length > 0 && (
                        <span className="rounded-sm border border-border/40 bg-surface-secondary/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-foreground/85">
                          {explicitRepoIds.length}
                        </span>
                      )}
                    </span>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="description">
                    <span>描述</span>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  {isRequirement && (
                    <Tabs.Tab id="children">
                      <span className="flex items-center gap-1.5">
                        <span>子工作项</span>
                        {subtasks.length + defects.length > 0 && (
                          <span className="rounded-sm border border-border/40 bg-surface-secondary/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-foreground/85">
                            {subtasks.length + defects.length}
                          </span>
                        )}
                      </span>
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  )}
                  <Tabs.Tab id="activity">
                    <span className="flex items-center gap-1.5">
                      <span>活动动态</span>
                      {comments.length > 0 && (
                        <span className="rounded-sm border border-border/40 bg-surface-secondary/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-foreground/85">
                          {comments.length}
                        </span>
                      )}
                    </span>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
            </div>

            {/* 标签页 1：需求描述 */}
            <Tabs.Panel id="description" className="p-0 outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <section className="flex flex-col gap-3">
                <SectionHeader
                  title="描述"
                  action={
                    selectedId && !isEditingDesc ? (
                      allowWrite ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onPress={() => setIsEditingDesc(true)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                          title="编辑描述"
                        >
                          <PencilIcon className="size-3 mr-1" />
                          编辑
                        </Button>
                      ) : (
                        // 只读态不隐藏入口：灰阶 + Tooltip + Toast 引导前往设置
                        <WriteOpGatedTrigger
                          label="编辑描述"
                          icon={<PencilIcon className="size-3" />}
                          variant="ghost"
                        />
                      )
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
            </Tabs.Panel>

            {/* 标签页 2：关联云效仓库与代码操作 */}
            <Tabs.Panel id="repos" className="p-0 outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <section id="linked-repos-section" className="flex flex-col gap-3">
            {/* 交付进展：常驻 刷新全部 / 关联仓库入口；AI 推荐仓库与恢复默认仓库收进「更多」菜单 */}
            <SectionHeader
              title="交付进展"
              count={`· ${explicitRepoIds.length}`}
              action={(
                <div className="flex items-center gap-1.5">
                  {/* 子项关联仓库继承父需求：增删/推荐/轨道配置在需求页管理，子项只读继承 */}
                  {!isRequirement && parent && (
                    <span
                      className="truncate font-mono text-[11px] text-muted-foreground"
                      title={`关联仓库继承自父需求：${parent.identifier} ${parent.subject || ''}`}
                    >
                      继承自父需求 {parent.identifier}
                    </span>
                  )}
                  <Tooltip>
                    <TooltipTrigger
                      render={(
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={refreshingCodeArea || traceLoading}
                          onPress={() => void handleRefreshCodeArea()}
                          aria-label="刷新全部关联仓库"
                        />
                      )}
                    >
                      <RefreshCwIcon
                        className={cn(
                          'size-3.5',
                          (refreshingCodeArea || traceLoading) && 'animate-spin text-primary',
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>刷新全部关联仓库</TooltipContent>
                  </Tooltip>
                  {isRequirement && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 cursor-pointer"
                      onPress={() => setIsLinkRepoModalOpen(true)}
                    >
                      <PlusIcon data-icon="inline-start" />
                      <span>关联仓库</span>
                    </Button>
                  )}
                  {isRequirement && (
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="交付进展更多操作" />}>
                        <MoreHorizontalIcon className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          disabled={recommendingRepos}
                          title="让 AI 依据需求文本与提交历史，智能推荐关联仓库"
                          onPress={() => void handleRecommendRepos()}
                        >
                          {recommendingRepos
                            ? <Loader2Icon className="size-3.5 mr-2 animate-spin" />
                            : <SparklesIcon className="size-3.5 mr-2" />}
                          <span>{recommendingRepos ? 'AI 推荐中…' : 'AI 推荐仓库'}</span>
                        </DropdownMenuItem>
                        {hasRepoOverride && (
                          <DropdownMenuItem
                            disabled={savingRepos}
                            title="清除本需求的仓库覆盖，恢复使用设置中的默认云效仓库"
                            onClick={handleResetRepos}
                          >
                            <RotateCcwIcon className="size-3.5 mr-2" />
                            <span>恢复默认仓库</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
            />

            <LinkRepoModal
              open={isLinkRepoModalOpen}
              onOpenChange={setIsLinkRepoModalOpen}
              repositories={repositories}
              effectiveRepoIds={explicitRepoIds}
              fusedTemplates={fusedTemplates}
              iterationId={iterationId}
              isRequirement={isRequirement}
              savingRepos={savingRepos}
              recommendingRepos={recommendingRepos}
              recommendedRepos={recommendedRepos}
              onRecommendRepos={handleRecommendRepos}
              onClearRecommendations={() => setRecommendedRepos([])}
              onQuickLinkRepo={handleQuickLinkRepo}
              onLinkRepo={handleLinkRepoFromModal}
            />

            <BranchStateDiagramModal
              open={isBranchDiagramModalOpen}
              onOpenChange={setIsBranchDiagramModalOpen}
              requirement={{ identifier, subject }}
              repos={syncDiagramRepos}
            />

            {/* 列表外框容器：参考 Ant Design / Linear 标准列表，卡片包裹 + 细线分割 */}
            {linkedRepos.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {/* 状态分类 Filter Tabs（仓库 >= 2 时展示） */}
                {linkedRepos.length >= 2 && (
                  <div className="flex items-center justify-between gap-2">
                    <Tabs
                      selectedKey={repoFilter}
                      onSelectionChange={(k) => setRepoFilter(String(k) as typeof repoFilter)}
                    >
                      <Tabs.ListContainer className="w-fit">
                        <Tabs.List aria-label="仓库状态过滤">
                          <Tabs.Tab id="all">
                            全部 {linkedRepos.length}
                            <Tabs.Indicator />
                          </Tabs.Tab>
                          <Tabs.Tab id="pending_merge">
                            待合入 {pendingMergeCount}
                            <Tabs.Indicator />
                          </Tabs.Tab>
                          <Tabs.Tab id="active">
                            进行中 {activeCount}
                            <Tabs.Indicator />
                          </Tabs.Tab>
                          <Tabs.Tab id="merged">
                            已合入 {mergedCount}
                            <Tabs.Indicator />
                          </Tabs.Tab>
                        </Tabs.List>
                      </Tabs.ListContainer>
                    </Tabs>

                    <span className="text-[11px] text-muted-foreground">
                      共 {filteredLinkedRepos.length} 个仓库
                    </span>
                  </div>
                )}

                {/* 仓库列表容器 */}
                <div className="flex flex-col gap-3">
                  {filteredLinkedRepos.map((repo) => {
                    const rule = repoBranchRules[repo.id];
                    const baselineCheck = baselineChecks[repo.id];
                    return (
                      <LinkedRepoCard
                        key={repo.id}
                        repo={repo}
                        identifier={identifier}
                        subject={subject}
                        workitemId={selectedId ?? undefined}
                        parentWorkitemId={parent?.workitemId}
                        iterationId={iterationId}
                        placeholderIteration={placeholderIteration}
                        branchRule={rule}
                        mergeRequests={mergeRequestsByRepoId.get(repo.id) ?? []}
                        matchedBranches={branchesByRepoId.get(repo.id) ?? []}
                        loadingBranches={traceLoading && !branchesByRepoId.has(repo.id)}
                        traceAvailable={branchesByRepoId.has(repo.id)}
                        templateId={branchRuleContextId ? settings?.workitemRepoBranchTemplates?.[branchRuleContextId]?.[String(repo.id)] : undefined}
                        templates={fusedTemplates}
                        templateEnabled={Boolean(isRequirement && iterationId)}
                        baselineBranch={rule?.baselineBranch}
                        baselineState={rule
                          ? baselineCheck?.branch === (isDirectConnectRule(rule)
                            ? rule.sourceBranch.trim()
                            : rule.baselineBranch.trim())
                            ? baselineCheck.state
                            : 'loading'
                          : undefined}
                        refreshSignal={codeAreaRefreshSignal}
                        onRetryBaseline={() => setBaselineRetry((value) => value + 1)}
                        onTemplateChange={(templateId) => void saveRepoTemplate(repo.id, templateId)}
                        onUnlinkRepo={isRequirement && explicitRepoIds.length > 0 ? (repoId) => unlinkRepo(repoId) : undefined}
                        operationBaseBranchOverride={!isRequirement && category === 'Bug' ? bugMrTargetByRepo[repo.id] : undefined}
                        bugMrContext={!isRequirement && category === 'Bug' && parent && selectedId ? {
                          bugWorkitemId: selectedId,
                          requirementIdentifier: parent.identifier,
                          requirementSubject: parent.subject ?? '',
                        } : undefined}
                      />
                    );
                  })}
                  {filteredLinkedRepos.length === 0 && (
                    <EmptyHint
                      icon={InboxIcon}
                      title="当前筛选条件下暂无关联仓库"
                      className="py-6"
                      action={(
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onPress={() => setRepoFilter('all')}
                        >
                          清除筛选
                        </Button>
                      )}
                    />
                  )}
                </div>
              </div>
            ) : (
              <>
              <EmptyHint
                icon={InboxIcon}
                title={hasRepoOverride ? '关联仓库为空' : '未显式关联云效仓库'}
                description={
                  isRequirement
                    ? (hasRepoOverride
                      ? '该需求显式关联为空，追溯不会扫描仓库；可从上方「关联仓库」重新选择，或在「更多」中恢复默认仓库。'
                      : `尚未显式关联仓库；追溯默认扫描 ${scanRepoIds.length} 个云效仓库（团队默认池）。关联后只追溯你挑选的仓库。`)
                    : (hasRepoOverride
                      ? `父需求${parent ? `（${parent.identifier}）` : ''}显式关联为空，子项不再追溯任何仓库；请在父需求详情页重新配置。`
                      : `关联仓库继承自父需求${parent ? `（${parent.identifier}）` : ''}：父需求未显式关联时沿用其默认扫描池，请在父需求详情页配置。`)
                }
                className="rounded-xl border border-dashed py-8"
                action={isRequirement ? (
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={recommendingRepos}
                      onPress={() => void handleRecommendRepos()}
                      className="gap-1.5 cursor-pointer"
                    >
                      {recommendingRepos ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <SparklesIcon className="size-3.5" />
                      )}
                      <span>{recommendingRepos ? 'AI 正在智能分析推荐…' : 'AI 智能推荐关联仓库'}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => setIsLinkRepoModalOpen(true)}
                      className="gap-1 cursor-pointer"
                    >
                      <PlusIcon className="size-3.5" />
                      <span>手动选择仓库</span>
                    </Button>
                  </div>
                ) : undefined}
              />
              {isRequirement && !hasRepoOverride && scanRepoIds.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2.5">
                  <Collapsible open={showDefaultPool} onOpenChange={setShowDefaultPool}>
                    <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                      <ChevronRightIcon className="size-3.5 transition-transform data-[expanded]:rotate-90" />
                      <span>默认扫描仓库（团队默认池） · {scanRepoIds.length}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        来源：团队默认池（设置 → 追溯规则中的默认扫描仓库）。未显式关联时仅按此池追溯，不等同于已关联。
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {repositories
                          .filter((repo) => scanRepoIds.includes(repo.id))
                          .map((repo) => (
                            <Chip
                              key={repo.id}
                              size="sm"
                              variant="secondary"
                              className="font-mono"
                              title={repo.pathWithNamespace || repo.name}
                            >
                              {repo.pathWithNamespace || repo.name}
                            </Chip>
                          ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
              </>
            )}

            {/* AI 推荐结果展示卡片区（直接在关联仓库正下方呈现） */}
            {recommendedRepos.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg bg-primary/5 p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-primary flex items-center gap-1.5">
                    <SparklesIcon className="size-3.5" />
                    <span>AI 智能推荐的相关代码仓库 ({recommendedRepos.length})</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onPress={() => setRecommendedRepos([])}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    清空推荐
                  </Button>
                </div>

                <div className={cn('grid gap-2.5', embedded ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
                  {recommendedRepos.map((rec) => {
                    const targetRepo = repositories.find((r) => r.id === rec.repoId);
                    const repoName = targetRepo?.name
                      || (typeof rec.repoName === 'string' && rec.repoName.includes('/') ? rec.repoName.split('/').pop() : rec.repoName)
                      || '未知仓库';
                    const repoPath = targetRepo?.pathWithNamespace || rec.repoName;

                    return (
                      <Card
                        key={rec.repoId}
                        className="justify-between p-3 transition-colors hover:bg-surface-secondary"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <GitBranchIcon className="size-3.5 shrink-0 text-primary" />
                              <span className="font-semibold text-xs text-foreground truncate" title={repoName}>
                                {repoName}
                              </span>
                            </div>
                            {rec.confidence === 'high' && (
                              <Chip size="sm" variant="soft" color="success" className="font-medium shrink-0">
                                高置信
                              </Chip>
                            )}
                          </div>
                          {repoPath && repoPath !== repoName && (
                            <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" title={repoPath}>
                              {repoPath}
                            </span>
                          )}
                          <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            {rec.reason}
                          </p>
                        </div>
                        <div className="flex justify-end pt-1.5 border-t border-border/40">
                          {/* 「直接关联」会写入需求仓库覆盖与模板/CI 绑定：只读态保留入口但灰阶 + Toast 引导 */}
                          {allowWrite ? (
                            <Button
                              size="xs"
                              disabled={savingRepos}
                              onPress={() => void handleQuickLinkRepo(rec.repoId)}
                              className="cursor-pointer"
                            >
                              直接关联
                            </Button>
                          ) : (
                            <WriteOpGatedTrigger
                              label="直接关联"
                              variant="ghost"
                            />
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </Tabs.Panel>


        {/* 标签页 4：子工作项与缺陷 */}
        {isRequirement && (
          <Tabs.Panel id="children" className="p-0 outline-none focus-visible:ring-1 focus-visible:ring-ring">
            {(() => {
              const openChild = (child: WorkitemChild) => {
                setActiveChildId(child.workitemId);
                // 嵌入态（Peek 抽屉）就地钻取到子项，避免抽屉套抽屉；独立工作台保留子项抽屉。
                if (embedded && onSelectChild) {
                  onSelectChild(child);
                  return;
                }
                setDrawerChild(child);
              };

              return (
                <div className="flex flex-col gap-6">
                  {childrenTruncated && (
                    <p className="text-[11px] text-muted-foreground" data-testid="children-truncated-hint">
                      仅显示最近的子项，可能还有更多
                    </p>
                  )}
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
                    parentDescription={richTextToPlain(wi.description ?? wi.content) || undefined}
                    explicitRepoIds={explicitRepoIds}
                    collectBreakdownContext={collectBreakdownContext}
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
                    parentDescription={richTextToPlain(wi.description ?? wi.content) || undefined}
                    explicitRepoIds={explicitRepoIds}
                    collectBreakdownContext={collectBreakdownContext}
                    parentAssigneeId={parentAssigneeId}
                    parentAssigneeName={assignedToName}
                    candidateAssignees={candidateAssignees}
                    selectedChildId={activeChildId}
                    onSelect={openChild}
                  />
                </div>
              );
            })()}
          </Tabs.Panel>
        )}

        {/* 标签页 4：Activity / 评论讨论（1:1 对齐 Linear Activity 时间轴与 AI 赋能） */}
        <Tabs.Panel id="activity" className="p-0 outline-none focus-visible:ring-1 focus-visible:ring-ring">
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
        </Tabs.Panel>
      </Tabs>
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
            creatorName={creatorName}
            parent={parent}
            spaceName={spaceName}
            iterationName={iterationName}
            updatedAt={updatedAt}
            effectiveRepoCount={explicitRepoIds.length}
            iterationBranchValue={iterationBranchValue}
            embedded={embedded}
            onSelectParent={onSelectParent}
          />
        )}
      </div>

      {/* 子工作项/缺陷详情侧滑抽屉（Linear Peek 面板）：
          嵌入态下子任务行优先走 onSelectChild 就地钻取，本抽屉仅作为无钻取回调时的兜底 */}
      <ChildDetailDrawer
        child={latestDrawerChild}
        parentWorkitem={selectedId && identifier ? { workitemId: selectedId, identifier, subject } : null}
        candidateAssignees={candidateAssignees}
        onClose={() => setDrawerChild(null)}
        onOpenInWorkbench={(child) => {
          setDrawerChild(null);
          if (!selectedId) return;
          if (embedded && onOpenWorkbench) {
            // 嵌入态：「在工作台打开」= 全屏工作台，而非钻取。
            // Peek 抽屉注入的无参回调只绑定「当前需求」，无法定位子项；此时以子项为目标直接送入工作台。
            if (onOpenWorkbench.length > 0) {
              onOpenWorkbench(child);
            } else {
              openWorkitem(
                child.workitemId,
                { workitemId: child.workitemId, identifier: child.identifier, subject: child.subject },
                { workitemId: selectedId, identifier, subject },
              );
            }
            return;
          }
          openWorkitem(
            child.workitemId,
            { workitemId: child.workitemId, identifier: child.identifier, subject: child.subject },
            { workitemId: selectedId, identifier, subject },
          );
        }}
      />
    </div>
  );
}
