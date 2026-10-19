import { create } from 'zustand';
import { toast } from '@/components/ui/toast';
import {
  checkForUpdates as fetchUpdateCheck,
  downloadAndInstallUpdate,
  listenUpdateProgress,
} from '@/lib/updater-api';
import { openExternal } from '@/lib/yunxiao-link';
import type { UpdateCheckResult, UpdateProgress, UpdateStatus } from '@/types/updater';

interface UpdaterState {
  status: UpdateStatus;
  updateInfo: UpdateCheckResult | null;
  progress: UpdateProgress | null;
  error: string | null;
  lastCheckedAt: string | null;
  dismissedVersion: string | null;

  checkForUpdates: (silent?: boolean, customEndpoint?: string | null) => Promise<UpdateCheckResult | null>;
  startOneClickUpdate: () => Promise<void>;
  openDownload: () => Promise<void>;
  dismissUpdate: () => void;
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  status: 'idle',
  updateInfo: null,
  progress: null,
  error: null,
  lastCheckedAt: null,
  dismissedVersion: null,

  checkForUpdates: async (silent = false, customEndpoint = null) => {
    set({ status: 'checking', error: null });

    try {
      const res = await fetchUpdateCheck(customEndpoint);
      const now = new Date().toISOString();

      if (res.hasUpdate) {
        set({
          status: 'available',
          updateInfo: res,
          lastCheckedAt: now,
          error: null,
        });

        if (!silent) {
          toast.add({
            title: `发现新版本 v${res.latestVersion}`,
            description: res.releaseName || '点击“关于”查看更新内容并一键安装。',
            type: 'info',
          });
        }
      } else {
        set({
          status: 'up_to_date',
          updateInfo: res,
          lastCheckedAt: now,
          error: null,
        });

        if (!silent) {
          toast.add({
            title: '已是最新版本',
            description: `nervd v${res.currentVersion} 目前为最新版本，未发现新更新。`,
            type: 'success',
          });
        }
      }

      return res;
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        rawMessage.includes('rate limit') ||
        rawMessage.includes('403') ||
        rawMessage.includes('API rate limit');

      const message = isRateLimit
        ? 'GitHub API 访问频次达到限制（IP 临时受限）。建议稍后重试，或直接访问 Releases 页面下载最新安装包。'
        : rawMessage;

      set({
        status: 'error',
        error: message,
        lastCheckedAt: new Date().toISOString(),
      });

      if (!silent) {
        toast.add({
          title: '检查更新失败',
          description: message,
          type: 'error',
        });
      }

      return null;
    }
  },

  startOneClickUpdate: async () => {
    const { updateInfo } = get();
    const downloadUrl = updateInfo?.downloadUrl;
    if (!downloadUrl) {
      // 若无具体二进制直链，降级打开外链下载
      await get().openDownload();
      return;
    }

    set({
      status: 'downloading',
      error: null,
      progress: {
        percent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        speedBytesPerSec: 0,
        status: 'downloading',
        message: '正在发起连接…',
      },
    });

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listenUpdateProgress((payload) => {
        set({
          progress: payload,
          status:
            payload.status === 'installing'
              ? 'installing'
              : payload.status === 'done'
              ? 'done'
              : 'downloading',
        });
      });

      await downloadAndInstallUpdate(downloadUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({
        status: 'error',
        error: `一键更新失败：${message}`,
      });
      toast.add({
        title: '一键更新失败',
        description: `${message}。已自动为您切换为手动下载。`,
        type: 'error',
      });
      // 失败后引导打开外部下载
      await get().openDownload();
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  },

  openDownload: async () => {
    const { updateInfo } = get();
    const url = updateInfo?.downloadUrl || updateInfo?.htmlUrl;
    if (url) {
      await openExternal(url);
    } else {
      toast.add({
        title: '未找到下载地址',
        description: '请访问 GitHub 仓库 Release 页面手动下载。',
        type: 'error',
      });
    }
  },

  dismissUpdate: () => {
    const { updateInfo } = get();
    if (updateInfo) {
      set({ dismissedVersion: updateInfo.latestVersion, status: 'idle' });
    }
  },
}));
