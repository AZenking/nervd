// nervd 共享类型 —— 冻结文件，见 docs/ipc-contract.md
// 所有任务不得修改本文件；类型缺口在各自模块内定义。

export type Category = 'Req' | 'Bug' | 'Task';
export type ConnectionState = 'unknown' | 'ok' | 'fail';
export type RunStatus = 'RUNNING' | 'SUCCESS' | 'FAIL' | 'CANCELED' | 'WAITING' | 'OTHER';

export interface Settings {
  organizationId: string;
  defaultSpaceIdentifier: string;
  linkPattern: string;
  watchedRepos: number[];
  allowWriteOps: boolean;
}

export interface SettingsView extends Settings {
  hasPat: boolean;
}

export interface OrgSummary {
  organizationId: string;
  organizationName: string;
  accessLevel?: number;
}

export interface WorkitemPage {
  items: WorkitemSummary[];
  nextToken: string | null;
}

export interface WorkitemSummary {
  identifier: string;      // 如 REQ-1234
  workitemId: string;      // UUID
  subject: string;
  status: string;
  statusStageName?: string;
  assignedTo?: string;
  spaceName?: string;
  updatedAt?: string;
  category: Category;
}

export interface RepoSummary {
  id: number;
  name: string;
  pathWithNamespace?: string;
  lastActivityAt?: string;
}

export interface PipelineSummary {
  pipelineId: number;
  pipelineName: string;
  status?: string;
  updateTime?: string;
}

export interface PipelineRunSummary {
  pipelineRunId: number;
  status: string;
  startTime?: number;
  endTime?: number;
  executorAccountId?: string;
  triggerMode?: number;
}

export interface BranchInfo {
  name: string;
  protected?: boolean;
  commit?: { id?: string; message?: string; committedDate?: string };
}

export interface MrSummary {
  localId: number;
  title: string;
  state: string;
  sourceBranch: string;
  targetBranch: string;
  author?: { name?: string };
  createdAt?: string;
}

export interface CommitSummary {
  sha: string;
  message: string;
  authorName?: string;
  committedDate?: string;
}

export interface TraceResult {
  workitemId: string;
  branches: BranchInfo[];
  commits: CommitSummary[];
  mergeRequests: MrSummary[];
  runs: PipelineRunSummary[];
  scannedAt: number;
}

export interface PipelineRunEvent {
  pipelineId: number;
  pipelineName: string;
  runId: number;
  status: string;
}
