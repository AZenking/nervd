// 变更归属（Change Attribution）共享类型。
//
// 该文件是前端与 Rust 侧 `src-tauri/src/attribution/model.rs` 的契约镜像；
// 冻结契约 `src/types.ts` 不在此列，新增类型一律落在本文件。

export type ChangeEventKind = 'commit' | 'mr' | 'build';
export type ChangeEventSource = 'remote' | 'local' | 'ci';
export type AttributionRelation = 'primary' | 'related' | 'rollup';
export type AttributionConfidence = 'explicit' | 'branch' | 'target' | 'inherited' | 'manual';
export type ActivityPostStatus = 'pending' | 'posted' | 'failed' | 'skipped';
export type HookMode = 'fill' | 'enforce' | 'off';

export interface CommitChangePayload {
  sha: string;
  shortSha: string;
  message: string;
  author?: string;
  committedAt?: number;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  files?: string[];
}

export interface MrChangePayload {
  localId: number;
  state: string;
  sourceBranch: string;
  targetBranch: string;
  author?: string;
  webUrl?: string;
}

export interface BuildChangePayload {
  runId: string;
  provider: 'flow' | 'jenkins';
  status: string;
  durationMs?: number;
  stage?: string;
  webUrl?: string;
}

export type ChangePayload =
  | CommitChangePayload
  | MrChangePayload
  | BuildChangePayload
  | Record<string, unknown>;

export interface ChangeEvent {
  id: string;
  repoId: number;
  repoName?: string;
  kind: ChangeEventKind;
  externalId: string;
  branch?: string;
  targetBranch?: string;
  title: string;
  author?: string;
  occurredAt: number;
  source: ChangeEventSource;
  pushed: boolean;
  backfilled: boolean;
  payload: ChangePayload;
}

export interface WorkitemChange extends ChangeEvent {
  relation: AttributionRelation;
  confidence: AttributionConfidence;
  identifier: string;
  workitemId?: string;
  activityStatus?: ActivityPostStatus;
}

export interface ChangePage {
  items: WorkitemChange[];
  nextBefore?: number;
}

export interface SyncRepoReport {
  repoId: number;
  ok: boolean;
  branches: number;
  commits: number;
  mergeRequests: number;
  error?: string;
}

export interface SyncReport {
  startedAt: number;
  finishedAt: number;
  repos: SyncRepoReport[];
}

export interface AttributionRepoStatus {
  repoId: number;
  lastSyncAt?: number;
  lastError?: string;
  cursor?: string;
}

export interface AttributionStatus {
  lastSyncAt?: number;
  syncing: boolean;
  repos: AttributionRepoStatus[];
}

export interface ResolvedWorkitemRef {
  identifier: string;
  workitemId?: string;
  category?: 'Req' | 'Bug' | 'Task';
  subject?: string;
  parentWorkitemId?: string;
  parentIdentifier?: string;
  error?: string;
}

export interface ActivityPolicy {
  enabled: boolean;
  childMode: 'off' | 'batch' | 'per_event';
  parentMode: 'off' | 'milestone' | 'daily';
  maxPerDay: number;
}

export interface ActivityCandidate {
  eventId: string;
  workitemId: string;
  identifier: string;
  relation: AttributionRelation;
  event: ChangeEvent;
  batchKey?: string;
}

export interface LocalRepoBinding {
  repoId: number;
  path: string;
  remoteUrl?: string;
  defaultBranch?: string;
  hookInstalled: boolean;
  hookMode: HookMode;
  updatedAt: number;
}

export interface LocalRepoInfo {
  path: string;
  isGit: boolean;
  remoteUrl?: string;
  currentBranch?: string;
  headSha?: string;
  dirty: boolean;
  /** 以实际钩子文件为准（存在且由 nervd 管理） */
  hookInstalled?: boolean;
  /** fill | enforce | off；未安装时为 off */
  hookMode?: HookMode;
  hookPath?: string;
  error?: string;
}

export interface ActiveWorkitem {
  repoId: number;
  workitemId: string;
  identifier: string;
  category: 'Req' | 'Bug' | 'Task';
  parentWorkitemId?: string;
  parentIdentifier?: string;
  updatedAt: number;
}

export interface HookStatus {
  installed: boolean;
  mode: HookMode;
  path?: string;
  backupPath?: string;
}

/** 归属覆盖率：有 primary 归属的事件 / 全部事件 */
export interface AttributionCoverage {
  total: number;
  attributed: number;
  unattributed: number;
  ratio: number;
}