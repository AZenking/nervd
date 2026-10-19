import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UpdateCheckResult, UpdateProgress } from '@/types/updater';
import { APP_VERSION } from '@/lib/app-info';

/**
 * 检查应用版本更新
 * 在 Tauri 环境调用 check_for_updates IPC 命令；
 * 在浏览器预览模式下进行无损降级模拟。
 */
export async function checkForUpdates(customEndpoint?: string | null): Promise<UpdateCheckResult> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (!isTauri) {
    // 浏览器预览模式下模拟环境检查
    return {
      hasUpdate: false,
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      releaseName: `nervd v${APP_VERSION}`,
      releaseNotes: '当前为浏览器预览模式。在 macOS 桌面原生环境下将自动连接 GitHub / CDN 发布通道。',
      publishedAt: new Date().toISOString(),
      downloadUrl: null,
      htmlUrl: 'https://github.com/AZenking/nervd',
    };
  }

  return invoke<UpdateCheckResult>('check_for_updates', {
    customEndpoint: customEndpoint || null,
  });
}

/**
 * 监听一键更新下载/安装进度事件
 */
export async function listenUpdateProgress(
  callback: (progress: UpdateProgress) => void,
): Promise<() => void> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (!isTauri) {
    return () => {};
  }
  return listen<UpdateProgress>('update-progress', (event) => {
    callback(event.payload);
  });
}

/**
 * 触发一键下载并自动安装更新
 */
export async function downloadAndInstallUpdate(downloadUrl: string): Promise<boolean> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (!isTauri) {
    throw new Error('浏览器预览模式不支持一键本地安装，请在 Tauri 桌面端运行');
  }
  return invoke<boolean>('download_and_install_update', { downloadUrl });
}

