import { useUpdater } from '@/store/updater';

/**
 * 应用一键检查与更新状态 Hook
 */
export function useAppUpdate() {
  const status = useUpdater((s) => s.status);
  const updateInfo = useUpdater((s) => s.updateInfo);
  const progress = useUpdater((s) => s.progress);
  const error = useUpdater((s) => s.error);
  const lastCheckedAt = useUpdater((s) => s.lastCheckedAt);
  const checkForUpdates = useUpdater((s) => s.checkForUpdates);
  const startOneClickUpdate = useUpdater((s) => s.startOneClickUpdate);
  const openDownload = useUpdater((s) => s.openDownload);
  const dismissUpdate = useUpdater((s) => s.dismissUpdate);

  const hasUpdate =
    (status === 'available' || status === 'downloading' || status === 'installing' || status === 'done') &&
    Boolean(updateInfo?.hasUpdate);
  const isChecking = status === 'checking';
  const isDownloading = status === 'downloading';
  const isInstalling = status === 'installing';
  const isUpdating = isDownloading || isInstalling;

  return {
    status,
    hasUpdate,
    isChecking,
    isDownloading,
    isInstalling,
    isUpdating,
    updateInfo,
    progress,
    error,
    lastCheckedAt,
    checkForUpdates,
    startOneClickUpdate,
    openDownload,
    dismissUpdate,
  };
}
