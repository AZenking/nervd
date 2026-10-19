import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowRightIcon, GitPullRequestIcon, Loader2Icon, SparklesIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { aiGenerateMergeRequest } from '@/lib/ai-api';
import { comparisonCommits } from '../BranchDivergenceCheck';
import { mergeRequestRows, mergeRequestBranch } from './types';
import { Button } from '@/components/ui/button';
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

  // 记录 AI 生成请求时的上下文，用于异步防竞态与脏检查
  const aiContextRef = useRef<{
    source: string;
    target: string;
    initiatedTitle: string;
    initiatedDesc: string;
  } | null>(null);

  // 当弹窗打开时初始化表单
  useEffect(() => {
    if (open) {
      const src = initialSourceBranch.trim();
      const tgt = initialTargetBranch.trim();
      setSourceBranch(src);
      setTargetBranch(tgt);
      setTitle(`${identifier} ${subject}`.trim());
      setDescription(`### 关联工作项\n${identifier} ${subject}\n\n### 变更分支\n${src || '（未选择）'} -> ${tgt || '（未选择）'}`);
      setRemoteBranches(availableBranches);

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
    }
  }, [open, identifier, subject, initialSourceBranch, initialTargetBranch, availableBranches, repoId]);

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

  const handleAiGenerate = async () => {
    if (!sourceBranch.trim() || !targetBranch.trim()) {
      toast.add({ title: '请先选定源分支和目标分支', type: 'warning' });
      return;
    }
    if (sourceBranch.trim() === targetBranch.trim()) {
      toast.add({ title: '源分支和目标分支不能相同', type: 'warning' });
      return;
    }

    setAiGenerating(true);
    const reqSource = sourceBranch.trim();
    const reqTarget = targetBranch.trim();
    aiContextRef.current = {
      source: reqSource,
      target: reqTarget,
      initiatedTitle: title,
      initiatedDesc: description,
    };

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

      const draft = await aiGenerateMergeRequest({
        identifier,
        subject,
        sourceBranch: reqSource,
        targetBranch: reqTarget,
        commits: commitMessages,
      });

      // 异步防竞态检查：若分支已发生变更，或者表单已关闭，放弃静默覆盖
      if (sourceBranch.trim() !== reqSource || targetBranch.trim() !== reqTarget) {
        toast.add({
          title: '分支已更改，已丢弃旧分支的 AI 生成结果',
          type: 'info',
        });
        return;
      }

      // 脏检查：如果用户在生成期间修改了内容，提示并不静默覆盖
      const userEditedDuringGen = (title !== aiContextRef.current?.initiatedTitle)
        || (description !== aiContextRef.current?.initiatedDesc);

      if (userEditedDuringGen) {
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
      aiContextRef.current = null;
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
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground text-xs">分支流转</span>
            <Button
              size="xs"
              variant="outline"
              disabled={aiGenerating || submitting || !sourceBranch.trim() || !targetBranch.trim() || sourceBranch === targetBranch}
              onClick={() => void handleAiGenerate()}
              className="h-6 text-xs text-primary border-primary/30 hover:bg-primary/10"
              title="根据当前分支落差与工作项，AI 智能拟定 MR 标题与说明"
            >
              {aiGenerating ? (
                <Loader2Icon className="size-3 animate-spin mr-1" />
              ) : (
                <SparklesIcon className="size-3 mr-1 text-primary" />
              )}
              {aiGenerating ? 'AI 拟定中…' : 'AI 智能拟定描述'}
            </Button>
          </div>

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
        </div>

        {/* 表单内容 */}
        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">MR 标题</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="feat(REQ-xxx): 标题"
              disabled={submitting}
              className="h-8 text-xs font-mono bg-background"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">详细变更说明 (Markdown)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              onClick={() => onOpenChange(false)}
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
