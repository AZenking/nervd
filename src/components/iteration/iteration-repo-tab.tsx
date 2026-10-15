import { useMemo, useState } from 'react';
import { FolderGit2Icon } from 'lucide-react';
import { useApp } from '@/store/app';
import type { RepoSummary } from '@/types';
import { ciProviderLabel, ciStatusText } from '@/lib/ci';
import { EmptyHint } from '@/components/empty-hint';
import { CiSummaryButton } from '@/components/ci-summary-button';
import { RepositoryCiDetails } from './RepositoryCiDetails';
import { KeyboardPagination } from './keyboard-pagination';

const REPO_PAGE_SIZE = 10;

/** 仓库行：按仓库实际绑定的 CI 提供方（Flow / Jenkins）展示状态与运行数 */
export function RepositoryRow({ repo }: { repo: RepoSummary }) {
  const { repoCiByRepo, settings } = useApp();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const entry = repoCiByRepo[repo.id];
  const snapshot = entry?.snapshot;
  const binding = settings?.repoCiBindings?.[String(repo.id)];
  const providerLabel = ciProviderLabel(binding);
  const status = binding
    ? ciStatusText(snapshot?.status, entry)
    : '未配置 CI';
  const runCount = (snapshot?.runs ?? []).length;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetailsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDetailsOpen(true);
          }
        }}
        className="group flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="flex min-w-0 items-center gap-3">
          <FolderGit2Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium text-foreground">
              {repo.pathWithNamespace || repo.name}
            </span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              #{repo.id} · {providerLabel}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <CiSummaryButton
            status={status}
            runCount={binding && runCount ? runCount : 0}
            error={entry?.error}
            tooltip="点击查看 CI 运行记录、日志与构建操作"
            onOpen={() => setDetailsOpen(true)}
          />
        </div>
      </div>
      <RepositoryCiDetails repo={repo} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </>
  );
}

/**
 * 关联仓库与 CI 独立视图（Linear 风格干净卡片）：
 * 包含分页与仓库 CI 详情入口
 */
export function IterationRepoTab() {
  const repositories = useApp((s) => s.repositories);
  const [repoPageIndex, setRepoPageIndex] = useState(1);

  const totalRepoPages = Math.max(1, Math.ceil(repositories.length / REPO_PAGE_SIZE));
  const currentRepoPage = Math.min(repoPageIndex, totalRepoPages);

  const paginatedRepos = useMemo(() => {
    const start = (currentRepoPage - 1) * REPO_PAGE_SIZE;
    return repositories.slice(start, start + REPO_PAGE_SIZE);
  }, [repositories, currentRepoPage]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/70 bg-background overflow-hidden">
        {paginatedRepos.map((repo) => (
          <RepositoryRow key={repo.id} repo={repo} />
        ))}
        {!repositories.length && (
          <EmptyHint
            icon={FolderGit2Icon}
            title="仓库列表为空"
            description="请先在「设置 → 追溯与云效仓库」配置云效连接并选择默认云效仓库"
            className="py-12"
          />
        )}
      </div>
      {totalRepoPages > 1 && (
        <div className="flex items-center justify-between px-2 pt-2 text-xs text-muted-foreground">
          <span className="text-[11px] text-muted-foreground">
            共 {repositories.length} 个仓库（第 {(currentRepoPage - 1) * REPO_PAGE_SIZE + 1} - {Math.min(currentRepoPage * REPO_PAGE_SIZE, repositories.length)}）
          </span>
          <KeyboardPagination
            pageIndex={currentRepoPage}
            totalPages={totalRepoPages}
            onPageChange={setRepoPageIndex}
          />
        </div>
      )}
    </div>
  );
}
