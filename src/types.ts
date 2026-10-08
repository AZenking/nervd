// nervd 共享 IPC 类型 —— 由主会话与 docs/ipc-contract.md 同步维护。

export type Category = 'Req' | 'Bug' | 'Task';
export type ConnectionState = 'unknown' | 'ok' | 'fail';
export type RunStatus = 'RUNNING' | 'SUCCESS' | 'FAIL' | 'CANCELED' | 'WAITING' | 'OTHER';

export interface Settings {
  organizationId: string;
  defaultSpaceIdentifier: string;
  linkPattern: string;
  watchedRepos: number[];
  allowWriteOps: boolean;
  /** Explicit per-requirement repository overrides; presence with [] means no repos. */
  workitemRepos: Record<string, number[]>;
  jenkinsConnections: JenkinsConnection[];
  repoCiBindings: Record<string, RepoCiBinding>;
}

export interface SettingsView extends Settings {
  hasPat: boolean;
  jenkinsConnections: JenkinsConnectionView[];
}

export interface JenkinsConnection {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
}

export interface JenkinsConnectionView extends JenkinsConnection {
  hasToken: boolean;
}

export type RepoCiBinding =
  | { provider: 'flow'; pipelineId: number; pipelineName: string }
  | { provider: 'jenkins'; connectionId: string; jobFullName: string };

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
  repositories: RepositoryTraceResult[];
  branches: BranchInfo[];
  commits: CommitSummary[];
  mergeRequests: MrSummary[];
  runs: PipelineRunSummary[];
  scannedAt: number;
}

export interface RepositoryTraceResult {
  repoId: number;
  branches: BranchInfo[];
  commits: CommitSummary[];
  mergeRequests: MrSummary[];
}

export interface CiRunSummary {
  runId: string;
  status: string;
  startTime?: number;
  durationMs?: number;
  trigger?: string;
}

export interface RepoCiSnapshot {
  provider: 'flow' | 'jenkins';
  name: string;
  status?: string;
  runs: CiRunSummary[];
}

export interface PipelineRunEvent {
  pipelineId: number;
  pipelineName: string;
  runId: number;
  status: string;
}

export interface JenkinsBuildEvent {
  connectionId: string;
  jobFullName: string;
  runId: string;
  status: string;
  repoIds: number[];
}
