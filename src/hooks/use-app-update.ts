import { useUpdater } from '@/store/updater';

/**
 * 应用一键检查与更新状态 Hook
 */
export function useAppUpdate() {
  const status = useUpdater((s) => s.status);
  const updateInfo = useUpdater((s) => s.updateInfo);
  const error = useUpdater((s) => s.error);
  const lastCheckedAt = useUpdater((s) => s.lastCheckedAt);
  const checkForUpdates = useUpdater((s) => s.checkForUpdates);
  const openDownload = useUpdater((s) => s.openDownload);
  const dismissUpdate = useUpdater((s) => s.dismissUpdate);

  const hasUpdate = status === 'available' && Boolean(updateInfo?.hasUpdate);
  const isChecking = status === 'checking';

  return {
    status,
    hasUpdate,
    isChecking,
    updateInfo,
    error,
    lastCheckedAt,
    checkForUpdates,
    openDownload,
    dismissUpdate,
  };
}
