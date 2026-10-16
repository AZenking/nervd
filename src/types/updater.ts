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

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'up_to_date' | 'error';
