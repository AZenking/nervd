import { useEffect, useMemo, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import type { RepoSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { compactFsPath } from '@/lib/utils';

export interface BreakdownRepoPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositories: RepoSummary[];
  onConfirm: (repoIds: number[]) => void;
}

/**
 * AI 拆解上下文仓库选择：需求没有显式关联仓库时，让用户挑本次要读取改动范围的仓库。
 * 只影响本次拆解，不修改需求的关联仓库。
 */
export function BreakdownRepoPicker({
  open,
  onOpenChange,
  repositories,
  onConfirm,
}: BreakdownRepoPickerProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setKeyword('');
  }, [open]);

  const { visibleRepos, truncated } = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const sorted = [...repositories].sort((left, right) =>
      (left.pathWithNamespace || left.name).localeCompare(
        right.pathWithNamespace || right.name,
        'zh-CN',
      ),
    );
    const matched = kw
      ? sorted.filter((repo) =>
        (repo.pathWithNamespace || repo.name).toLowerCase().includes(kw),
      )
      : sorted;
    // 组织仓库可能上千：未搜索时只渲染前 80 个，避免一次性挂载大量行
    const limit = kw ? 100 : 80;
    return { visibleRepos: matched.slice(0, limit), truncated: matched.length > limit };
  }, [keyword, repositories]);

  const toggle = (repoId: number) => {
    setSelected((prev) =>
      prev.includes(repoId) ? prev.filter((id) => id !== repoId) : [...prev, repoId],
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>选择 AI 拆解上下文仓库</DialogTitle>
          <DialogDescription>
            当前需求没有显式关联仓库。请选择本次需要读取改动范围的仓库；仅用于本次 AI 拆解，
            不会修改需求的关联仓库。
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              event.stopPropagation();
            }}
            placeholder="搜索仓库名或路径…"
            className="h-8 pl-8 text-xs"
            aria-label="搜索上下文仓库"
          />
        </div>

        <ScrollArea className="max-h-72">
          <div className="flex flex-col gap-0.5 py-1">
            {truncated && (
              <p className="px-2 pb-1 text-[11px] text-muted-foreground">
                仅显示前 {visibleRepos.length} 个仓库，输入关键词可继续搜索
              </p>
            )}
            {visibleRepos.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                没有匹配的仓库
              </p>
            ) : (
              visibleRepos.map((repo) => {
                const label = repo.pathWithNamespace || repo.name;
                const checked = selected.includes(repo.id);
                return (
                  <div
                    key={repo.id}
                    role="checkbox"
                    aria-checked={checked}
                    tabIndex={0}
                    onClick={() => toggle(repo.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggle(repo.id);
                      }
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span onClick={(event) => event.stopPropagation()}>
                      <Checkbox checked={checked} onCheckedChange={() => toggle(repo.id)} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono" title={label}>
                      {compactFsPath(label, 4)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            已选 {selected.length} 个仓库
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={selected.length === 0}
              onClick={() => {
                onConfirm(selected);
              }}
            >
              使用所选仓库
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}