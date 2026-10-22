import { useEffect } from 'react';
import type { RepoSummary } from '@/types';
import { openBuildWorkbenchFromTrigger } from '@/components/build-workbench/actions';

/**
 * 兼容旧调用方的迁移桥接。
 * 构建详情不再渲染独立 Dialog，所有入口统一进入全局 BuildWorkbenchDrawer。
 */
export function RepositoryCiDetails({
  repo,
  open,
  onOpenChange,
}: {
  repo: RepoSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    if (!open) return;
    openBuildWorkbenchFromTrigger({ kind: 'repo', repoId: repo.id, title: repo.name }, 'runs');
    onOpenChange(false);
  }, [open, onOpenChange, repo.id, repo.name]);

  return null;
}
