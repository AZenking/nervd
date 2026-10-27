export type LocalTaskStatus = 'todo' | 'in_progress' | 'done' | 'canceled';
export type LocalTaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export interface LocalTask {
  id: string;
  title: string;
  status: LocalTaskStatus;
  repoId?: number | null;
  repoName?: string | null;
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
  repoId?: number | null;
  repoName?: string | null;
  branchName?: string | null;
  description?: string | null;
  priority?: LocalTaskPriority;
}

export interface UpdateLocalTaskPayload {
  title?: string;
  status?: LocalTaskStatus;
  repoId?: number | null;
  repoName?: string | null;
  branchName?: string | null;
  description?: string | null;
  priority?: LocalTaskPriority;
}
