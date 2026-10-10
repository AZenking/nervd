import { useEffect, useState } from 'react';
import {
  InboxIcon, MessageSquareIcon, MoreHorizontalIcon, MousePointerClickIcon, XIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { findRemoteBranch } from '@/lib/iteration-branches';
import { errorLog, humanizeError } from '@/lib/error-format';
import type { WorkitemChild } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import type { BranchRuleTemplate, MrSummary, RepoSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchableSelect, type SearchableSelectOption } from '../searchable-select';
import { PageHeader } from '../page-header';
import { AppBreadcrumb } from '../nav/app-breadcrumb';
import { EmptyHint } from '../empty-hint';
import { BranchDivergenceCheck } from './BranchDivergenceCheck';
import { JenkinsBuildDialog } from './JenkinsBuildDialog';
import { RepositoryCiDetails } from './RepositoryCiDetails';
import { RelatedCommitsCard } from './RelatedCommitsCard';
import { ChildDetailDrawer } from './child-detail-drawer';
import { RichDescription } from './rich-description';
import { SubtaskEditDialog } from './SubtaskEditDialog';
import { StatusBadge } from '../StatusBadge';
import { WriteOpButton } from '../WriteOpButton';
import { CiSummaryButton } from '../ci-summary-button';
import { TableEmptyRow } from '../table-empty-row';
import { SectionHeader, PropertyRow } from '../section-header';
import { ciStatusText, triggerRepoCiWithFeedback } from '@/lib/ci';

interface ResolvedRepoBranchRule {
  sourceBranch: string;
  baselineBranch: string;
  workitemBranch: string;
  templateName: string;
}

function expandBranchPattern(
  pattern: string,
  values: { iteration: string; template: string; identifier: string },
): string {
  const branchPart = (value: string) => value.trim().replace(/\s+/g, '-').replace(/\\/g, '-');
  return pattern
    .replace(/\{iteration\}/g, branchPart(values.iteration))
    .replace(/\{template\}/g, branchPart(values.template))
    .replace(/\{identifier\}/g, branchPart(values.identifier));
}

function resolveRepoBranchRule(
  settings: ReturnType<typeof useApp.getState>['settings'],
  workitemId: string,
  repoId: number,
  iterationName: string,
  identifier: string,
): ResolvedRepoBranchRule | undefined {
  const templateId = settings?.workitemRepoBranchTemplates?.[workitemId]?.[String(repoId)];
  const template = settings?.branchRuleTemplates?.find((item) => item.id === templateId);
  if (template) {
    return {
      sourceBranch: template.sourceBranch,
      baselineBranch: expandBranchPattern(template.baselineBranchPattern, {
        iteration: iterationName,
        template: template.name,
        identifier,
      }),
      workitemBranch: expandBranchPattern(template.workitemBranchPattern, {
        iteration: iterationName,
        template: template.name,
        identifier,
      }),
      templateName: template.name,
    };
  }
  return undefined;
}

interface IterationBaselineCheck {
  branch: string;
  state: 'loading' | 'exists' | 'missing' | 'error';
  error?: string;
}

function mergeRequestRows(value: unknown): Record<string, unknown>[] {
  const root = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
  const rows = Array.isArray(value)
    ? value
    : ['result', 'data', 'items'].map((key) => root?.[key]).find(Array.isArray) ?? [];
  return rows.filter((row): row is Record<string, unknown> =>
    Boolean(row) && typeof row === 'object' && !Array.isArray(row),
  );
}

function mergeRequestBranch(request: Record<string, unknown>, camel: string, snake: string): string {
  const value = request[camel] ?? request[snake];
  return typeof value === 'string' ? value : '';
}

/** 子工作项/缺陷区块（Notion 数据库行形态）：行内极简展示，点击开详情抽屉 */
function ChildrenCard({
  title, description, items, error, debug, onSelect,
}: {
  title: string;
  description: string;
  items: WorkitemChild[];
  error?: string | null;
  debug?: string | null;
  onSelect: (child: WorkitemChild) => void;
}) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-border/70 pb-6">
      <SectionHeader title={title} count={items.length} hint={description} />
      {items.map((task) => (
        <button
          key={task.workitemId}
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
          onClick={() => onSelect(task)}
        >
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{task.identifier}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{task.subject || task.identifier}</span>
          <StatusBadge status={task.status} size="sm" />
        </button>
      ))}
        {!items.length && !error && (
          <EmptyHint compact icon={InboxIcon} title={`暂无${title}`} className="min-h-0" />
        )}
        {!items.length && debug && (
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="max-h-20 overflow-y-auto break-all rounded bg-muted/50 px-3 py-2 font-mono text-xs leading-4 text-muted-foreground" />
              }
            >
              接口返回：{debug}
            </TooltipTrigger>
            <TooltipContent className="max-w-96">接口原始返回（诊断用）</TooltipContent>
          </Tooltip>
        )}
        {!items.length && error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
            {title}加载失败：{error}
          </div>
        )}
        {items.length > 0 && (
          <p className="text-xs text-muted-foreground">新增请在云效网页端操作（端内创建接口暂未接入）。</p>
        )}
    </section>
  );
}

/** 仓库行：展示当前工作项匹配到的远端分支与 CI 状态 */
function LinkedRepoRow({
  repo,
  identifier,
  subject,
  iterationId,
  placeholderIteration,
  branchRule,
  mergeRequests,
  matchedBranches,
  loadingBranches,
  traceAvailable,
  templateId,
  templates,
  templateEnabled,
  baselineBranch,
  baselineState,
  onRetryBaseline,
  onTemplateChange,
}: {
  repo: RepoSummary;
  identifier: string;
  subject: string;
  iterationId?: string;
  placeholderIteration: boolean;
  branchRule?: ResolvedRepoBranchRule;
  mergeRequests: MrSummary[];
  matchedBranches: string[];
  loadingBranches: boolean;
  traceAvailable: boolean;
  templateId?: string;
  templates: BranchRuleTemplate[];
  templateEnabled: boolean;
  baselineBranch?: string;
  baselineState: IterationBaselineCheck['state'] | undefined;
  onRetryBaseline: () => void;
  onTemplateChange: (templateId: string | null) => void;
}) {
  const { repoCiByRepo, settings, loadTrace, setToast } = useApp();
  const [ciDetailsOpen, setCiDetailsOpen] = useState(false);
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const ciBinding = settings?.repoCiBindings?.[String(repo.id)];
  const isFlowBound = ciBinding?.provider === 'flow';
  const developerBranch = branchRule?.workitemBranch.trim() || (identifier ? `feature/${identifier}` : '');
  const operationBaseBranch = iterationId ? baselineBranch?.trim() ?? '' : 'master';
  const templateSourceBranch = branchRule?.sourceBranch.trim() ?? '';
  const hasValidRule = Boolean(
    branchRule?.sourceBranch.trim() && branchRule.baselineBranch.trim() && branchRule.workitemBranch.trim(),
  );
  const [developerBranchState, setDeveloperBranchState] = useState<IterationBaselineCheck['state']>('loading');
  const [defaultBaseState, setDefaultBaseState] = useState<IterationBaselineCheck['state']>('loading');
  const [createdMergeRequestKey, setCreatedMergeRequestKey] = useState('');
  const mergeRequestKey = `${repo.id}:${developerBranch}->${operationBaseBranch}`;

  useEffect(() => {
    let active = true;
    if (!developerBranch) {
      setDeveloperBranchState('missing');
      return () => { active = false; };
    }
    setDeveloperBranchState('loading');
    void findRemoteBranch(repo.id, developerBranch)
      .then((branch) => { if (active) setDeveloperBranchState(branch ? 'exists' : 'missing'); })
      .catch(() => { if (active) setDeveloperBranchState('error'); });
    return () => { active = false; };
  }, [repo.id, developerBranch]);

  useEffect(() => {
    let active = true;
    if (iterationId) {
      setDefaultBaseState('missing');
      return () => { active = false; };
    }
    setDefaultBaseState('loading');
    void findRemoteBranch(repo.id, 'master')
      .then((branch) => { if (active) setDefaultBaseState(branch ? 'exists' : 'missing'); })
      .catch(() => { if (active) setDefaultBaseState('error'); });
    return () => { active = false; };
  }, [repo.id, iterationId]);

  const mergeRequestExists = createdMergeRequestKey === mergeRequestKey || mergeRequests.some((request) =>
    request.sourceBranch === developerBranch && request.targetBranch === operationBaseBranch,
  );

  const branchDisabledReason = placeholderIteration
    ? '占位迭代不支持创建云效分支'
    : !identifier
      ? '工作项编号不可用'
      : iterationId && !hasValidRule
        ? '请先为此仓库选择有效的分支模板'
        : iterationId && baselineState === 'loading'
          ? '正在查询迭代基准分支'
          : iterationId && baselineState === 'error'
            ? '迭代基准查询失败，请重试后再创建'
            : !iterationId && defaultBaseState === 'loading'
              ? '正在查询 master 分支'
              : !iterationId && defaultBaseState !== 'exists'
                ? 'master 分支不可用，无法创建需求分支'
                : !operationBaseBranch
                  ? '模板未生成有效的迭代基准分支'
                  : developerBranchState === 'loading'
                    ? '正在查询需求分支'
                    : developerBranchState === 'exists'
                      ? '需求分支已存在'
                      : undefined;

  const mergeRequestDisabledReason = placeholderIteration
    ? '占位迭代不支持创建 MR'
    : !identifier
      ? '工作项编号不可用'
      : iterationId && !hasValidRule
        ? '请先为此仓库选择有效的分支模板'
        : iterationId && baselineState !== 'exists'
          ? baselineState === 'error' ? '迭代基准查询失败，请重试后再创建' : '请先创建需求分支和迭代基准分支'
          : !iterationId && defaultBaseState !== 'exists'
            ? 'master 分支不可用，无法创建 MR'
            : developerBranchState === 'loading'
              ? '正在查询需求分支'
              : developerBranchState === 'error'
                ? '需求分支查询失败，请刷新详情后重试'
                : developerBranchState !== 'exists'
                  ? '请先创建需求分支'
                  : !traceAvailable
                    ? '正在查询 MR 状态'
                    : mergeRequestExists
                      ? '此需求分支的 MR 已创建'
                      : undefined;

  const createDeveloperBranch = async () => {
    try {
      if (!identifier || !developerBranch || !operationBaseBranch) throw new Error('需求分支参数不完整');
      if (placeholderIteration) throw new Error('占位迭代不支持创建云效分支');
      if (iterationId && !hasValidRule) throw new Error('请先为此仓库选择有效的分支模板');
      if (developerBranch === operationBaseBranch) throw new Error('需求分支不能与迭代基准分支同名');

      const existing = await findRemoteBranch(repo.id, developerBranch);
      if (existing) {
        setDeveloperBranchState('exists');
        setToast({ text: `需求分支已存在，不会重复创建：${developerBranch}`, kind: 'info' });
        void loadTrace();
        return;
      }

      if (iterationId) {
        let baseline = await findRemoteBranch(repo.id, operationBaseBranch);
        if (!baseline) {
          if (!templateSourceBranch || templateSourceBranch === operationBaseBranch) {
            throw new Error('分支模板的源分支或迭代基准无效');
          }
          const source = await findRemoteBranch(repo.id, templateSourceBranch);
          if (!source) throw new Error(`模板源分支「${templateSourceBranch}」在线上不存在`);
          await api.createBranch(repo.id, operationBaseBranch, templateSourceBranch);
          baseline = await findRemoteBranch(repo.id, operationBaseBranch);
          if (!baseline) throw new Error(`迭代基准「${operationBaseBranch}」创建后未能查询到`);
          onRetryBaseline();
        }
      }

      const source = await findRemoteBranch(repo.id, operationBaseBranch);
      if (!source) throw new Error(`来源分支「${operationBaseBranch}」在线上不存在`);
      await api.createBranch(repo.id, developerBranch, operationBaseBranch);
      setDeveloperBranchState('exists');
      setToast({ text: `需求分支已创建：${developerBranch}`, kind: 'ok' });
      onRetryBaseline();
      void loadTrace();
    } catch (error) {
      errorLog('workitem-action', error); setToast({ text: humanizeError(error), kind: 'fail' });
    }
  };

  const createMergeRequest = async () => {
    try {
      if (!identifier || !developerBranch || !operationBaseBranch) throw new Error('MR 参数不完整');
      if (placeholderIteration) throw new Error('占位迭代不支持创建 MR');
      if (iterationId && (!hasValidRule || baselineState !== 'exists')) {
        throw new Error('请先确认分支模板和迭代基准分支');
      }
      const [sourceBranch, targetBranch] = await Promise.all([
        findRemoteBranch(repo.id, developerBranch),
        findRemoteBranch(repo.id, operationBaseBranch),
      ]);
      if (!sourceBranch) throw new Error(`需求分支「${developerBranch}」在线上不存在`);
      if (!targetBranch) throw new Error(`目标分支「${operationBaseBranch}」在线上不存在`);
      if (developerBranch === operationBaseBranch) throw new Error('MR 源分支和目标分支不能相同');

      const remoteRequests = mergeRequestRows(await api.listMergeRequests(repo.id));
      const existing = remoteRequests.some((request) =>
        mergeRequestBranch(request, 'sourceBranch', 'source_branch') === developerBranch
        && mergeRequestBranch(request, 'targetBranch', 'target_branch') === operationBaseBranch,
      );
      if (existing) {
        setCreatedMergeRequestKey(mergeRequestKey);
        setToast({ text: `此需求分支的 MR 已存在：${developerBranch} → ${operationBaseBranch}`, kind: 'info' });
        void loadTrace();
        return;
      }

      await api.createMergeRequest({
        repoId: repo.id,
        title: `${identifier} ${subject}`.trim(),
        sourceBranch: developerBranch,
        targetBranch: operationBaseBranch,
        description: `关联工作项：${identifier}`,
      });
      setCreatedMergeRequestKey(mergeRequestKey);
      setToast({ text: `MR 已创建：${developerBranch} → ${operationBaseBranch}`, kind: 'ok' });
      void loadTrace();
    } catch (error) {
      errorLog('workitem-action', error); setToast({ text: humanizeError(error), kind: 'fail' });
    }
  };

  return (
    <>
    <TableRow>
      <TableCell className="font-medium">
        <Tooltip>
          <TooltipTrigger render={<span className="block max-w-64 truncate" />}>
            {repo.name}
          </TooltipTrigger>
          <TooltipContent className="max-w-96 break-all">
            {repo.pathWithNamespace || repo.name}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="min-w-48">
        {templateEnabled ? (
          <SearchableSelect
            className="text-xs"
            value={templateId || '__none'}
            onValueChange={(value) => onTemplateChange(value && value !== '__none' ? value : null)}
            items={[
              { label: '未选择模板', value: '__none' },
              ...templates.map((template): SearchableSelectOption<string> => ({
                label: template.name,
                value: template.id,
              })),
              ...(templateId && !templates.some((template) => template.id === templateId)
                ? [{ label: '模板不可用', value: templateId, disabled: true }]
                : []),
            ]}
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="align-top">
        {loadingBranches ? (
          <span className="text-xs text-muted-foreground">追溯中…</span>
        ) : matchedBranches.length ? (
          <div className="flex min-w-40 flex-col items-start gap-1">
            {matchedBranches.map((branch) => (
              <div key={`${branch}:${baselineBranch ?? ''}`} className="flex flex-col items-start gap-1">
                <Tooltip>
                  <TooltipTrigger render={<code className="block max-w-56 truncate rounded bg-muted px-1.5 py-0.5 text-xs text-foreground" />}>
                    {branch}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-96 break-all">{branch}</TooltipContent>
                </Tooltip>
                {templateEnabled && (
                  <BranchDivergenceCheck
                    repoId={repo.id}
                    developmentBranch={branch}
                    baselineBranch={baselineBranch}
                    baselineState={baselineState}
                    onRetryBaseline={onRetryBaseline}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {traceAvailable ? '暂无匹配分支' : '—'}
          </span>
        )}
      </TableCell>
      <TableCell>
        <CiSummaryButton
          status={ciStatusText(snapshot?.status, entry)}
          runCount={snapshot?.runs.length ?? 0}
          error={entry?.error}
          tooltip="点击查看 CI Job、构建分支和环境详情"
          onOpen={() => setCiDetailsOpen(true)}
        />
      </TableCell>
      <TableCell className="min-w-40 text-right align-top">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* 按提供方分流：Flow 绑定 → 触发流水线；Jenkins / 未绑定 → Jenkins 构建向导 */}
          {isFlowBound ? (
            <WriteOpButton
              label="触发流水线"
              title={`触发流水线 ${ciBinding.pipelineName}`}
              variant="default"
              onAction={() => triggerRepoCiWithFeedback(repo.id, repo.name)}
            />
          ) : (
            <JenkinsBuildDialog
              repoId={repo.id}
              repoName={repo.name}
              defaultBranch={matchedBranches[0] || developerBranch}
            />
          )}
          <Collapsible render={<div className="contents" />}>
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
              <MoreHorizontalIcon data-icon="inline-start" />
              更多操作
            </CollapsibleTrigger>
            <CollapsibleContent className="basis-full flex flex-wrap items-center justify-end gap-1.5 pt-1">
              <WriteOpButton
                label="创建分支"
                title={developerBranch ? `创建需求分支 ${developerBranch}` : '创建需求分支'}
                variant="outline"
                disabled={Boolean(branchDisabledReason)}
                disabledReason={branchDisabledReason}
                onAction={createDeveloperBranch}
              />
              <WriteOpButton
                label="创建 MR"
                title={developerBranch && operationBaseBranch
                  ? `创建 MR：${developerBranch} → ${operationBaseBranch}`
                  : '创建 MR'}
                variant="outline"
                disabled={Boolean(mergeRequestDisabledReason)}
                disabledReason={mergeRequestDisabledReason}
                onAction={createMergeRequest}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </TableCell>
    </TableRow>
    <RepositoryCiDetails repo={repo} open={ciDetailsOpen} onOpenChange={setCiDetailsOpen} />
    </>
  );
}

/** 需求/工作项详情（UX A10：仓库与 CI 状态前置；基本信息压缩为元信息行） */
export function RequirementDetails() {
  const {
    selectedId, detail, comments, children, childrenError, childrenDebug, loadingDetail, items, settings, repositories,
    iterations, trace, traceLoading,
    saveWorkitemRepos, saveWorkitemRepoBranchTemplate, setToast,
  } = useApp();
  const { openWorkitem } = useUi();
  const cur = items.find((i) => i.workitemId === selectedId);
  const isRequirement = cur?.category === 'Req';
  const hasRepoOverride = selectedId != null && Object.prototype.hasOwnProperty.call(settings?.workitemRepos ?? {}, selectedId);
  const effectiveRepoIds = hasRepoOverride
    ? settings?.workitemRepos[selectedId!] ?? []
    : settings?.watchedRepos ?? [];
  const [linkDraft, setLinkDraft] = useState('');
  const [linkDraftTemplateId, setLinkDraftTemplateId] = useState('');
  const [savingRepos, setSavingRepos] = useState(false);
  const [editingChild, setEditingChild] = useState<WorkitemChild | null>(null);
  /** 行点击的详情抽屉（不再直接跳转工作台） */
  const [detailChild, setDetailChild] = useState<WorkitemChild | null>(null);

  const wi = (detail?.workitem ?? detail ?? {}) as Record<string, unknown>;
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
    : '';
  const repoBranchRules: Record<number, ResolvedRepoBranchRule> = iterationId && selectedId
    ? Object.fromEntries(effectiveRepoIds.flatMap((repoId) => {
      const rule = resolveRepoBranchRule(settings, selectedId, repoId, iterationName, cur?.identifier ?? '');
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

  const s = (k: string): string => {
    const v = wi[k];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return typeof o.name === 'string' ? o.name : '';
    }
    return '';
  };

  if (!selectedId) {
    return (
      <EmptyHint
        icon={MousePointerClickIcon}
        title="未选择工作项"
        description="在侧栏「迭代」分组或迭代页工作项卡片中选择一项以查看详情"
        className="mt-16"
      />
    );
  }
  if (loadingDetail) {
    return <div className="mt-16 py-16 text-center text-sm text-muted-foreground">加载详情…</div>;
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

  return (
    <div className="flex flex-col gap-5">
      {/* 统一 PageHeader：eyebrow=编号；高频的仓库/CI 状态紧随其后的属性区 */}
      <PageHeader
        breadcrumb={<AppBreadcrumb />}
        title={s('subject') || cur?.subject}
        titleBadge={<StatusBadge status={cur?.status || s('status') || undefined} />}
        description="集中管理工作项上下文、交付任务与仓库构建状态"
        className="sticky top-0 z-10 border-b border-border bg-background pb-4"
      />

      {/* Notion 式：页头贴左全宽，正文（属性区 + 区块）居中限宽 */}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
      {/* Notion 式属性区（properties）：字段名左列，值右列，行 hover 高亮 */}
      <div className="flex flex-col">
        <PropertyRow label="处理人">{cur?.assignedTo || s('assignedTo') || '—'}</PropertyRow>
        <PropertyRow label="项目">{cur?.spaceName || s('spaceName') || '—'}</PropertyRow>
        <PropertyRow label="更新">{cur?.updatedAt || s('updatedAt') || '—'}</PropertyRow>
        <PropertyRow label="云效仓库">{effectiveRepoIds.length} 个</PropertyRow>
        <PropertyRow label="迭代分支">{iterationBranchValue}</PropertyRow>
      </div>

      <section className="flex flex-col gap-3 border-b border-border/70 pb-6">
        <SectionHeader
          title="关联的云效仓库与代码操作"
          count={`${effectiveRepoIds.length} 个仓库`}
          hint={hasRepoOverride
            ? '此需求使用单独配置的云效仓库；可在列表中配置模板并创建开发分支或 MR'
            : '当前使用设置中的默认云效仓库；保存选择后将覆盖默认值'}
          action={hasRepoOverride && (
            <Button
              variant="outline" size="sm" disabled={savingRepos}
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
        />
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
              <Button onClick={linkRepository} disabled={!linkDraft || savingRepos}>关联云效仓库</Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>云效仓库</TableHead>
                <TableHead>分支模板</TableHead>
                <TableHead>{isRequirement ? '需求关联分支' : '工作项关联分支'}</TableHead>
                <TableHead>CI</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedRepos.map((repo) => {
                const rule = repoBranchRules[repo.id];
                const baselineCheck = baselineChecks[repo.id];
                return (
                  <LinkedRepoRow
                    key={repo.id}
                    repo={repo}
                    identifier={cur?.identifier ?? ''}
                    subject={cur?.subject ?? ''}
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
                  />
                );
              })}
              {!linkedRepos.length && (
                <TableEmptyRow
                  colSpan={5}
                  title="未关联云效仓库"
                  description="可在上方选择后关联，或在设置中选择默认云效仓库"
                />
              )}
            </TableBody>
          </Table>
      </section>

      <RelatedCommitsCard repoTraces={trace?.repositories ?? []} repositories={repositories} />

      <section className="flex flex-col gap-3 border-b border-border/70 pb-6">
        <SectionHeader title="描述" hint="来自云效的富文本描述与内联附件" />
        <RichDescription raw={wi.description ?? wi.content} />
      </section>

      {isRequirement && (() => {
        const subtasks = children.filter((c) => c.category !== 'Bug');
        const defects = children.filter((c) => c.category === 'Bug');
        // UX A2：行点击 = 详情抽屉；「在工作台打开」保留原跳转（父 › 子 面包屑链）
        const openChild = (child: WorkitemChild) => {
          if (!selectedId || !cur) return;
          openWorkitem(
            child.workitemId,
            { workitemId: child.workitemId, identifier: child.identifier, subject: child.subject },
            { workitemId: selectedId, identifier: cur.identifier, subject: cur.subject },
          );
        };
        return (
          <>
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <ChildrenCard
                title="子任务"
                description="挂载在该需求下的子工作项，点击打开详情抽屉"
                items={subtasks}
                error={childrenError}
                debug={childrenDebug}
                onSelect={setDetailChild}
              />
              <ChildrenCard
                title="缺陷"
                description="挂载在该需求下的缺陷，点击打开详情抽屉"
                items={defects}
                error={childrenError}
                debug={childrenDebug}
                onSelect={setDetailChild}
              />
            </div>
            <ChildDetailDrawer
              child={detailChild}
              onClose={() => setDetailChild(null)}
              onEdit={setEditingChild}
              onOpenInWorkbench={(child) => { openChild(child); setDetailChild(null); }}
            />
          </>
        );
      })()}
      {editingChild && selectedId && (
        <SubtaskEditDialog
          child={editingChild}
          parentWorkitemId={selectedId}
          onClose={() => setEditingChild(null)}
        />
      )}

      <section className="flex flex-col gap-3 border-b border-border/70 pb-6">
        <SectionHeader title="评论" count={comments.length || undefined} hint="来自云效的工作项评论" />
        {comments.length ? (
          <div className="divide-y divide-border">
            {(comments as Record<string, unknown>[]).map((c, i) => (
              <article key={i} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-foreground">
                    {String((c.author as Record<string, unknown>)?.name ?? c.creator ?? '—')}
                  </span>
                  <span className="text-xs text-muted-foreground">{String(c.createdAt ?? c.gmtCreate ?? '')}</span>
                </div>
                <div className="mt-2 text-sm leading-6 whitespace-pre-wrap text-foreground/85">{String(c.content ?? '')}</div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyHint icon={MessageSquareIcon} title="暂无评论" className="py-6" />
        )}
      </section>

      {settings?.allowWriteOps === false && (
        <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground')}>
          <XIcon data-icon="inline-start" />
          写操作未开启：设置 → 安全 → 允许写操作
        </p>
      )}
      </div>
    </div>
  );
}
