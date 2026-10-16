import { useEffect, useState } from 'react';
import {
  CheckIcon, ChevronDownIcon, Loader2Icon, PlusIcon, RefreshCwIcon, SparklesIcon, Trash2Icon, UserIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { aiBreakdownRequirement } from '@/lib/ai-api';
import type { WorkitemTypeOption } from '@/lib/api';
import type { AiBreakdownItem } from '@/types/ai';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { AiBreakdownTags, TAG_COLORS } from './ai-breakdown-tags';

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
  defaultTags?: string[];
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
  defaultTags = ['前端', '后端', '自测'],
  workitemTypes,
  onCreated,
}: AiBreakdownDialogProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>(defaultTags);
  const [items, setItems] = useState<AiBreakdownItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const fallbackAssignee = {
    id: parentAssigneeId || '',
    name: parentAssigneeName || '负责人',
  };

  const handleGenerate = async (tagsToUse: string[]) => {
    setLoading(true);
    setProgress(null);
    try {
      const generated = await aiBreakdownRequirement(
        parentSubject,
        parentDescription || '',
        tagsToUse,
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
      setSelectedTags(defaultTags);
      void handleGenerate(defaultTags);
    } else {
      setItems([]);
      setProgress(null);
    }
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
      tag: selectedTags[0] || '子任务',
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
    try {
      for (let i = 0; i < toCreate.length; i++) {
        const item = toCreate[i];
        setProgress({ current: i + 1, total: toCreate.length });
        await api.createWorkitemChild(parentWorkitemId, {
          subject: `【${item.tag}】${item.subject.trim()}`,
          workitemTypeId: typeId,
          assignedTo: item.assigneeId || parentAssigneeId,
        });
        successCount++;
      }

      await onCreated();
      toast.add({
        title: '批量创建完成',
        description: `已成功为 ${parentIdentifier} 创建 ${successCount} 个子任务`,
        type: 'success',
      });
      onOpenChange(false);
    } catch (err) {
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
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col p-5 overflow-hidden">
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
            <span className="truncate">{parentSubject}</span>
          </DialogDescription>
        </DialogHeader>

        {/* 维度 Tags 与重新生成控制条 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border/60 py-2.5 shrink-0 bg-muted/20 -mx-5 px-5">
          <AiBreakdownTags
            selectedTags={selectedTags}
            onChange={(tags) => {
              setSelectedTags(tags);
              void handleGenerate(tags);
            }}
          />
          <Button
            size="xs"
            variant="ghost"
            disabled={loading || creating}
            onClick={() => void handleGenerate(selectedTags)}
            className="h-7 text-xs"
          >
            <RefreshCwIcon className={cn('size-3.5 mr-1', loading && 'animate-spin')} />
            {loading ? '正在分析拆解…' : '重新生成'}
          </Button>
        </div>

        {/* 候选子任务清单区 */}
        <div className="flex-1 min-h-0 overflow-y-auto workspace-scroll py-2 flex flex-col gap-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2Icon className="size-6 animate-spin text-primary" />
              <p className="text-xs">正在分析需求语义并拆解工程条目…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <p className="text-xs">未能拆解出任务条目</p>
              <Button size="xs" variant="outline" onClick={() => void handleGenerate(selectedTags)}>
                点击重试
              </Button>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/50 bg-background/50 overflow-hidden">
              {items.map((item) => {
                const color = TAG_COLORS[item.tag] || {
                  bg: 'bg-muted/50',
                  text: 'text-foreground',
                  border: 'border-border',
                };

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-2.5 p-2.5 transition-colors hover:bg-muted/40',
                      !item.selected && 'opacity-60 bg-muted/20',
                    )}
                  >
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={() => toggleItem(item.id)}
                      disabled={creating}
                    />

                    {/* Tag 徽标 */}
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold border',
                        color.bg,
                        color.text,
                        color.border,
                      )}
                    >
                      {item.tag}
                    </span>

                    {/* 可行内编辑的标题 Input */}
                    <Input
                      value={item.subject}
                      onChange={(e) => updateSubject(item.id, e.target.value)}
                      placeholder="子任务名称…"
                      disabled={creating}
                      className="h-7 text-xs flex-1 bg-background"
                    />

                    {/* 选择到人：每行指派人下拉 */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            disabled={creating}
                            className="flex items-center gap-1 shrink-0 rounded px-2 py-1 text-xs border border-border/60 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors max-w-28"
                            title="选择该子任务的处理人"
                          />
                        }
                      >
                        <UserIcon className="size-3 shrink-0" />
                        <span className="truncate">{item.assigneeName || '指定人'}</span>
                        <ChevronDownIcon className="size-2.5 opacity-60 shrink-0" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-44 max-h-56 overflow-y-auto">
                        <div className="px-2 py-1 text-[11px] text-muted-foreground font-medium border-b border-border/40">
                          选择任务处理人
                        </div>
                        {candidateAssignees.length === 0 ? (
                          <div className="px-2 py-2 text-xs text-muted-foreground">暂无可选成员列表</div>
                        ) : (
                          candidateAssignees.map((c) => {
                            const isSelected = item.assigneeId === c.id || item.assigneeName === c.name;
                            return (
                              <DropdownMenuItem
                                key={c.id || c.name}
                                onClick={() => updateAssignee(item.id, c.id, c.name)}
                                className={cn('text-xs cursor-pointer flex items-center justify-between', isSelected && 'font-medium text-primary')}
                              >
                                <span className="truncate">{c.name}</span>
                                {c.role && (
                                  <span className="text-[10px] text-muted-foreground/70 ml-2 shrink-0">{c.role}</span>
                                )}
                              </DropdownMenuItem>
                            );
                          })
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* 删除单个条目 */}
                    <button
                      type="button"
                      disabled={creating}
                      onClick={() => deleteItem(item.id)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                      title="删除此项"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-muted-foreground hover:text-foreground underline cursor-pointer"
                >
                  {items.every((i) => i.selected) ? '全不选' : '全选'}
                </button>

                {candidateAssignees.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer text-xs"
                        />
                      }
                    >
                      <span>批量指派勾选项…</span>
                      <ChevronDownIcon className="size-3 opacity-70" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-44 max-h-56 overflow-y-auto">
                      {candidateAssignees.map((c) => (
                        <DropdownMenuItem
                          key={c.id || c.name}
                          onClick={() => handleBatchAssign(c.id, c.name)}
                          className="text-xs cursor-pointer flex items-center justify-between"
                        >
                          <span>{c.name}</span>
                          {c.role && <span className="text-[10px] text-muted-foreground/70 ml-2">({c.role})</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1 text-primary hover:underline cursor-pointer"
              >
                <PlusIcon className="size-3" />
                新增一条
              </button>
            </div>
          )}
        </div>

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
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button
                size="sm"
                disabled={creating || loading || selectedCount === 0}
                onClick={() => void handleConfirmBatchCreate()}
              >
                {creating ? (
                  <>
                    <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
                    创建中…
                  </>
                ) : (
                  <>
                    <CheckIcon className="size-3.5 mr-1.5" />
                    批量创建至云效
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
