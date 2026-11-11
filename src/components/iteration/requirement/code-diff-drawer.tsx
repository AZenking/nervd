import {
  FileDiffIcon,
  ExternalLinkIcon,
  XIcon,
} from 'lucide-react';
import type { FileDiffItem } from './diff-utils';
import { CodeDiffViewer } from './code-diff-viewer';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { OverflowTooltip } from '@/components/overflow-tooltip';

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
      <DrawerContent className="w-full sm:w-[min(84rem,96vw)] sm:max-w-none flex flex-col h-full bg-background border-l border-border">
        {/* 抽屉头部 */}
        <DrawerHeader className="border-b border-border/60 px-5 py-3.5 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                <FileDiffIcon className="size-4 text-primary shrink-0" />
                <DrawerTitle className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                  <OverflowTooltip
                    text={`${title} · 代码变更`}
                    title={`${title} · 代码变更`}
                    className="block max-w-full truncate"
                  />
                </DrawerTitle>
                <Chip size="sm" variant="soft" className="font-mono text-[10px]">
                  {diffs.length} 个文件变动
                </Chip>
              </div>

              <DrawerDescription className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <span className="text-foreground/90">{sourceBranch}</span>
                <span>→</span>
                <span className="text-foreground/90">{targetBranch}</span>
                {(totalAdditions > 0 || totalDeletions > 0) && (
                  <span className="ml-2 font-medium">
                    <span className="text-success">+{totalAdditions}</span>{' '}
                    <span className="text-danger">-{totalDeletions}</span>
                  </span>
                )}
              </DrawerDescription>
            </div>

            {/* 右侧动作条 */}
            <div className="flex items-center gap-2 shrink-0">
              {actionNode}

              {mrUrl && onOpenExternal && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="gap-1 text-xs h-7 px-2"
                        onPress={() => onOpenExternal(mrUrl)}
                        title="在云效中查看"
                        aria-label="在云效中查看"
                      >
                        <span>云效直达</span>
                        <ExternalLinkIcon className="size-3" />
                      </Button>
                    }
                  />
                  <TooltipContent>在云效中查看</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-foreground rounded-sm"
                      onPress={() => onOpenChange(false)}
                      title="关闭 (Esc)"
                      aria-label="关闭 (Esc)"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  }
                />
                <TooltipContent>关闭 (Esc)</TooltipContent>
              </Tooltip>
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
