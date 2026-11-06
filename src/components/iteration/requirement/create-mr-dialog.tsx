import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowRightIcon, GitPullRequestIcon, Loader2Icon, SparklesIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { aiGenerateBugMergeContext, aiGenerateMergeRequest, getAiSettings } from '@/lib/ai-api';
import { markdownToHtml, sanitizeForYunxiao } from '@/lib/richtext';
import { comparisonCommits } from '../BranchDivergenceCheck';
import { mergeRequestRows, mergeRequestBranch } from './types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select';
import { WriteOpButton } from '@/components/WriteOpButton';

function parseBranchList(value: unknown): string[] {
  const collect = (input: unknown): string[] => {
    if (Array.isArray(input)) {
      return input.flatMap((item) => {
        if (typeof item === 'string') return [item];
        if (!item || typeof item !== 'object') return [];
        const record = item as Record<string, unknown>;
        const name = record.name ?? record.branchName ?? record.branch_name;
        return typeof name === 'string' ? [name] : [];
      });
    }
    if (!input || typeof input !== 'object') return [];
    const record = input as Record<string, unknown>;
    for (const key of ['branches', 'items', 'data', 'result']) {
      if (record[key] !== undefined) {
        const names = collect(record[key]);
        if (names.length) return names;
      }
    }
    return [];
  };
  return [...new Set(collect(value).map((name) => name.trim()).filter(Boolean))].sort();
}

/** 缺陷页发起 MR 的上下文：自动补充缺陷单号与所属需求，AI 生成修改说明并在创建后发布测试影响范围 */
export interface CreateMrBugContext {
  bugWorkitemId: string;
  bugIdentifier: string;
  bugSubject: string;
  requirementIdentifier: string;
  requirementSubject: string;
}

export interface CreateMrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: number;
  repoName: string;
  identifier: string;
  subject: string;
  sourceBranch?: string;
  targetBranch?: string;
  availableBranches?: string[];
  /** 缺陷上下文：源分支 = 缺陷单号分支，目标分支 = 需求单号分支（由调用方解析） */
  bugContext?: CreateMrBugContext;
  onSuccess?: (info: { localId?: number; sourceBranch: string; targetBranch: string }) => void;
  onNavigateToMr?: (localId: number) => void;
}

export function CreateMrDialog({
  open,
  onOpenChange,
  repoId,
  repoName,
  identifier,
  subject,
  sourceBranch: initialSourceBranch = '',
  targetBranch: initialTargetBranch = '',
  availableBranches = [],
  bugContext,
  onSuccess,
  onNavigateToMr,
}: CreateMrDialogProps) {
  const [sourceBranch, setSourceBranch] = useState(initialSourceBranch);
  const [targetBranch, setTargetBranch] = useState(initialTargetBranch);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // 异步防竞态与脏检查的最新值镜像（手动点击与「打开即自动生成」共用，规避闭包过期值）
  const branchesRef = useRef({ source: '', target: '' });
  const openRef = useRef(false);
  const userEditedRef = useRef(false);
  branchesRef.current = { source: sourceBranch, target: targetBranch };
  openRef.current = open;
  // 缺陷上下文：最近一次 AI 生成产出的测试影响范围（MR 创建成功后发布到缺陷自身动态）
  const bugImpactScopeRef = useRef('');

  // 当弹窗打开时初始化表单
  useEffect(() => {
    if (open) {
      const src = initialSourceBranch.trim();
      const tgt = initialTargetBranch.trim();
      setSourceBranch(src);
      setTargetBranch(tgt);
      setTitle(`${identifier} ${subject}`.trim());
      const workitemSection = bugContext
        ? `### 关联缺陷\n${identifier} ${subject}\n\n### 所属需求\n${bugContext.requirementIdentifier} ${bugContext.requirementSubject}`
        : `### 关联工作项\n${identifier} ${subject}`;
      setDescription(`${workitemSection}\n\n### 变更分支\n${src || '（未选择）'} -> ${tgt || '（未选择）'}`);
      setRemoteBranches(availableBranches);
      userEditedRef.current = false;
      bugImpactScopeRef.current = '';

      // 异步补拉仓库远端分支列表
      setLoadingBranches(true);
      void api.listBranches(repoId, undefined, 1, 100)
        .then((res) => {
          const names = parseBranchList(res);
          setRemoteBranches((prev) => [...new Set([...prev, ...names])].sort());
        })
        .catch(() => {
          // 容错处理
        })
        .finally(() => setLoadingBranches(false));

      // 缺陷上下文 + AI 已配置：打开即自动生成修改说明（失败保留默认预填，仅提示）
      if (bugContext) {
        void (async () => {
          try {
            const aiSettings = await getAiSettings();
            if (!aiSettings.hasApiKey || !openRef.current) return;
            await runAiGenerate();
          } catch (err) {
            toast.add({ title: 'AI 自动生成修改说明失败', description: String(err), type: 'info' });
          }
        })();
      }
    }
  // bugContext 对象随渲染重建，这里只依赖稳定原始值
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, identifier, subject, initialSourceBranch, initialTargetBranch, availableBranches, repoId, bugContext?.bugWorkitemId, bugContext?.requirementIdentifier]);

  // 合并全部可选分支（保证当前选中的分支即使在初始列表中没有也可见）
  const branchOptions = useMemo<SearchableSelectOption<string>[]>(() => {
    const set = new Set(remoteBranches);
    if (sourceBranch.trim()) set.add(sourceBranch.trim());
    if (targetBranch.trim()) set.add(targetBranch.trim());
    if (initialSourceBranch.trim()) set.add(initialSourceBranch.trim());
    if (initialTargetBranch.trim()) set.add(initialTargetBranch.trim());

    return Array.from(set)
      .filter(Boolean)
      .sort()
      .map((b) => ({ label: b, value: b }));
  }, [remoteBranches, sourceBranch, targetBranch, initialSourceBranch, initialTargetBranch]);

  // 分支变动时更新默认描述中的分支占位
  const handleSourceChange = (val: string | null) => {
    const nextSrc = val ?? '';
    setSourceBranch(nextSrc);
    setDescription((prev) => {
      if (prev.includes('### 变更分支')) {
        return prev.replace(/### 变更分支\n[^\n]+ -> [^\n]+/, `### 变更分支\n${nextSrc || '（未选择）'} -> ${targetBranch || '（未选择）'}`);
      }
      return prev;
    });
  };

  const handleTargetChange = (val: string | null) => {
    const nextTgt = val ?? '';
    setTargetBranch(nextTgt);
    setDescription((prev) => {
      if (prev.includes('### 变更分支')) {
        return prev.replace(/### 变更分支\n[^\n]+ -> [^\n]+/, `### 变更分支\n${sourceBranch || '（未选择）'} -> ${nextTgt || '（未选择）'}`);
      }
      return prev;
    });
  };

  /** AI 生成（通用 / 缺陷上下文共用）：读取 refs 最新值做防竞态与脏检查，结果可安全用于「打开即自动生成」 */
  const runAiGenerate = async () => {
    const reqSource = branchesRef.current.source.trim();
    const reqTarget = branchesRef.current.target.trim();
    if (!reqSource || !reqTarget) {
      toast.add({ title: '请先选定源分支和目标分支', type: 'warning' });
      return;
    }
    if (reqSource === reqTarget) {
      toast.add({ title: '源分支和目标分支不能相同', type: 'warning' });
      return;
    }

    setAiGenerating(true);
    try {
      let commitMessages: string[] = [];
      try {
        const compareResult = await api.compareBranches(repoId, reqTarget, reqSource);
        const commits = comparisonCommits(compareResult) as Record<string, unknown>[];
        commitMessages = commits
          .map((c) => (typeof c.message === 'string' ? c.message.trim() : ''))
          .filter(Boolean);
      } catch {
        // compare 失败时回退直接生成
      }

      if (bugContext) {
        // 缺陷上下文：一次生成 标题 + 修改说明 + 测试影响范围
        const draft = await aiGenerateBugMergeContext({
          bugIdentifier: bugContext.bugIdentifier || identifier,
          bugSubject: bugContext.bugSubject || subject,
          requirementIdentifier: bugContext.requirementIdentifier,
          requirementSubject: bugContext.requirementSubject,
          sourceBranch: reqSource,
          targetBranch: reqTarget,
          commits: commitMessages,
        });

        // 异步防竞态：弹窗已关闭或分支已变更，放弃静默覆盖
        if (!openRef.current
          || branchesRef.current.source.trim() !== reqSource
          || branchesRef.current.target.trim() !== reqTarget) {
          toast.add({ title: '分支已更改，已丢弃旧分支的 AI 生成结果', type: 'info' });
          return;
        }
        if (userEditedRef.current) {
          toast.add({
            title: '已由 AI 生成修改说明',
            description: '检测到您在生成期间有新编辑，如需覆盖可再次点击生成。',
            type: 'info',
          });
          return;
        }
        setTitle(draft.title);
        setDescription(draft.description);
        bugImpactScopeRef.current = draft.testImpactScope.trim();
        toast.add({ title: '已由 AI 生成修改说明与测试影响范围', type: 'success' });
        return;
      }

      const draft = await aiGenerateMergeRequest({
        identifier,
        subject,
        sourceBranch: reqSource,
        targetBranch: reqTarget,
        commits: commitMessages,
      });

      if (!openRef.current
        || branchesRef.current.source.trim() !== reqSource
        || branchesRef.current.target.trim() !== reqTarget) {
        toast.add({ title: '分支已更改，已丢弃旧分支的 AI 生成结果', type: 'info' });
        return;
      }
      if (userEditedRef.current) {
        toast.add({
          title: '已由 AI 生成描述',
          description: '检测到您在生成期间有新编辑，如需覆盖可再次点击生成。',
          type: 'info',
        });
        return;
      }

      setTitle(draft.title);
      setDescription(draft.description);
      toast.add({
        title: '已由 AI 生成规范 MR 标题与结构化描述',
        type: 'success',
      });
    } catch (err) {
      toast.add({
        title: 'AI 拟定 MR 失败',
        description: String(err),
        type: 'error',
      });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSubmit = async () => {
    const src = sourceBranch.trim();
    const tgt = targetBranch.trim();
    const trimmedTitle = title.trim();

    if (!src) {
      toast.add({ title: '请选择源分支 (Source Branch)', type: 'warning' });
      return;
    }
    if (!tgt) {
      toast.add({ title: '请选择目标分支 (Target Branch)', type: 'warning' });
      return;
    }
    if (src === tgt) {
      toast.add({ title: '源分支和目标分支不能相同', type: 'warning' });
      return;
    }
    if (!trimmedTitle) {
      toast.add({ title: '请输入 MR 标题', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      // 提交前重新拉取同一分支对的活跃 MR，防重复提交
      try {
        const rawMrs = await api.listMergeRequests(repoId);
        const rows = mergeRequestRows(rawMrs);
        const existingActiveMr = rows.find((request) => {
          const reqSrc = mergeRequestBranch(request, 'sourceBranch', 'source_branch');
          const reqTgt = mergeRequestBranch(request, 'targetBranch', 'target_branch');
          const st = String(request.state ?? '').toLowerCase();
          const isInactive = st === 'merged' || st === 'closed';
          return !isInactive && reqSrc === src && reqTgt === tgt;
        });

        if (existingActiveMr) {
          const activeLocalId = Number(existingActiveMr.localId ?? existingActiveMr.local_id ?? 0);
          toast.add({
            title: `该分支对已存在进行中的 MR (!${activeLocalId})`,
            description: `${src} → ${tgt} 正在审核中，请勿重复创建。`,
            type: 'warning',
            actionProps: onNavigateToMr && activeLocalId > 0 ? {
              children: `查看 !${activeLocalId}`,
              onClick: () => {
                onOpenChange(false);
                onNavigateToMr(activeLocalId);
              },
            } : undefined,
          });
          return;
        }
      } catch {
        // 查询失败不阻塞创建
      }

      const res = await api.createMergeRequest({
        repoId,
        title: trimmedTitle,
        sourceBranch: src,
        targetBranch: tgt,
        description: description.trim(),
      }) as Record<string, unknown> | null;

      const createdLocalId = Number(res?.localId ?? res?.local_id ?? res?.id ?? 0) || undefined;

      toast.add({
        title: 'Merge Request 已成功创建',
        description: `${src} → ${tgt}`,
        type: 'success',
      });

      // 缺陷上下文：MR 创建成功后，把 AI 生成的测试影响范围自动补充到缺陷自身动态（best-effort）
      const impactScope = bugImpactScopeRef.current.trim();
      if (bugContext && impactScope) {
        try {
          const html = markdownToHtml(sanitizeForYunxiao(impactScope));
          await api.createWorkitemComment(bugContext.bugWorkitemId, html, 'RICHTEXT');
          toast.add({ title: '测试影响范围已补充至缺陷动态', type: 'success' });
        } catch (commentErr) {
          toast.add({
            title: '测试影响范围评论发布失败',
            description: `${String(commentErr)}（MR 已创建，可手动到缺陷动态补充）`,
            type: 'warning',
          });
        }
      }
      bugImpactScopeRef.current = '';

      onSuccess?.({
        localId: createdLocalId,
        sourceBranch: src,
        targetBranch: tgt,
      });
      onOpenChange(false);
    } catch (err) {
      // 创建失败保留用户已有输入，便于重试
      toast.add({
        title: '创建 Merge Request 失败',
        description: String(err),
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const validationDisabledReason = !sourceBranch.trim()
    ? '请选择源分支'
    : !targetBranch.trim()
      ? '请选择目标分支'
      : sourceBranch.trim() === targetBranch.trim()
        ? '源分支与目标分支不能相同'
        : !title.trim()
          ? '请输入 MR 标题'
          : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl flex flex-col p-5">
        <DialogHeader className="shrink-0 pb-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitPullRequestIcon className="size-4" />
            </span>
            <DialogTitle className="text-base font-semibold">
              创建合并请求 (Merge Request)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            仓库：<span className="font-medium text-foreground">{repoName}</span>
          </DialogDescription>
        </DialogHeader>

        {/* 分支选择区（可搜索、支持自定义输入、支持分页补拉） */}
        <Card>
          <Card.Header className="flex flex-row items-center justify-between gap-2 pb-2">
            <Card.Title className="text-xs font-semibold text-foreground">分支流转</Card.Title>
            <Button
              size="xs"
              variant="outline"
              disabled={aiGenerating || submitting || !sourceBranch.trim() || !targetBranch.trim() || sourceBranch === targetBranch}
              onPress={() => void runAiGenerate()}
              className="h-6 text-xs text-primary border-primary/30 hover:bg-primary/10"
              title={bugContext
                ? 'AI 生成 MR 修改说明与测试影响范围（创建成功后自动补充到缺陷动态）'
                : '根据当前分支落差与工作项，AI 智能拟定 MR 标题与说明'}
            >
              {aiGenerating ? (
                <Loader2Icon className="size-3 animate-spin mr-1" />
              ) : (
                <SparklesIcon className="size-3 mr-1 text-primary" />
              )}
              {aiGenerating ? 'AI 生成中…' : bugContext ? 'AI 重新生成' : 'AI 智能拟定描述'}
            </Button>
          </Card.Header>

          <Card.Content className="pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[11px] text-muted-foreground font-mono">源分支 (Source)</span>
                <SearchableSelect
                  value={sourceBranch || null}
                  onValueChange={handleSourceChange}
                  items={branchOptions}
                  placeholder={loadingBranches ? '加载分支中…' : '选择或搜索源分支'}
                  allowCustomValue
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="flex justify-center sm:pt-4">
                <ArrowRightIcon className="size-3.5 text-muted-foreground shrink-0 rotate-90 sm:rotate-0" />
              </div>

              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[11px] text-muted-foreground font-mono">目标分支 (Target)</span>
                <SearchableSelect
                  value={targetBranch || null}
                  onValueChange={handleTargetChange}
                  items={branchOptions}
                  placeholder={loadingBranches ? '加载分支中…' : '选择或搜索目标分支'}
                  allowCustomValue
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </Card.Content>
        </Card>

        {/* 表单内容 */}
        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">MR 标题</label>
            <Input
              value={title}
              onChange={(e) => {
                userEditedRef.current = true;
                setTitle(e.target.value);
              }}
              placeholder="feat(REQ-xxx): 标题"
              disabled={submitting}
              className="h-8 text-xs font-mono bg-background"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">详细变更说明 (Markdown)</label>
            <Textarea
              value={description}
              onChange={(e) => {
                userEditedRef.current = true;
                setDescription(e.target.value);
              }}
              placeholder="变更背景、改动点与自测步骤…"
              rows={7}
              disabled={submitting}
              className="text-xs font-mono bg-background resize-none"
            />
          </div>
        </div>

        {/* 底部操作：使用 WriteOpButton 实施 inline 两段式确认 */}
        <DialogFooter className="shrink-0 pt-3 border-t border-border/60">
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onPress={() => onOpenChange(false)}
            >
              取消
            </Button>
            <WriteOpButton
              label={submitting ? '创建中…' : '确认创建 MR'}
              confirm="inline"
              confirmLabel="再次点击确认创建"
              disabled={Boolean(validationDisabledReason) || submitting}
              disabledReason={validationDisabledReason}
              onAction={handleSubmit}
            />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
