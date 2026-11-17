// 变更归属 Tauri 命令包装（契约见 docs/change-attribution.md §5）。
//
// 约定：
// - 前端参数一律 camelCase；Rust 端 snake_case 由 Tauri invoke 自动映射。
// - 这里只做薄包装，不做重试 / toast / 状态管理（由 store / hooks 负责）。
import { invoke } from '@tauri-apps/api/core';
import type {
  ActiveWorkitem,
  ActivityCandidate,
  ActivityPolicy,
  AttributionStatus,
  ChangePage,
  HookMode,
  HookStatus,
  LocalRepoBinding,
  LocalRepoInfo,
  ResolvedWorkitemRef,
  SyncReport,
} from '@/types/attribution';
import type { BranchTrackTopology } from '@/types/branch-topology';

/** 当前是否运行在 Tauri 宿主内（Web 预览下所有 invoke 都不可用）。 */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function syncAttribution(input: {
  repoIds?: number[];
  full?: boolean;
  /** true = 忽略编号解析负缓存，强制重新解析（手动「立即同步」用）。 */
  force?: boolean;
} = {}): Promise<SyncReport> {
  return invoke('sync_attribution', {
    repoIds: input.repoIds,
    full: input.full,
    force: input.force,
  });
}

export async function getAttributionStatus(): Promise<AttributionStatus> {
  return invoke('get_attribution_status');
}

export async function listWorkitemChanges(input: {
  workitemId: string;
  limit?: number;
  before?: number;
  includeRollup?: boolean;
}): Promise<ChangePage> {
  return invoke('list_workitem_changes', {
    workitemId: input.workitemId,
    limit: input.limit,
    before: input.before,
    includeRollup: input.includeRollup,
  });
}

export async function updateWorkitemComment(input: {
  workitemId: string;
  commentId: string;
  content: string;
  formatType?: string;
}): Promise<unknown> {
  return invoke('update_workitem_comment', {
    workitemId: input.workitemId,
    commentId: input.commentId,
    content: input.content,
    formatType: input.formatType,
  });
}

export async function listUnattributedChanges(input: {
  repoId?: number;
  limit?: number;
} = {}): Promise<ChangePage> {
  return invoke('list_unattributed_changes', { repoId: input.repoId, limit: input.limit });
}

export async function assignChangeWorkitem(input: {
  eventId: string;
  workitemId: string;
  relation?: string;
}): Promise<boolean> {
  return invoke('assign_change_workitem', {
    eventId: input.eventId,
    workitemId: input.workitemId,
    relation: input.relation,
  });
}

export async function resolveWorkitemIdentifiers(input: {
  identifiers: string[];
}): Promise<ResolvedWorkitemRef[]> {
  return invoke('resolve_workitem_identifiers', { identifiers: input.identifiers });
}

/** 「我」的身份：写回范围由后端按负责人过滤（父需求 rollup 额外允许协同人/创建人）。 */
export interface ActivityViewer {
  id?: string;
  name?: string;
  /** 设置里声明的别名（花名），仅在姓名匹配时生效 */
  aliases?: string[];
}

export async function listActivityCandidates(
  input: { limit?: number; viewer?: ActivityViewer } = {},
): Promise<ActivityCandidate[]> {
  return invoke('list_activity_candidates', {
    limit: input.limit,
    viewer: input.viewer ?? null,
  });
}

export async function markActivity(input: {
  eventId: string;
  workitemId: string;
  status: 'pending' | 'posted' | 'failed' | 'skipped';
  commentId?: string;
  error?: string;
}): Promise<boolean> {
  return invoke('mark_activity', {
    eventId: input.eventId,
    workitemId: input.workitemId,
    status: input.status,
    commentId: input.commentId,
    error: input.error,
  });
}

export async function getActivityPolicy(): Promise<ActivityPolicy> {
  return invoke('get_activity_policy');
}

export async function saveActivityPolicy(input: { policy: ActivityPolicy }): Promise<ActivityPolicy> {
  return invoke('save_activity_policy', { policy: input.policy });
}

export async function listLocalRepoBindings(): Promise<LocalRepoBinding[]> {
  return invoke('list_local_repo_bindings');
}

export async function saveLocalRepoBinding(input: {
  repoId: number;
  path: string;
}): Promise<LocalRepoBinding> {
  return invoke('save_local_repo_binding', { repoId: input.repoId, path: input.path });
}

export async function deleteLocalRepoBinding(input: { repoId: number }): Promise<boolean> {
  return invoke('delete_local_repo_binding', { repoId: input.repoId });
}

/** 打开系统目录选择器；用户取消时返回 null。 */
export async function pickRepoDirectory(): Promise<string | null> {
  return invoke('pick_repo_directory');
}

export interface LocalRepoCodeContext {
  gitRef: string;
  tree: string[];
  files: Array<{ path: string; content: string; truncated: boolean }>;
}

/** 读取本地仓库现有代码（文件树 + 关键词命中文件），供 AI 拆解分析。 */
export async function readLocalRepoCode(input: {
  repoId: number;
  refName?: string;
  paths?: string[];
  keywords?: string[];
}): Promise<LocalRepoCodeContext> {
  return invoke('read_local_repo_code', {
    repoId: input.repoId,
    refName: input.refName,
    paths: input.paths,
    keywords: input.keywords,
  });
}

export async function inspectLocalRepo(input: { path: string }): Promise<LocalRepoInfo> {
  return invoke('inspect_local_repo', { path: input.path });
}

export async function syncLocalRepo(input: { repoId: number }): Promise<SyncReport> {
  return invoke('sync_local_repo', { repoId: input.repoId });
}

export async function getActiveWorkitem(input: { repoId?: number } = {}): Promise<ActiveWorkitem | null> {
  return invoke('get_active_workitem', { repoId: input.repoId });
}

/** 汇总所有已绑定仓库的活动工作项（活动状态按仓库记录，不再回退到第一个仓库）。 */
export async function listActiveWorkitems(): Promise<ActiveWorkitem[]> {
  return invoke('list_active_workitems');
}

export async function setActiveWorkitem(input: {
  repoId: number;
  workitemId?: string;
  parentWorkitemId?: string;
}): Promise<boolean> {
  return invoke('set_active_workitem', {
    repoId: input.repoId,
    workitemId: input.workitemId,
    parentWorkitemId: input.parentWorkitemId,
  });
}

export async function installCommitMsgHook(input: {
  repoId: number;
  mode?: HookMode;
}): Promise<HookStatus> {
  return invoke('install_commit_msg_hook', { repoId: input.repoId, mode: input.mode });
}

export async function uninstallCommitMsgHook(input: { repoId: number }): Promise<HookStatus> {
  return invoke('uninstall_commit_msg_hook', { repoId: input.repoId });
}

export async function getBranchTrackTopology(input: {
  trackId: string;
}): Promise<BranchTrackTopology> {
  return invoke('get_branch_track_topology', { trackId: input.trackId });
}

export async function saveBranchTrackTopology(input: {
  trackId: string;
  topology: BranchTrackTopology;
}): Promise<BranchTrackTopology> {
  return invoke('save_branch_track_topology', {
    trackId: input.trackId,
    topology: input.topology,
  });
}