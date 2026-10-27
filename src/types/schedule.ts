// 定时任务数据契约定义（独立于 src/types.ts 契约保护层）

export type ScheduleActionType =
  | 'jenkins'
  | 'pipeline'
  | 'sync_workitems'
  | 'scan_branches'
  | 'branch_merge';

export type MergeStrategy = 'cautious' | 'aggressive';
export type AggressiveConflictPreference = 'theirs' | 'ours' | 'isolated_pr';

export interface JenkinsScheduleAction {
  type: 'jenkins';
  connectionId: string;
  jobFullName: string;
  parameters?: Record<string, string>;
}

export interface PipelineScheduleAction {
  type: 'pipeline';
  pipelineId: number;
  pipelineName?: string;
}

export interface SyncWorkitemsScheduleAction {
  type: 'sync_workitems';
}

export interface ScanBranchesScheduleAction {
  type: 'scan_branches';
  repoIds?: number[];
}

export interface BranchMergeScheduleAction {
  type: 'branch_merge';
  repoId: number;
  repoName?: string;
  sourceBranch: string;
  targetBranch: string;
  strategy: MergeStrategy; // 谨慎 'cautious'（有冲突就终止） / 激进 'aggressive'（解决冲突且不污染原分支）
  aggressiveConflictPreference?: AggressiveConflictPreference;
}

export type ScheduleAction =
  | JenkinsScheduleAction
  | PipelineScheduleAction
  | SyncWorkitemsScheduleAction
  | ScanBranchesScheduleAction
  | BranchMergeScheduleAction;

export type ScheduleStatus = 'idle' | 'running' | 'success' | 'failed';

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  cron: string; // 5-field cron expression, e.g. "0 2 * * *"
  cronLabel?: string; // 友好中文展示，如 "每天 02:00"
  action: ScheduleAction;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  lastRunAt?: string; // ISO string
  lastStatus?: ScheduleStatus;
  lastDurationMs?: number;
  lastError?: string;
  nextRunAt?: string; // ISO string
  runCount: number;
}

export interface ScheduleExecutionLog {
  id: string;
  taskId: string;
  taskName: string;
  actionType: ScheduleActionType;
  triggerMode: 'scheduled' | 'manual';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: 'success' | 'failed';
  details?: string;
  error?: string;
  // 分支合并专项元数据
  mergeResult?: {
    strategy: MergeStrategy;
    sourceBranch: string;
    targetBranch: string;
    conflictDetected?: boolean;
    conflictResolved?: boolean;
    shadowBranch?: string;
    mrUrl?: string;
    mrId?: number;
  };
}
