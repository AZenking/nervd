import { useEffect, useMemo, useState } from 'react';
import {
  GitBranchIcon, PencilIcon, XIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { findRemoteBranch } from '@/lib/iteration-branches';
import type { WorkitemChild } from '@/lib/api';
import { extractRichImageUrls, imagePlaceholderLine, richTextToPlain } from '@/lib/richtext';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { CATEGORY_LABELS, type BranchRuleTemplate, type Category, type MrSummary, type RepoSummary } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchableSelect, type SearchableSelectOption } from '../searchable-select';
import { BranchDivergenceCheck } from './BranchDivergenceCheck';
import { JenkinsBuildDialog } from './JenkinsBuildDialog';
import { RepositoryCiDetails } from './RepositoryCiDetails';
import { SubtaskEditDialog } from './SubtaskEditDialog';
import { StatusDot } from '../StatusDot';
import { WriteOpButton } from '../WriteOpButton';

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-sm font-semibold" title={value}>{value}</p>
    </div>
  );
}

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

/** 描述区：纯文本 + 附件图片内联直显（代理失败/未返回时保留 📎 占位行） */
function RichDescription({ raw }: { raw: unknown }) {
  const images = useMemo(() => extractRichImageUrls(raw), [raw]);
  const [resolved, setResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    setResolved({});
    if (!images.length) return;
    void Promise.all(
      images.map(async (img): Promise<[string, string] | null> => {
        try {
          const dataUrl = await api.proxyWorkitemFile(img.url);
          return [img.url, dataUrl];
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const r of results) if (r) next[r[0]] = r[1];
      setResolved(next);
    });
    return () => { alive = false; };
  }, [images]);

  const resolvedPlaceholders = useMemo(
    () => new Set(images.filter((img) => resolved[img.url]).map((img) => imagePlaceholderLine(img.name))),
    [images, resolved],
  );
  const text = useMemo(() => {
    const t = richTextToPlain(raw);
    if (!resolvedPlaceholders.size) return t;
    return t.split('\n').filter((line) => !resolvedPlaceholders.has(line.trim())).join('\n');
  }, [raw, resolvedPlaceholders]);

  return (
    <div>
      <div className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/85">{text || '（无描述）'}</div>
      {images.filter((img) => resolved[img.url]).length > 0 && (
        <div className="mt-4 flex flex-col items-start gap-3">
          {images.filter((img) => resolved[img.url]).map((img) => (
            <img key={img.url} src={resolved[img.url]} alt={img.name} title={img.name} className="h-auto max-h-64 w-auto max-w-full border border-border" />
          ))}
        </div>
      )}
    </div>
  );
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

/** 子工作项/缺陷卡片：真实数据（search 行级 parentId 过滤），点击子项直接打开其详情 */
function ChildrenCard({
  title, description, items, error, debug, onSelect, onEdit,
}: {
  title: string;
  description: string;
  items: WorkitemChild[];
  error?: string | null;
  debug?: string | null;
  onSelect: (workitemId: string) => void;
  onEdit?: (child: WorkitemChild) => void;
}) {
  const labelOf = (category?: string): string | null => {
    const key = (category ?? '').trim();
    return key in CATEGORY_LABELS ? CATEGORY_LABELS[key as Category] : key || null;
  };
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Badge variant="outline">{items.length} 项</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-5">
        {items.map((task) => {
          const label = labelOf(task.category);
          return (
            <div key={task.workitemId} className="flex items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-accent">
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-w-0 flex-1 justify-between gap-3 p-1 text-left font-normal hover:bg-transparent"
                onClick={() => onSelect(task.workitemId)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{task.subject || task.identifier}</span>
                    {label && <Badge variant="outline">{label}</Badge>}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{task.identifier}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {task.assignedTo && <span title="处理人">{task.assignedTo}</span>}
                  {task.status && (
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot status={task.status} />
                      {task.status}
                    </span>
                  )}
                  {task.gmtModified && <span>{task.gmtModified}</span>}
                </div>
              </Button>
              {onEdit && (
                <Button
                  type="button" variant="ghost" size="icon-sm"
                  aria-label={`编辑子任务 ${task.identifier}`}
                  title="编辑名称和状态"
                  onClick={() => onEdit(task)}
                >
                  <PencilIcon className="size-4" />
                </Button>
              )}
            </div>
          );
        })}
        {!items.length && !error && (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
            暂无{title}
          </div>
        )}
        {!items.length && debug && (
          <p className="max-h-20 overflow-y-auto break-all rounded bg-muted/50 px-3 py-2 font-mono text-[10px] leading-4 text-muted-foreground" title="接口原始返回（诊断用）">
            接口返回：{debug}
          </p>
        )}
        {!items.length && error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
            {title}加载失败：{error}
          </div>
        )}
        <p className="text-xs text-muted-foreground">新增请在云效网页端操作（端内创建接口暂未接入）。</p>
      </CardContent>
    </Card>
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
  const { repoCiByRepo, loadTrace, setToast } = useApp();
  const [ciDetailsOpen, setCiDetailsOpen] = useState(false);
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
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
      setToast({ text: String(error), kind: 'fail' });
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
      setToast({ text: String(error), kind: 'fail' });
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
                <code title={branch} className="block max-w-56 truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                  {branch}
                </code>
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
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-1.5 py-1 font-normal"
          title={entry?.error ?? '点击查看 CI Job、构建分支和环境详情'}
          onClick={() => setCiDetailsOpen(true)}
        >
          <span className="inline-flex items-center gap-1.5 text-sm">
            <StatusDot status={snapshot?.status} />
            {snapshot?.status ?? (entry?.loading ? '加载中' : '—')}
          </span>
        </Button>
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {(snapshot?.runs ?? []).length ? `最近 ${snapshot!.runs.length} 次` : '—'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex min-w-max flex-wrap items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCiDetailsOpen(true)}
          >
            CI 详情
          </Button>
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
          <JenkinsBuildDialog
            repoId={repo.id}
            repoName={repo.name}
            defaultBranch={matchedBranches[0] || developerBranch}
          />
        </div>
      </TableCell>
    </TableRow>
    <RepositoryCiDetails repo={repo} open={ciDetailsOpen} onOpenChange={setCiDetailsOpen} />
    </>
  );
}

/** 需求/工作项详情（nervd-new-ui 基准布局 + 真实数据/操作） */
export function RequirementDetails() {
  const {
    selectedId, detail, comments, children, childrenError, childrenDebug, loadingDetail, items, settings, repositories,
    iterations, trace, traceLoading,
    saveWorkitemRepos, saveWorkitemRepoBranchTemplate, setToast, select,
  } = useApp();
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
        return [repoId, { branch, state: 'error' as const, error: String(error) }] as const;
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
      <div className="mt-16 rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
        在侧栏「迭代」分组或迭代页工作项卡片中选择一项以查看详情
      </div>
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
          text: (repoLinked ? '仓库已关联，但分支模板保存失败' : '云效仓库关联保存失败') + '：' + String(error),
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
      setToast({ text: `保存分支模板选择失败：${String(error)}`, kind: 'fail' });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-xl border bg-card px-6 py-5 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-medium text-primary">{cur?.identifier ?? '工作项'} · 详情</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{s('subject') || cur?.subject}</h1>
            <p className="mt-2 text-sm text-muted-foreground">集中管理工作项上下文、交付任务与仓库构建状态</p>
          </div>
          <Badge variant="secondary">{cur?.status || s('status') || '—'}</Badge>
        </div>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>基本信息</CardTitle>
          <CardDescription>负责人、协作关系与代码分支概览</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="编号" value={cur?.identifier ?? '—'} />
          <InfoItem label="状态" value={cur?.status || s('status') || '—'} />
          <InfoItem label="处理人" value={cur?.assignedTo || s('assignedTo') || '—'} />
          <InfoItem label="项目" value={cur?.spaceName || s('spaceName') || '—'} />
          <InfoItem label="更新" value={cur?.updatedAt || s('updatedAt') || '—'} />
          <InfoItem label="云效仓库" value={`${effectiveRepoIds.length} 个`} />
          <InfoItem label="迭代分支" value={iterationBranchValue} />
          <InfoItem label="开发分支约定" value={cur?.identifier ? `feature/${cur.identifier}` : 'feature/<编号>'} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>描述</CardTitle>
          <CardDescription>来自云效的富文本描述与内联附件</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <RichDescription raw={wi.description ?? wi.content} />
        </CardContent>
      </Card>

      {isRequirement && (() => {
        const subtasks = children.filter((c) => c.category !== 'Bug');
        const defects = children.filter((c) => c.category === 'Bug');
        return (
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <ChildrenCard
              title="子任务"
              description="挂载在该需求下的子工作项，点击可打开详情"
              items={subtasks}
              error={childrenError}
              debug={childrenDebug}
              onSelect={(workitemId) => void select(workitemId)}
              onEdit={setEditingChild}
            />
            <ChildrenCard
              title="缺陷"
              description="挂载在该需求下的缺陷，点击可打开详情"
              items={defects}
              error={childrenError}
              debug={childrenDebug}
              onSelect={(workitemId) => void select(workitemId)}
            />
          </div>
        );
      })()}
      {editingChild && selectedId && (
        <SubtaskEditDialog
          child={editingChild}
          parentWorkitemId={selectedId}
          onClose={() => setEditingChild(null)}
        />
      )}

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><GitBranchIcon className="size-4" />关联的云效仓库与代码操作</CardTitle>
              <CardDescription className="mt-1">
                {hasRepoOverride ? '此需求使用单独配置的云效仓库' : '当前使用设置中的默认云效仓库；保存选择后将覆盖默认值'}；可在列表中配置模板并创建开发分支或 MR。
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{effectiveRepoIds.length} 个仓库</Badge>
              {hasRepoOverride && (
                <Button
                  variant="outline" size="sm" disabled={savingRepos}
                  onClick={() => {
                    if (!selectedId) return;
                    setSavingRepos(true);
                    void saveWorkitemRepos(selectedId, null)
                      .then(() => setToast({ text: '已恢复默认云效仓库', kind: 'ok' }))
                      .catch((e) => setToast({ text: `云效仓库关联保存失败：${String(e)}`, kind: 'fail' }))
                      .finally(() => setSavingRepos(false));
                  }}
                >
                  恢复默认
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-5">
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
                <TableHead>CI 状态</TableHead>
                <TableHead>运行记录</TableHead>
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
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                    未关联云效仓库；可在上方选择后关联，或在设置中选择默认云效仓库
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>评论</CardTitle>
          <CardDescription>来自云效的工作项评论</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-5">
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
            <div className="rounded-lg bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">暂无评论</div>
          )}
        </CardContent>
      </Card>

      {settings?.allowWriteOps === false && (
        <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground')}>
          <XIcon className="size-3.5" />
          写操作未开启：设置 → 允许写操作
        </p>
      )}
    </div>
  );
}
