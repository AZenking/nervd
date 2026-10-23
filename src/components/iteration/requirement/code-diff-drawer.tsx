import {
  FileDiffIcon,
  ExternalLinkIcon,
  XIcon,
} from 'lucide-react';
import type { FileDiffItem } from './diff-utils';
import { CodeDiffViewer } from './code-diff-viewer';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

export interface CodeDiffDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  diffs: FileDiffItem[];
  mrUrl?: string;
  onOpenExternal?: (url: string) => void;
  actionNode?: React.ReactNode;
}

export function CodeDiffDrawer({
  open,
  onOpenChange,
  title,
  sourceBranch,
  targetBranch,
  diffs,
  mrUrl,
  onOpenExternal,
  actionNode,
}: CodeDiffDrawerProps) {
  const totalAdditions = diffs.reduce((acc, f) => acc + f.additions, 0);
  const totalDeletions = diffs.reduce((acc, f) => acc + f.deletions, 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="w-[100vw] sm:w-[min(84rem,96vw)] data-[swipe-axis=x]:sm:[--drawer-content-width:min(84rem,96vw)] p-0 flex flex-col h-full bg-background border-l border-border">
        {/* 抽屉头部 */}
        <DrawerHeader className="border-b border-border/60 px-5 py-3.5 bg-muted/20 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                <FileDiffIcon className="size-4 text-primary shrink-0" />
                <DrawerTitle className="text-sm font-semibold truncate text-foreground">
                  {title} · 代码变更
                </DrawerTitle>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {diffs.length} 个文件变动
                </span>
              </div>

              <DrawerDescription className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <span className="text-foreground/90">{sourceBranch}</span>
                <span>→</span>
                <span className="text-foreground/90">{targetBranch}</span>
                {(totalAdditions > 0 || totalDeletions > 0) && (
                  <span className="ml-2 font-medium">
                    <span className="text-emerald-600 dark:text-emerald-400">+{totalAdditions}</span>{' '}
                    <span className="text-rose-600 dark:text-rose-400">-{totalDeletions}</span>
                  </span>
                )}
              </DrawerDescription>
            </div>

            {/* 右侧动作条 */}
            <div className="flex items-center gap-2 shrink-0">
              {actionNode}

              {mrUrl && onOpenExternal && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="gap-1 text-xs h-7 px-2"
                  onClick={() => onOpenExternal(mrUrl)}
                  title="在云效中查看"
                >
                  <span>云效直达</span>
                  <ExternalLinkIcon className="size-3" />
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground rounded-full"
                onClick={() => onOpenChange(false)}
                title="关闭 (Esc)"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>
        </DrawerHeader>

        {/* 抽屉正文 */}
        <div className="flex-1 min-h-0 overflow-hidden p-2 sm:p-3">
          <CodeDiffViewer diffs={diffs} maxInitialFiles={100} className="h-full border-0 rounded-none bg-transparent" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
