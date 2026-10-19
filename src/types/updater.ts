/**
 * nervd 客户端更新检查契约类型
 */
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt?: string | null;
  downloadUrl?: string | null;
  htmlUrl?: string | null;
}

export interface UpdateProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  status: 'downloading' | 'installing' | 'done' | 'error';
  message?: string | null;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up_to_date'
  | 'downloading'
  | 'installing'
  | 'done'
  | 'error';

