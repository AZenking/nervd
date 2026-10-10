import { ChevronRightIcon } from 'lucide-react';
import type { RepositoryTraceResult } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyHint } from '../empty-hint';

/** 提交行：短 sha + 首行消息，Tooltip 展示作者与时间 */
function CommitRow({ sha, message, authorName, committedDate }: {
  sha: string; message: string; authorName?: string; committedDate?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/35 px-2.5 py-2 text-xs" />
        }
      >
        <span className="shrink-0 font-mono text-muted-foreground">{sha.slice(0, 7)}</span>
        <span className="min-w-0 truncate text-foreground">{message.split('\n')[0]}</span>
      </TooltipTrigger>
      <TooltipContent>{`${authorName ?? ''} ${committedDate ?? ''}`}</TooltipContent>
    </Tooltip>
  );
}

/**
 * 关联提交折叠卡（低频信息，默认收起）：承接原追溯链路浮层中唯一不重复的提交明细。
 * 数据与「需求关联分支」同源（workitem trace），不新增请求。
 */
export function RelatedCommitsCard({
  repoTraces,
  repositories,
}: {
  repoTraces: RepositoryTraceResult[];
  repositories: { id: number; name: string; pathWithNamespace?: string }[];
}) {
  const total = repoTraces.reduce((sum, repo) => sum + repo.commits.length, 0);
  return (
    <Collapsible defaultOpen={false} render={<Card />}>
      <CardHeader>
        <div>
          <CardTitle>关联提交{total ? `（${total}）` : ''}</CardTitle>
          <CardDescription className="mt-1">
            按工作项标识匹配的各仓库提交（与需求关联分支同一次扫描，可在低频需要时展开查看）。
          </CardDescription>
        </div>
        <CardAction>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            <ChevronRightIcon className="transition-transform duration-200 group-data-panel-open/collapsible:rotate-90" />
            展开 / 收起
          </CollapsibleTrigger>
        </CardAction>
      </CardHeader>
      <CollapsibleContent>
        <CardContent className="flex flex-col gap-4">
          {repoTraces.map((repoTrace) => {
            const repo = repositories.find((item) => item.id === repoTrace.repoId);
            const name = repo?.pathWithNamespace || repo?.name || `仓库 #${repoTrace.repoId}`;
            return (
              <div key={repoTrace.repoId} className="flex flex-col gap-1.5">
                <div className="truncate font-mono text-xs font-semibold text-foreground">{name}</div>
                {repoTrace.commits.map((commit) => (
                  <CommitRow
                    key={commit.sha}
                    sha={commit.sha}
                    message={commit.message}
                    authorName={commit.authorName}
                    committedDate={commit.committedDate}
                  />
                ))}
                {!repoTrace.commits.length && (
                  <span className="px-2 text-xs text-muted-foreground">无关联提交</span>
                )}
              </div>
            );
          })}
          {!total && (
            <EmptyHint title="暂无关联提交" description="按工作项标识匹配；确认提交信息包含需求编号后可点「重扫」所在操作触发刷新。" />
          )}
        </CardContent>
      </CollapsibleContent>
    </Collapsible>
  );
}
