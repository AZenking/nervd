import { useEffect, useState } from 'react';
import {
  CheckIcon, ChevronDownIcon, GitBranchIcon, GitForkIcon, GitPullRequestIcon, MoreHorizontalIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { findRemoteBranch } from '@/lib/iteration-branches';
import { errorLog, humanizeError } from '@/lib/error-format';
import { ciStatusText, triggerRepoCiWithFeedback } from '@/lib/ci';
import { useApp } from '@/store/app';
import type { BranchRuleTemplate, MrSummary, RepoSummary } from '@/types';
import type { ScopedBranchRuleTemplate } from '@/lib/iteration-templates';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CopyButton } from '@/components/ui/copy-button';
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select';
import { WriteOpButton } from '@/components/WriteOpButton';
import { CiSummaryButton } from '@/components/ci-summary-button';
import { BranchDivergenceCheck } from '../BranchDivergenceCheck';
import { JenkinsBuildDialog } from '../JenkinsBuildDialog';
import { RepositoryCiDetails } from '../RepositoryCiDetails';
import { CreateMrDialog } from './create-mr-dialog';
import { MrInlineItem } from './mr-inline-item';
import { cn } from '@/lib/utils';
import {
  mergeRequestBranch,
  mergeRequestRows,
  type IterationBaselineCheck,
  type ResolvedRepoBranchRule,
} from './types';

export interface LinkedRepoCardProps {
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
  templates: (BranchRuleTemplate | ScopedBranchRuleTemplate)[];
  templateEnabled: boolean;
  baselineBranch?: string;
  baselineState: IterationBaselineCheck['state'] | undefined;
  onRetryBaseline: () => void;
  onTemplateChange: (templateId: string | null) => void;
  onUnlinkRepo?: (repoId: number) => void;
}

/** 仓库卡片：展示当前工作项关联的仓库，分支工作流（模板/需求分支/MR）与 CI 状态及就地操作 */
export function LinkedRepoCard({
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
  onUnlinkRepo,
}: LinkedRepoCardProps) {
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
  const [createMrOpen, setCreateMrOpen] = useState(false);
  const [expandedMrId, setExpandedMrId] = useState<number | null>(null);
  const [showAllMrs, setShowAllMrs] = useState(false);
  const mergeRequestKey = `${repo.id}:${developerBranch}->${operationBaseBranch}`;
  // 编号匹配到的其他分支超出 2 个截断，避免卡片过长
  const extraMatchedBranches = matchedBranches.filter((branch) => branch !== developerBranch);
  const shownMatchedBranches = extraMatchedBranches.slice(0, 2);
  const hiddenMatchedBranchCount = extraMatchedBranches.length - shownMatchedBranches.length;

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

  // 匹配本需求分支与目标基准分支的活跃中（未合入、未关闭）MR
  const matchedActiveMr = mergeRequests.find((request) => {
    const st = request.state?.toLowerCase();
    const isInactive = st === 'merged' || st === 'closed';
    if (isInactive) return false;
    return (
      (developerBranch && request.sourceBranch === developerBranch && operationBaseBranch && request.targetBranch === operationBaseBranch) ||
      (developerBranch && request.sourceBranch === developerBranch)
    );
  });
  const mergeRequestExists = Boolean(matchedActiveMr) || createdMergeRequestKey === mergeRequestKey;

  // 统一排序 MR 列表：优先匹配本需求开发分支的，其次按 localId 倒序
  const sortedMergeRequests = [...mergeRequests].sort((a, b) => {
    const aMatch = developerBranch && a.sourceBranch === developerBranch ? 1 : 0;
    const bMatch = developerBranch && b.sourceBranch === developerBranch ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    return b.localId - a.localId;
  });
  const displayedMergeRequests = showAllMrs ? sortedMergeRequests : sortedMergeRequests.slice(0, 2);
  const hasMoreMergeRequests = sortedMergeRequests.length > 2;

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
    <div className="rounded-xl border border-border/70 bg-card/60 p-4 transition-all hover:border-border hover:shadow-xs">
      {/* 头部：仓库标识与全路径 + CI 状态与触发操作（状态与操作就近闭环，避免折行） */}
      <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground">
            <GitBranchIcon className="size-4 text-primary" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 font-semibold text-foreground tracking-tight">{repo.name}</span>
              {repo.pathWithNamespace && repo.pathWithNamespace !== repo.name && (
                <span className="truncate font-mono text-xs text-muted-foreground" title={repo.pathWithNamespace}>
                  {repo.pathWithNamespace}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：CI 运行状态胶囊 + 紧挨着的流水线触发按钮 + 更多操作 */}
        <div className="flex shrink-0 items-center gap-2">
          <CiSummaryButton
            status={ciStatusText(snapshot?.status, entry)}
            runCount={snapshot?.runs.length ?? 0}
            error={entry?.error}
            tooltip="点击查看 CI Job、构建分支和环境详情"
            onOpen={() => setCiDetailsOpen(true)}
          />
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

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="更多操作" />}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {developerBranch && (
                <WriteOpButton
                  asMenuItem
                  label="创建分支"
                  title={`创建需求分支 ${developerBranch}`}
                  disabled={Boolean(branchDisabledReason)}
                  disabledReason={branchDisabledReason}
                  onAction={createDeveloperBranch}
                />
              )}
              <WriteOpButton
                asMenuItem
                label="创建 MR"
                title={developerBranch && operationBaseBranch
                  ? `创建 MR：${developerBranch} → ${operationBaseBranch}`
                  : '创建 MR'}
                disabled={Boolean(mergeRequestDisabledReason)}
                disabledReason={mergeRequestDisabledReason}
                onAction={createMergeRequest}
              />
              {sortedMergeRequests.length > 0 && !showAllMrs && (
                <DropdownMenuItem
                  onClick={() => setShowAllMrs(true)}
                >
                  展开全部合并请求 ({sortedMergeRequests.length})
                </DropdownMenuItem>
              )}
              {onUnlinkRepo && (
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onClick={() => onUnlinkRepo(repo.id)}
                >
                  取消关联此仓库
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 主体：研发分支与 MR 工作流（模板设置 -> 分支管理 -> MR 合并） */}
      <div className="grid gap-3.5 pt-3.5 grid-cols-1 xl:grid-cols-[260px_1fr]">
        {/* 左区块：分支模板 */}
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 p-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">分支模板</span>
              {hasValidRule && (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  规则就绪
                </span>
              )}
            </div>
            {templateEnabled ? (
              <SearchableSelect
                className="text-xs"
                value={templateId || '__none'}
                onValueChange={(value) => onTemplateChange(value && value !== '__none' ? value : null)}
                items={[
                  { label: '未选择模板', value: '__none' },
                  ...templates.map((template): SearchableSelectOption<string> => {
                    const scopeTag =
                      'scope' in template && template.scope === 'iteration'
                        ? ' (迭代专属)'
                        : 'scope' in template && template.scope === 'global'
                          ? ' (全局)'
                          : '';
                    return {
                      label: `${template.name}${scopeTag}`,
                      value: template.id,
                    };
                  }),
                  ...(templateId && !templates.some((template) => template.id === templateId)
                    ? [{ label: '模板不可用', value: templateId, disabled: true }]
                    : []),
                ]}
              />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5 text-[11px] text-muted-foreground border-t border-border/30 pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0">基准分支</span>
              <code className="truncate font-mono text-foreground/80" title={operationBaseBranch}>{operationBaseBranch || '—'}</code>
            </div>
            {templateSourceBranch && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0">来源分支</span>
                <code className="truncate font-mono text-foreground/80" title={templateSourceBranch}>{templateSourceBranch}</code>
              </div>
            )}
          </div>
        </div>

        {/* 右区块：需求分支与 MR 流水线（就地闭环操作，min-w-0 防止内容溢出） */}
        <div className="flex flex-col gap-2.5 min-w-0">
          {/* 行 1：需求分支 */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground shrink-0">
                <GitBranchIcon className="size-3.5 text-muted-foreground" />
                <span>需求分支</span>
              </div>
              {developerBranch ? (
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger render={<code className="max-w-64 truncate rounded bg-muted/80 px-2 py-0.5 font-mono text-xs font-semibold text-foreground" />}>
                      {developerBranch}
                    </TooltipTrigger>
                    <TooltipContent className="max-w-96 break-all">{developerBranch}</TooltipContent>
                  </Tooltip>
                  <CopyButton text={developerBranch} label="复制分支名" />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">未配置需求分支</span>
              )}

              {/* 分支状态标签 */}
              {developerBranchState === 'loading' && (
                <Skeleton className="h-5 w-14 rounded" />
              )}
              {developerBranchState === 'exists' && (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckIcon className="size-3" />已存在
                </span>
              )}
              {developerBranchState === 'error' && (
                <span className="text-xs text-destructive">分支查询失败</span>
              )}
              {developerBranchState === 'missing' && branchDisabledReason && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {branchDisabledReason}
                </span>
              )}
            </div>

            {/* 操作位：直接紧挨着需求分支！如果未创建且允许，直接创建 */}
            {developerBranchState === 'missing' && !branchDisabledReason && (
              <WriteOpButton
                label="创建分支"
                title={`创建需求分支 ${developerBranch}`}
                variant="default"
                onAction={createDeveloperBranch}
              />
            )}
          </div>

          {/* 行 2：合并请求（紧凑 List 形式，最多展示 2 条，点击内联就地展开检视与合入） */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <GitPullRequestIcon className="size-3.5 text-muted-foreground" />
                <span>合并请求</span>
                {sortedMergeRequests.length > 0 && (
                  <span className="rounded-full bg-muted/80 px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
                    {sortedMergeRequests.length}
                  </span>
                )}
              </div>

              {/* 操作位：若有需求分支且未发起针对当前基准分支的 MR，提供创建按钮 */}
              {developerBranchState === 'exists' && !mergeRequestExists && (
                <WriteOpButton
                  label="创建 MR"
                  title={`创建 MR：${developerBranch} → ${operationBaseBranch}`}
                  variant="outline"
                  disabled={Boolean(mergeRequestDisabledReason)}
                  disabledReason={mergeRequestDisabledReason}
                  onAction={async () => {
                    setCreateMrOpen(true);
                  }}
                />
              )}
            </div>

            {/* List 列表主体 */}
            {sortedMergeRequests.length === 0 ? (
              <div className="py-1 text-xs text-muted-foreground">
                {developerBranchState === 'exists' ? (
                  <span>暂无关联的合并请求，可点击右上角创建</span>
                ) : (
                  <span>目标：<code className="font-mono text-foreground/80">{operationBaseBranch || '—'}</code>（需先创建需求分支）</span>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 min-w-0">
                {displayedMergeRequests.map((mr) => (
                  <MrInlineItem
                    key={mr.localId}
                    mr={mr}
                    repoId={repo.id}
                    repoPathWithNamespace={repo.pathWithNamespace}
                    isExpanded={expandedMrId === mr.localId}
                    onToggle={() =>
                      setExpandedMrId((prev) => (prev === mr.localId ? null : mr.localId))
                    }
                    onRefresh={() => void loadTrace()}
                    onCreateMr={() => setCreateMrOpen(true)}
                  />
                ))}

                {/* 超过 2 个时提供“展开/收起” */}
                {hasMoreMergeRequests && (
                  <button
                    type="button"
                    onClick={() => setShowAllMrs((prev) => !prev)}
                    className="flex items-center justify-center gap-1 py-1 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                  >
                    <span>
                      {showAllMrs
                        ? '收起其他合并请求'
                        : `展开其余 ${sortedMergeRequests.length - 2} 个合并请求`}
                    </span>
                    <ChevronDownIcon
                      className={cn(
                        'size-3.5 transition-transform duration-200',
                        showAllMrs && 'rotate-180',
                      )}
                    />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 分支分叉检测（若已存在分支） */}
          {templateEnabled && developerBranchState === 'exists' && (
            <div className="px-1">
              <BranchDivergenceCheck
                repoId={repo.id}
                developmentBranch={developerBranch}
                baselineBranch={baselineBranch}
                baselineState={baselineState}
                onRetryBaseline={onRetryBaseline}
              />
            </div>
          )}

          {/* 其他匹配到的分支（追溯结果） */}
          {(loadingBranches || shownMatchedBranches.length > 0) && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border/30 bg-muted/10 p-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <GitForkIcon className="size-3.5" />
                <span>其他关联分支（追溯）：</span>
              </div>
              {loadingBranches ? (
                <Skeleton className="h-5 w-28 rounded" />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {shownMatchedBranches.map((branch) => (
                    <div key={`${branch}:${baselineBranch ?? ''}`} className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{branch}</code>
                      <CopyButton text={branch} label="复制分支名" />
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
                  {hiddenMatchedBranchCount > 0 && (
                    <span className="text-xs text-muted-foreground">…还有 {hiddenMatchedBranchCount} 个匹配分支</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <RepositoryCiDetails repo={repo} open={ciDetailsOpen} onOpenChange={setCiDetailsOpen} />

      <CreateMrDialog
        open={createMrOpen}
        onOpenChange={setCreateMrOpen}
        repoId={repo.id}
        repoName={repo.pathWithNamespace || repo.name}
        identifier={identifier}
        subject={subject}
        sourceBranch={developerBranch}
        targetBranch={operationBaseBranch}
        onSuccess={() => {
          setCreatedMergeRequestKey(mergeRequestKey);
          void loadTrace();
        }}
      />
    </div>
  );
}
