// nervd 共享 IPC 类型 —— 由主会话与 docs/ipc-contract.md 同步维护。

export type Category = 'Req' | 'Bug' | 'Task';
export const CATEGORY_LABELS: Record<Category, string> = { Req: '需求', Bug: '缺陷', Task: '任务' };
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
  /** Reusable local branch templates; requirements select one per linked repository. */
  branchRuleTemplates: BranchRuleTemplate[];
  /** Local template selection keyed by work item ID, then repository ID. */
  workitemRepoBranchTemplates: Record<string, Record<string, string>>;
  jenkinsConnections: JenkinsConnection[];
  repoCiBindings: Record<string, RepoCiBinding>;
}

export interface BranchRuleTemplate {
  id: string;
  name: string;
  sourceBranch: string;
  /** Supports {iteration} and {template}; default: iteration/{iteration}/{template}. */
  baselineBranchPattern: string;
  /** Supports {identifier}; default: feature/{identifier}. */
  workitemBranchPattern: string;
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
  | {
      provider: 'jenkins';
      connectionId: string;
      jobFullName: string;
      /** Locally remembered Jenkins job parameter values (for example environment and branch). */
      parameters?: Record<string, string>;
      /** Parameter names selected as the build environment and branch. */
      environmentParameter?: string;
      branchParameter?: string;
    };

export interface JenkinsJobSummary {
  name: string;
  fullName: string;
}

export interface JenkinsJobParameter {
  name: string;
  type?: string;
  defaultValue?: string;
  choices: string[];
}

export interface WorkitemStatusOption {
  id: string;
  name: string;
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

/** 迭代摘要（list_iterations 映射产物；startDate/endDate 为 YYYY-MM-DD，缺失为空串） */
export interface IterationSummary {
  id: string;
  name: string;
  title: string;
  state: string;
  startDate: string;
  endDate: string;
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
  /** Actual parameter values captured from this Jenkins build. */
  parameters?: Record<string, string>;
}

export interface RepoCiSnapshot {
  provider: 'flow' | 'jenkins';
  name: string;
  status?: string;
  runs: CiRunSummary[];
}

export interface JenkinsLogChunk {
  text: string;
  nextOffset: number;
  hasMore: boolean;
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
