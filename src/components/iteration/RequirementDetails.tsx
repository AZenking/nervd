import { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowLeftIcon, CalendarIcon, CheckIcon, ChevronRightIcon, ClockIcon, CopyIcon, DatabaseIcon,
  ExternalLinkIcon, FolderIcon, InboxIcon, LayersIcon, MousePointerClickIcon, PlusIcon, RefreshCwIcon, UserIcon, XIcon,
} from 'lucide-react';
import { findRemoteBranch } from '@/lib/iteration-branches';
import { errorLog, humanizeError } from '@/lib/error-format';
import type { WorkitemChild } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { CATEGORY_LABELS, type Category } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect, type SearchableSelectOption } from '../searchable-select';
import { PageHeader, STICKY_PAGE_HEADER_CLASS } from '../page-header';
import { AppBreadcrumb } from '../nav/app-breadcrumb';
import { EmptyHint } from '../empty-hint';
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
import { DetailStatusPopover, RequirementProperties } from './requirement/requirement-properties';
import { RequirementActivity } from './requirement/requirement-activity';

export { RequirementDetailsSkeleton };
export type { RequirementDetailsProps };

/** 分支同步状态图（教学用静态图）：默认折叠，展开时才加载 React Flow 代码（lazy chunk） */
const BranchStateDiagram = lazy(() => import('./BranchStateDiagram'));

/** 需求/工作项详情（1:1 对齐 Linear 工具风格） */
export function RequirementDetails({
  embedded = false,
  parentWorkitem,
  onOpenWorkbench,
  onClose,
  onSelectChild,
  onSelectParent,
}: RequirementDetailsProps = {}) {
  const {
    selectedId, detail, comments, children, childrenError, childrenDebug, loadingDetail, items, settings, repositories,
    iterations, trace, traceLoading, loadTrace,
    saveWorkitemRepos, saveWorkitemRepoBranchTemplate, setToast,
  } = useApp();
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

  const statusName = (typeof wi.status === 'string' && wi.status)
    || (wi.status && typeof wi.status === 'object' && typeof (wi.status as any).name === 'string' ? (wi.status as any).name : '')
    || childFromStore?.status
    || cur?.status
    || '';

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

  const spaceName = (typeof wi.spaceName === 'string' && wi.spaceName)
    || (wi.space && typeof wi.space === 'object' && typeof (wi.space as any).name === 'string' ? (wi.space as any).name : '')
    || cur?.spaceName
    || '';

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

  // 子工作项/缺陷详情侧滑抽屉（Linear Peek 机制）：免刷新浏览，保留父需求完整上下文与列表焦点
  const [drawerChild, setDrawerChild] = useState<WorkitemChild | null>(null);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);

  useEffect(() => {
    setDrawerChild(null);
    setActiveChildId(null);
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
  const repoBranchRules: Record<number, ResolvedRepoBranchRule> = iterationId && selectedId
    ? Object.fromEntries(effectiveRepoIds.flatMap((repoId) => {
      const rule = resolveRepoBranchRule(settings, selectedId, repoId, iterationName, identifier);
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
    <div className="flex flex-col gap-6">
      {embedded ? (
        <div data-tauri-drag-region className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-border/70 bg-popover/95 px-5 pt-7 pb-3 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-2.5">
            {parent && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-6 text-muted-foreground hover:text-foreground shrink-0 -ml-1 mr-0.5"
                onClick={() => {
                  if (onSelectParent) onSelectParent(parent.workitemId);
                  else openWorkitem(parent.workitemId, parent);
                }}
                title={`返回父需求 ${parent.identifier}`}
              >
                <ArrowLeftIcon className="size-3.5" />
              </Button>
            )}
            <StatusIcon status={statusName} className="size-4 shrink-0" />
            {identifier && (
              <button
                type="button"
                onClick={copyIdentifier}
                className="group inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                title="点击复制编号"
              >
                <span>{identifier}</span>
                {copiedId ? <CheckIcon className="size-3 text-sig-ok" /> : <CopyIcon className="size-3 text-muted-foreground group-hover:text-foreground" />}
              </button>
            )}
            <h2 className="min-w-0 truncate text-base font-semibold text-foreground">
              {subject}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void loadTrace()}
              title="刷新追溯"
            >
              <RefreshCwIcon className={cn('size-3.5', traceLoading && 'animate-spin')} />
            </Button>
            {onOpenWorkbench && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onOpenWorkbench}
                title="在工作台全屏打开"
              >
                <ExternalLinkIcon className="size-3.5" />
              </Button>
            )}
            {onClose && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onClose}
                title="关闭分栏 (Esc)"
              >
                <XIcon className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <PageHeader
          breadcrumb={<AppBreadcrumb />}
          title={(
            <span className="flex min-w-0 items-center gap-2.5">
              <StatusIcon status={statusName} className="size-4 shrink-0" />
              <span className="min-w-0 truncate text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                {subject}
              </span>
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
                onClick={() => void loadTrace()}
              >
                刷新追溯
              </Button>
            </div>
          )}
          className={STICKY_PAGE_HEADER_CLASS}
        />
      )}

      {/* 嵌入分栏模式下的紧凑元数据条（替代占用整列的右属性栏，释放横向空间） */}
      {embedded && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/50 bg-muted/20 px-5 py-2 text-xs text-muted-foreground">
          <DetailStatusPopover
            status={statusName}
            workitemId={selectedId ?? undefined}
            variant="badge"
          />
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <UserIcon className="size-3.5 text-muted-foreground" />
            {assignedToName ? (
              <span className="flex items-center gap-1 text-foreground">
                <Avatar className="size-4">
                  <AvatarFallback className="text-[9px]">{assignedToName.charAt(0)}</AvatarFallback>
                </Avatar>
                <span>{assignedToName}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">未分配</span>
            )}
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <LayersIcon className="size-3.5 text-muted-foreground" />
            <span className="text-foreground">{category in CATEGORY_LABELS ? CATEGORY_LABELS[category as Category] : category}</span>
          </div>
          {parent && (
            <>
              <span className="text-border">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">父需求</span>
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
            </>
          )}
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            <span className="text-foreground">{iterationName || '未关联迭代'}</span>
          </div>
          {spaceName && (
            <>
              <span className="text-border">|</span>
              <div className="flex items-center gap-1.5">
                <FolderIcon className="size-3.5 text-muted-foreground" />
                <span>{spaceName}</span>
              </div>
            </>
          )}
          {updatedAt && (
            <>
              <span className="text-border">|</span>
              <div className="flex items-center gap-1.5 font-mono">
                <ClockIcon className="size-3.5 text-muted-foreground" />
                <span>{String(updatedAt).slice(0, 16).replace('T', ' ')}</span>
              </div>
            </>
          )}
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <DatabaseIcon className="size-3.5 text-muted-foreground" />
            <span>{effectiveRepoIds.length} 个仓库</span>
            {iterationBranchValue && iterationBranchValue !== '—' && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                {iterationBranchValue}
              </span>
            )}
          </div>
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
                  <span className="truncate">{parent.subject}</span>
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
            <SectionHeader title="描述" hint="来自云效的图文描述与内联附件" />
            <div className="text-sm leading-relaxed text-foreground/90">
              <RichDescription raw={wi.description ?? wi.content} />
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
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3.5">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <Field>
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
                    <Field>
                      <FieldLabel>应用分支模板</FieldLabel>
                      <SearchableSelect
                        value={linkDraftTemplateId || '__none'}
                        onValueChange={(value) => setLinkDraftTemplateId(value && value !== '__none' ? value : '')}
                        items={[
                          { label: '不应用模板', value: '__none' },
                          ...(settings?.branchRuleTemplates ?? []).map((template): SearchableSelectOption<string> => ({
                            label: template.name,
                            value: template.id,
                          })),
                        ]}
                      />
                      {!settings?.branchRuleTemplates?.length && (
                        <p className="text-xs text-muted-foreground">请先在迭代页创建分支模板。</p>
                      )}
                    </Field>
                  )}
                  <div className="flex items-end">
                    <Button onClick={linkRepository} disabled={!linkDraft || savingRepos}>确认关联</Button>
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
                    templates={settings?.branchRuleTemplates ?? []}
                    templateEnabled={Boolean(isRequirement && iterationId)}
                    baselineBranch={rule?.baselineBranch}
                    baselineState={rule
                      ? baselineCheck?.branch === rule.baselineBranch ? baselineCheck.state : 'loading'
                      : undefined}
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
            const subtasks = children.filter((c) => c.category !== 'Bug');
            const defects = children.filter((c) => c.category === 'Bug');
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
                  parentAssigneeId={parentAssigneeId}
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
                  parentAssigneeId={parentAssigneeId}
                  selectedChildId={activeChildId}
                  onSelect={openChild}
                />
              </div>
            );
          })()}

          {/* Activity / 评论讨论（1:1 对齐 Linear Activity 时间轴） */}
          <RequirementActivity comments={comments} />
        </div>

        {/* 右侧边栏：Linear 式属性栏（全屏/非 embedded 模式下展示） */}
        {!embedded && (
          <RequirementProperties
            statusName={statusName}
            selectedId={selectedId}
            assignedToName={assignedToName}
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
        child={drawerChild}
        parentWorkitem={selectedId && identifier ? { workitemId: selectedId, identifier, subject } : null}
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
