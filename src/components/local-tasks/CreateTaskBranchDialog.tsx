import { useEffect, useState } from 'react';
import { GitBranchIcon, Loader2Icon } from 'lucide-react';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/searchable-select';
import { WriteOpButton } from '@/components/WriteOpButton';
import { toast } from '@/components/ui/toast';

interface CreateTaskBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: number;
  repoName: string;
  defaultBranchName?: string;
  onSuccess: (newBranch: string) => void;
}

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

export function CreateTaskBranchDialog({
  open,
  onOpenChange,
  repoId,
  repoName,
  defaultBranchName = '',
  onSuccess,
}: CreateTaskBranchDialogProps) {
  const [branchName, setBranchName] = useState('');
  const [sourceRef, setSourceRef] = useState('master');
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setBranchName(defaultBranchName);
      setBranchesLoading(true);
      void api
        .listBranches(repoId)
        .then((res) => {
          const names = parseBranchList(res);
          setAvailableBranches(names);
          // 智能预选来源分支：优先 master -> main -> 列表中第一项
          if (names.includes('master')) {
            setSourceRef('master');
          } else if (names.includes('main')) {
            setSourceRef('main');
          } else if (names.length > 0) {
            setSourceRef(names[0]);
          }
        })
        .catch(() => {
          setAvailableBranches(['master', 'main']);
        })
        .finally(() => {
          setBranchesLoading(false);
        });
    }
  }, [open, repoId, defaultBranchName]);

  const handleCreate = async () => {
    const trimmed = branchName.trim();
    if (!trimmed) {
      toast.add({ title: '请输入新分支名称', type: 'warning' });
      return;
    }
    if (!sourceRef.trim()) {
      toast.add({ title: '请选择或输入基准分支', type: 'warning' });
      return;
    }

    setCreating(true);
    try {
      await api.createBranch(repoId, trimmed, sourceRef.trim());
      toast.add({
        title: '分支创建成功',
        description: `已在 ${repoName} 基于 ${sourceRef} 发起 ${trimmed}`,
        type: 'success',
      });
      onSuccess(trimmed);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.add({
        title: '发起分支失败',
        description: msg,
        type: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <GitBranchIcon className="size-4 text-primary" />
            <span>发起新分支</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            在 <span className="font-mono font-medium text-foreground">{repoName}</span> 仓库中直接拉取新开发分支。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 新分支名称 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">新分支名称 (Branch Name)</label>
            <div className="relative flex items-center">
              <GitBranchIcon className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="例如: feat/login-service"
                className="pl-8 text-xs font-mono"
                autoFocus
              />
            </div>
          </div>

          {/* 基准来源分支 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">基准来源分支 (Source Branch)</label>
              {branchesLoading && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2Icon className="size-3 animate-spin" />
                  加载分支列表...
                </span>
              )}
            </div>
            {availableBranches.length > 0 ? (
              <SearchableSelect
                className="w-full text-xs font-mono"
                value={sourceRef}
                onValueChange={(val) => val && setSourceRef(val)}
                items={availableBranches.map((b) => ({ label: b, value: b }))}
                placeholder="选择基准分支..."
              />
            ) : (
              <Input
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder="例如: master 或 main"
                className="text-xs font-mono"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            取消
          </Button>
          <WriteOpButton
            label="确认发起"
            variant="default"
            confirm="inline"
            disabled={creating || !branchName.trim() || !sourceRef.trim()}
            onAction={handleCreate}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
