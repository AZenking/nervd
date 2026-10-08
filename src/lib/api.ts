// Tauri 命令的 invoke 包装（契约 §4）
import { invoke } from '@tauri-apps/api/core';
import type {
  Category, JenkinsConnection, OrgSummary, PipelineRunSummary, RepoCiSnapshot, Settings, SettingsView,
  WorkitemPage, WorkitemSummary,
} from '../types';

/** 列表行 = WorkitemSummary + 后端增补字段 */
export interface WorkitemRow extends WorkitemSummary {
  relatedTo?: string[]; // 关联人姓名（commands.rs names_of 防御式提取）
}

/** 工作流状态选项（list_workitem_status 防御式映射产物） */
export interface WorkitemStatusOption {
  identifier: string;
  name: string;
  stageName: string;
}

/** PipelineRunSummary 扩展行（types.ts 不可改，扩展字段在 api.ts 内定义）：
 *  branches 由 Rust list_pipeline_runs 映射；pipelineId/pipelineName 由追溯链路增补 */
export interface TracePipelineRun extends PipelineRunSummary {
  branches?: string[];
  pipelineId?: number;
  pipelineName?: string;
}

export async function getSettings(): Promise<SettingsView> {
  return invoke('get_settings');
}
export async function saveSettings(settings: Settings): Promise<SettingsView> {
  return invoke('save_settings', { settings });
}
export async function saveWorkitemRepos(workitemId: string, repoIds: number[] | null): Promise<SettingsView> {
  return invoke('save_workitem_repos', { workitemId, repoIds });
}
export async function savePat(pat: string): Promise<boolean> {
  return invoke('save_pat', { pat });
}
export async function deletePat(): Promise<boolean> {
  return invoke('delete_pat');
}
export async function checkConnection(): Promise<OrgSummary[]> {
  return invoke('check_connection');
}
export async function listProjects(search?: string): Promise<{ id: string; name: string }[]> {
  return invoke('list_projects', { search });
}

export async function listWorkitems(p: {
  category: Category; spaceIdentifier: string; nextToken?: string;
}): Promise<WorkitemPage & { items: WorkitemRow[] }> {
  return invoke('list_workitems', p);
}
export async function getWorkitem(workitemId: string): Promise<Record<string, unknown>> {
  return invoke('get_workitem', { workitemId });
}
export async function listWorkitemComments(workitemId: string): Promise<Record<string, unknown>> {
  return invoke('list_workitem_comments', { workitemId });
}
export async function updateWorkitemStatus(workitemId: string, statusIdentifier: string): Promise<unknown> {
  return invoke('update_workitem_status', { workitemId, statusIdentifier });
}
export async function listWorkitemStatus(category: Category): Promise<WorkitemStatusOption[]> {
  return invoke('list_workitem_status', { category });
}
/** 附件图片代理：Rust 侧校验 host 白名单 / image/* / ≤5MB，成功返回 data: URL */
export async function proxyWorkitemFile(url: string): Promise<string> {
  return invoke('proxy_workitem_file', { url });
}

export async function listRepos(search?: string, page?: number): Promise<{ id: number; name: string; pathWithNamespace?: string; lastActivityAt?: string }[]> {
  return invoke('list_repos', { search, page });
}

export async function saveJenkinsToken(connectionId: string, token: string): Promise<boolean> {
  return invoke('save_jenkins_token', { connectionId, token });
}
export async function deleteJenkinsToken(connectionId: string): Promise<boolean> {
  return invoke('delete_jenkins_token', { connectionId });
}
export async function testJenkinsConnection(connection: JenkinsConnection, token?: string): Promise<string> {
  return invoke('test_jenkins_connection', { connection, token });
}
export async function getJenkinsJob(connectionId: string, jobFullName: string): Promise<{
  name: string; fullName: string; color: string; lastBuild?: { runId: string; status: string };
}> {
  return invoke('get_jenkins_job', { connectionId, jobFullName });
}
export async function getRepoCiSnapshot(repoId: number, maxResults = 5): Promise<RepoCiSnapshot> {
  return invoke('get_repo_ci_snapshot', { repoId, maxResults });
}
export async function triggerRepoCi(repoId: number): Promise<unknown> {
  return invoke('trigger_repo_ci', { repoId });
}
export async function getRepoCiLogs(repoId: number, runId: string): Promise<string> {
  return invoke('get_repo_ci_logs', { repoId, runId });
}

export async function listBranches(repoId: number, search?: string): Promise<Record<string, unknown>> {
  return invoke('list_branches', { repoId, search });
}
export async function createBranch(repoId: number, branchName: string, refName: string): Promise<unknown> {
  return invoke('create_branch', { repoId, branchName, refName });
}
export async function listRepositoryCommits(repoId: number, page?: number): Promise<Record<string, unknown>> {
  return invoke('list_repository_commits', { repoId, page });
}

export async function listMergeRequests(repoId: number, state?: string): Promise<Record<string, unknown>> {
  return invoke('list_merge_requests', { repoId, state });
}
export async function createMergeRequest(p: {
  repoId: number; title: string; sourceBranch: string; targetBranch: string; description?: string;
}): Promise<unknown> {
  return invoke('create_merge_request', p);
}
export async function mergeMergeRequest(repoId: number, localId: number): Promise<unknown> {
  return invoke('merge_merge_request', { repoId, localId });
}

export async function listPipelines(maxResults?: number): Promise<{ pipelineId: number; pipelineName: string; status?: string; updateTime?: string }[]> {
  return invoke('list_pipelines', { maxResults });
}
export async function listPipelineRuns(pipelineId: number, maxResults?: number): Promise<TracePipelineRun[]> {
  return invoke('list_pipeline_runs', { pipelineId, maxResults });
}
export async function getPipelineRun(pipelineId: number, runId: number): Promise<Record<string, unknown>> {
  return invoke('get_pipeline_run', { pipelineId, runId });
}
export async function startPipelineRun(pipelineId: number): Promise<unknown> {
  return invoke('start_pipeline_run', { pipelineId });
}
export async function stopPipelineRun(pipelineId: number, runId: number): Promise<unknown> {
  return invoke('stop_pipeline_run', { pipelineId, runId });
}
export async function getJobLogs(pipelineId: number, runId: number, jobId: number): Promise<string> {
  return invoke('get_job_logs', { pipelineId, runId, jobId });
}
