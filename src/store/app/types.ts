import type { StateCreator } from 'zustand';
import type * as api from '../../lib/api';
import type { WorkitemHighlightSettings } from '../../lib/workitem-highlight';
import type {
  BranchRuleTemplate,
  Category,
  ConnectionState,
  IterationSummary,
  PipelineRunSummary,
  RepoCiBinding,
  RepoCiSnapshot,
  RepoSummary,
  Settings,
  SettingsView,
  TraceResult,
} from '../../types';

export interface Toast {
  text: string;
  kind: 'info' | 'ok' | 'fail';
}

export interface LogViewState {
  title: string;
  text: string;
  repoId?: number;
  runId?: string;
  pipelineId?: number;
  jobId?: number;
  stages?: api.CiStageItem[];
  loadingStages?: boolean;
  nextOffset?: number;
  hasMore?: boolean;
  loading?: boolean;
  error?: string;
}

export type SyncField = 'status' | 'description' | 'assignee';

export interface SyncPending {
  workitemId: string;
  field: SyncField;
  expectedValue: string;
  attempts: number;
  nextRetryAt?: number;
  lastError?: string;
}

export interface RefreshResult {
  status: 'success' | 'partial' | 'fail';
  errors: string[];
}

export interface CoreSlice {
  settings: SettingsView | null;
  connection: ConnectionState;
  booting: boolean;
  toast: Toast | null;
  currentUser: api.CurrentYunxiaoUser | null;
  loadingCurrentUser: boolean;
  workitemHighlight: WorkitemHighlightSettings;
  listFetchedAt: number | null;
  iterationsFetchedAt: number | null;
  detailFetchedAt: number | null;
  ciActiveUntil: number;
  syncPendingByWorkitem: Record<string, SyncPending>;

  init(): Promise<void>;
  loadSettings(): Promise<SettingsView | null>;
  refreshConnection(): Promise<void>;
  loadCurrentUser(): Promise<void>;
  setWorkitemHighlight(patch: Partial<WorkitemHighlightSettings>): void;
  setToast(toast: Toast | null): void;
  saveAll(settings: Settings, pat?: string): Promise<void>;
  markRepoCiActive(durationMs?: number): void;
  revalidateIfStale(maxAgeMs?: number): Promise<void>;
  retryWorkitemSync(workitemId: string, field?: SyncField): Promise<void>;
}

export interface WorkitemsSlice {
  category: Category;
  items: api.WorkitemRow[];
  nextToken: string | null;
  loadingList: boolean;
  revalidatingList: boolean;
  selectedId: string | null;
  detail: Record<string, unknown> | null;
  comments: unknown[];
  children: api.WorkitemChild[];
  childrenError: string | null;
  childrenDebug: string | null;
  loadingDetail: boolean;

  setCategory(category: Category): Promise<void>;
  loadList(next?: boolean): Promise<void>;
  revalidateList(): Promise<void>;
  select(workitemId: string): Promise<void>;
  loadChildren(workitemId: string): Promise<void>;
  reloadComments(workitemId?: string): Promise<void>;
  reloadCurrentDetail(): Promise<RefreshResult>;
  updateWorkitemStatusOptimistic(workitemId: string, newStatus: string, statusId?: string): Promise<boolean>;
  updateWorkitemDescriptionOptimistic(workitemId: string, newDescription: string): Promise<boolean>;
  updateWorkitemAssigneeOptimistic(
    workitemId: string,
    newAssigneeId: string,
    newAssigneeName: string,
  ): Promise<boolean>;
  updateChildStatusOptimistic(workitemId: string, newStatus: string, statusId?: string): Promise<boolean>;
  addOptimisticChild(parentWorkitemId: string, childOrChildren: api.WorkitemChild | api.WorkitemChild[]): void;
}

export interface IterationsSlice {
  iterations: IterationSummary[];
  loadingIterations: boolean;
  loadIterations(): Promise<void>;
}

export interface TraceSlice {
  trace: TraceResult | null;
  traceLoading: boolean;
  repositories: RepoSummary[];
  repoRefreshVersion: Record<number, number>;
  loadTrace(): Promise<RefreshResult>;
  loadRepos(): Promise<void>;
  refreshRepoTrace(repoId: number): Promise<RefreshResult>;
  saveBranchRuleTemplates(templates: BranchRuleTemplate[]): Promise<void>;
  saveWorkitemRepoBranchTemplate(workitemId: string, repoId: number, templateId: string | null): Promise<void>;
  saveWorkitemRepos(workitemId: string, repoIds: number[] | null): Promise<void>;
}

export interface RepoCiSlice {
  repoCiByRepo: Record<number, { loading: boolean; snapshot: RepoCiSnapshot | null; error?: string }>;
  ciRefreshedAt: number | null;
  loadRepoCi(repoId: number, alreadyLoading?: boolean): Promise<void>;
  saveRepoCiBinding(repoId: number, binding: RepoCiBinding | null): Promise<void>;
  refreshAllRepoCi(): Promise<void>;
}

export interface PipelinesSlice {
  pipelines: { pipelineId: number; pipelineName: string; status?: string }[];
  runsByPipeline: Record<number, PipelineRunSummary[]>;
  loadingPipelines: boolean;
  loadPipelines(): Promise<void>;
  loadRuns(pipelineId: number): Promise<void>;
}

export interface LogsSlice {
  logView: LogViewState | null;
  openRepoCiLogs(repoId: number, runId: string, title: string): Promise<void>;
  refreshRepoCiLogs(): Promise<void>;
  openLogs(pipelineId: number, runId: number, jobId: number, title: string): Promise<void>;
  closeLogs(): void;
}

export type AppStore = CoreSlice & WorkitemsSlice & IterationsSlice & TraceSlice & RepoCiSlice & PipelinesSlice & LogsSlice;

export type AppSliceCreator<T> = StateCreator<AppStore, [], [], T>;
