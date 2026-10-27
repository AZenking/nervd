export type LocalTaskStatus = 'todo' | 'in_progress' | 'done' | 'canceled';
export type LocalTaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export interface LocalTaskRepoLink {
  repoId: number;
  repoName: string;
  branchName?: string | null;
}

export interface LocalTask {
  id: string;
  title: string;
  status: LocalTaskStatus;
  repos?: LocalTaskRepoLink[];
  /** @deprecated 向后兼容单仓库字段 */
  repoId?: number | null;
  /** @deprecated 向后兼容单仓库字段 */
  repoName?: string | null;
  /** @deprecated 向后兼容单仓库字段 */
  branchName?: string | null;
  description?: string | null;
  priority: LocalTaskPriority;
  createdAt: number;
  updatedAt: number;
}

export interface CreateLocalTaskPayload {
  id?: string;
  title: string;
  status?: LocalTaskStatus;
  repos?: LocalTaskRepoLink[];
  repoId?: number | null;
  repoName?: string | null;
  branchName?: string | null;
  description?: string | null;
  priority?: LocalTaskPriority;
}

export interface UpdateLocalTaskPayload {
  title?: string;
  status?: LocalTaskStatus;
  repos?: LocalTaskRepoLink[];
  repoId?: number | null;
  repoName?: string | null;
  branchName?: string | null;
  description?: string | null;
  priority?: LocalTaskPriority;
}

