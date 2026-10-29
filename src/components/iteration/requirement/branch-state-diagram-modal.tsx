import { lazy, Suspense } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { GitForkIcon } from 'lucide-react';
import type { BranchSyncRepo } from '../BranchStateDiagram';

const BranchStateDiagram = lazy(() => import('../BranchStateDiagram'));

export interface BranchStateDiagramModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requirement: { identifier: string; subject: string };
  repos: BranchSyncRepo[];
}

export function BranchStateDiagramModal({
  open,
  onOpenChange,
  requirement,
  repos,
}: BranchStateDiagramModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[94vw] max-h-[92vh] flex flex-col p-6 gap-4 overflow-hidden">
        <DialogHeader className="pb-2 border-b border-border/50 text-left">
          <div className="flex items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <GitForkIcon className="size-4" />
            </div>
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>分支同步状态图</span>
              {requirement.identifier && (
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  ({requirement.identifier})
                </span>
              )}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            以需求为根的分支树：仓库 → 基准 / 迭代 / 开发分支；绿 / 橙箭头标注各段合并状态（按真实双向比较结果）。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <Suspense
            fallback={(
              <div
                className="flex h-[520px] w-full flex-col items-center justify-center gap-4 rounded-lg border border-border/40 bg-muted/10 p-6"
                aria-hidden
              >
                <Skeleton className="h-9 w-36 rounded-md" />
                <div className="h-6 w-px bg-border/60" />
                <div className="flex items-center gap-8">
                  <Skeleton className="h-9 w-32 rounded-md" />
                  <Skeleton className="h-9 w-32 rounded-md" />
                </div>
              </div>
            )}
          >
            {open && (
              <BranchStateDiagram
                requirement={requirement}
                repos={repos}
              />
            )}
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
