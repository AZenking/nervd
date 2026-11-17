import { useEffect, useState } from 'react';
import {
  ChevronDownIcon, Loader2Icon, PlusIcon, RefreshCwIcon, SparklesIcon, Trash2Icon, UserIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { aiBreakdownRequirement } from '@/lib/ai-api';
import { postChildCreationActivity } from '@/lib/child-activity';
import type { WorkitemChild, WorkitemTypeOption } from '@/lib/api';
import { useApp } from '@/store/app';
import type { AiBreakdownItem, BreakdownContext } from '@/types/ai';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { WriteOpButton } from '@/components/WriteOpButton';

export interface AssigneeCandidate {
  id: string;
  name: string;
  avatarUrl?: string;
  role?: string;
}

export interface AiBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentWorkitemId: string;
  parentIdentifier: string;
  parentSubject: string;
  parentDescription?: string;
  parentAssigneeId?: string;
  parentAssigneeName?: string;
  candidateAssignees?: AssigneeCandidate[];
  /** 本次拆解使用的上下文仓库 */
  contextRepoIds: number[];
  /** 从需求标题/描述提取的代码检索关键词 */
  contextKeywords: string[];
  /** 采集所选仓库的改动范围 + 现有代码节选 */
  collectBreakdownContext?: (
    repoIds: number[],
    keywords: string[],
  ) => Promise<BreakdownContext>;
  workitemTypes: WorkitemTypeOption[];
  onCreated: () => Promise<void>;
}

export function AiBreakdownDialog({
  open,
  onOpenChange,
  parentWorkitemId,
  parentIdentifier,
  parentSubject,
  parentDescription,
  parentAssigneeId,
  parentAssigneeName,
  candidateAssignees = [],
  contextRepoIds,
  contextKeywords,
  collectBreakdownContext,
  workitemTypes,
  onCreated,
}: AiBreakdownDialogProps) {
  const [items, setItems] = useState<AiBreakdownItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const addOptimisticChild = useApp((s) => s.addOptimisticChild);
  const reloadComments = useApp((s) => s.reloadComments);

  const fallbackAssignee = {
    id: parentAssigneeId || '',
    name: parentAssigneeName || '负责人',
  };

  const handleGenerate = async () => {
    setLoading(true);
    setProgress(null);
    try {
      const context = collectBreakdownContext
        ? await collectBreakdownContext(contextRepoIds, contextKeywords)
        : { scope: [], code: [] };
      const generated = await aiBreakdownRequirement(
        parentSubject,
        parentDescription || '',
        context.scope,
        context.code,
      );
      // 为拆解结果默认赋予父需求负责人作为初始指派人
      setItems(
        generated.map((item) => ({
          ...item,
          assigneeId: item.assigneeId || fallbackAssignee.id,
          assigneeName: item.assigneeName || fallbackAssignee.name,
        })),
      );
    } catch (err) {
      toast.add({
        title: 'AI 拆解失败',
        description: String(err),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void handleGenerate();
    } else {
      setItems([]);
      setProgress(null);
    }
    // 打开时按当前上下文仓库生成；关闭时清空
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleSelectAll = () => {
    const allSelected = items.length > 0 && items.every((i) => i.selected);
    setItems((prev) => prev.map((i) => ({ ...i, selected: !allSelected })));
  };

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)),
    );
  };

  const updateSubject = (id: string, newSubject: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, subject: newSubject } : i)),
    );
  };

  const updateAssignee = (id: string, aId: string, aName: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, assigneeId: aId, assigneeName: aName } : i)),
    );
  };

  const handleBatchAssign = (aId: string, aName: string) => {
    setItems((prev) =>
      prev.map((i) => (i.selected ? { ...i, assigneeId: aId, assigneeName: aName } : i)),
    );
    toast.add({ title: `已将勾选项指派给：${aName}`, type: 'info' });
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const addItem = () => {
    const newItem: AiBreakdownItem = {
      id: `manual-${Date.now()}`,
      subject: '',
      selected: true,
      assigneeId: fallbackAssignee.id,
      assigneeName: fallbackAssignee.name,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const selectedCount = items.filter((i) => i.selected).length;

  const handleConfirmBatchCreate = async () => {
    const toCreate = items.filter((i) => i.selected && i.subject.trim());
    if (toCreate.length === 0) return;

    setCreating(true);
    setProgress({ current: 0, total: toCreate.length });

    // 默认找 Task 类型
    const taskType = workitemTypes.find((t) => /任务|Task/i.test(t.name)) || workitemTypes[0];
    const typeId = taskType?.id ?? '';

    let successCount = 0;
    const createdChildren: WorkitemChild[] = [];
    try {
      for (let i = 0; i < toCreate.length; i++) {
        const item = toCreate[i];
        setProgress({ current: i + 1, total: toCreate.length });
        const created = await api.createWorkitemChild(parentWorkitemId, {
          subject: item.subject.trim(),
          workitemTypeId: typeId,
          assignedTo: item.assigneeId || parentAssigneeId,
          category: 'Task',
        });
        const completeChild: WorkitemChild = {
          ...created,
          category: created.category || 'Task',
          status: created.status || '待办',
        };
        createdChildren.push(completeChild);
        successCount++;
      }

      if (createdChildren.length > 0) {
        addOptimisticChild(parentWorkitemId, createdChildren);
        // AI 批量拆解：需求动态汇总一条（全部任务概要与状态），best-effort 不阻断
        void postChildCreationActivity(parentWorkitemId, createdChildren, 'Task')
          .then((posted) => {
            if (posted) void reloadComments(parentWorkitemId);
          });
      }
      await onCreated();
      toast.add({
        title: '批量创建完成',
        description: `已成功为 ${parentIdentifier} 创建 ${successCount} 个子任务`,
        type: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      if (createdChildren.length > 0) {
        addOptimisticChild(parentWorkitemId, createdChildren);
        // 部分成功：已创建部分同样汇总补充需求动态
        void postChildCreationActivity(parentWorkitemId, createdChildren, 'Task')
          .then((posted) => {
            if (posted) void reloadComments(parentWorkitemId);
          });
      }
      toast.add({
        title: '批量创建部分失败',
        description: `已创建 ${successCount}/${toCreate.length} 个：${String(err)}`,
        type: 'error',
      });
      await onCreated();
    } finally {
      setCreating(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-5 overflow-hidden">
        <DialogHeader className="shrink-0 pb-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SparklesIcon className="size-4" />
            </span>
            <DialogTitle className="text-base font-semibold">
              AI 智能拆解需求子任务
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
            <span className="font-mono font-medium text-foreground">{parentIdentifier}</span>
            <OverflowTooltip text={parentSubject} className="min-w-0 truncate" />
          </DialogDescription>
        </DialogHeader>

        {/* 上下文与重新生成控制条 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border/60 py-2.5 shrink-0 -mx-5 px-5">
          <span className="text-xs text-muted-foreground">
            上下文仓库：
            {contextRepoIds.length > 0
              ? `${contextRepoIds.length} 个（改动范围 + 现有代码节选）`
              : '未选择（仅按需求描述拆解）'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={loading || creating}
            onPress={() => void handleGenerate()}
          >
            <RefreshCwIcon className={cn('size-3.5 mr-1', loading && 'animate-spin')} />
            {loading ? '正在分析拆解…' : '重新生成'}
          </Button>
        </div>

        {/* 候选子任务清单区 */}
        <ScrollArea className="flex-1 min-h-0 workspace-scroll py-2 flex flex-col gap-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2Icon className="size-6 animate-spin text-primary" />
              <p className="text-xs">正在分析需求语义并拆解工程条目…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <p className="text-xs">未能拆解出任务条目</p>
              <Button size="xs" variant="outline" onPress={() => void handleGenerate()}>
                点击重试
              </Button>
            </div>
          ) : (
            <Card className="flex flex-col divide-y divide-border/40 overflow-hidden">
              {items.map((item) => {
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-2.5 p-2.5 transition-colors hover:bg-surface-secondary',
                      !item.selected && 'opacity-60 bg-surface-secondary/40',
                    )}
                  >
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={() => toggleItem(item.id)}
                      disabled={creating}
                    />

                    {/* 可行内编辑的标题 Input */}
                    <Input
                      value={item.subject}
                      onChange={(e) => updateSubject(item.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Escape' && e.key !== 'Tab') {
                          e.stopPropagation();
                        }
                      }}
                      onKeyUp={(e) => {
                        if (e.key !== 'Escape' && e.key !== 'Tab') {
                          e.stopPropagation();
                        }
                      }}
                      placeholder="子任务名称…"
                      disabled={creating}
                      className="h-7 text-xs flex-1 bg-background"
                    />

                    {/* 选择到人：每行指派人下拉 */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={creating}
                            className="flex items-center gap-1 shrink-0 max-w-28"
                            aria-label="选择该子任务的处理人"
                          />
                        }
                      >
                        <UserIcon className="size-3 shrink-0" />
                        <OverflowTooltip text={item.assigneeName || '指定人'} className="min-w-0 truncate" />
                        <ChevronDownIcon className="size-2.5 opacity-60 shrink-0" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-44 max-h-56"
                        header={
                          <>
                            <div className="px-2 py-1 text-[11px] text-muted-foreground font-medium border-b border-border/40">
                              选择任务处理人
                            </div>
                            {candidateAssignees.length === 0 && (
                              <div className="px-2 py-2 text-xs text-muted-foreground">暂无可选成员列表</div>
                            )}
                          </>
                        }
                      >
                        {candidateAssignees.length > 0 && candidateAssignees.map((c) => {
                            const isSelected = item.assigneeId === c.id || item.assigneeName === c.name;
                            return (
                              <DropdownMenuItem
                                key={c.id || c.name}
                                onSelect={() => updateAssignee(item.id, c.id, c.name)}
                                className={cn('text-xs cursor-pointer flex items-center justify-between', isSelected && 'font-medium text-primary')}
                              >
                                <OverflowTooltip text={c.name} className="min-w-0 truncate" />
                                {c.role && (
                                  <span className="text-[10px] text-muted-foreground/70 ml-2 shrink-0">{c.role}</span>
                                )}
                              </DropdownMenuItem>
                            );
                          })}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* 删除单个条目 */}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={creating}
                            onPress={() => deleteItem(item.id)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="删除此项"
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>删除此项</TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </Card>
          )}

          {!loading && items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onPress={toggleSelectAll}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {items.every((i) => i.selected) ? '全不选' : '全选'}
                </Button>

                {candidateAssignees.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground hover:text-foreground"
                        />
                      }
                    >
                      <span>批量指派勾选项…</span>
                      <ChevronDownIcon className="size-3 opacity-70" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-44 max-h-56">
                      {candidateAssignees.map((c) => (
                        <DropdownMenuItem
                          key={c.id || c.name}
                          onSelect={() => handleBatchAssign(c.id, c.name)}
                          className="text-xs cursor-pointer flex items-center justify-between"
                        >
                          <OverflowTooltip text={c.name} className="min-w-0 truncate" />
                          {c.role && <span className="text-[10px] text-muted-foreground/70 ml-2">({c.role})</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <Button
                type="button"
                variant="tertiary"
                size="sm"
                onPress={addItem}
                className="gap-1"
              >
                <PlusIcon className="size-3" />
                新增一条
              </Button>
            </div>
          )}
        </ScrollArea>

        {/* 底部确认操作栏 */}
        <DialogFooter className="shrink-0 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-muted-foreground font-mono">
              {progress ? (
                <span className="text-primary font-medium">
                  正在创建 ({progress.current}/{progress.total})…
                </span>
              ) : (
                `已选 ${selectedCount} / ${items.length} 项`
              )}
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={creating}
                onPress={() => onOpenChange(false)}
              >
                取消
              </Button>
              <WriteOpButton
                label="批量创建至云效"
                title="批量创建子任务至云效"
                variant="default"
                confirm="inline"
                confirmLabel="再次点击确认创建"
                disabled={creating || loading || selectedCount === 0}
                disabledReason={
                  creating
                    ? '正在创建子任务…'
                    : loading
                      ? '正在生成拆解建议…'
                      : selectedCount === 0
                        ? '请先勾选至少一条子任务'
                        : undefined
                }
                onAction={handleConfirmBatchCreate}
              />
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
