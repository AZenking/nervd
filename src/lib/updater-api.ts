import { invoke } from '@tauri-apps/api/core';
import type { UpdateCheckResult } from '@/types/updater';
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
      htmlUrl: 'https://github.com/alibaba/nervd',
    };
  }

  return invoke<UpdateCheckResult>('check_for_updates', {
    customEndpoint: customEndpoint || null,
  });
}
